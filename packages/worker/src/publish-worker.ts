// BullMQ Worker that processes `publish` jobs. Glues together the lifecycle
// service, the Twitter publish service, and the worker-owned rate-limit
// wrapper. The handler is intentionally thin — all the branching logic
// lives in post-lifecycle.service.ts so it can be unit-tested without
// spinning up a real Redis.
//
// No `@sms/api` imports anywhere in this file (revision Blocker 4 /
// T-04-03-10): rate-limit math comes from the local wrapper, which in
// turn delegates to the pure calculator in @sms/shared.
//
// The exported `createPublishHandler` factory lets tests exercise the job
// handler function directly without constructing a real BullMQ Worker.
// `createPublishWorker` wires that handler into the Worker constructor
// with the concurrency / lockDuration / backoff settings Phase 4 needs.

import {
  Worker,
  UnrecoverableError,
  type Job,
  type Queue,
} from 'bullmq';
import type { Redis } from 'ioredis';
import { eq } from 'drizzle-orm';
import { posts, socialProfiles } from '@sms/db';
import {
  QUEUE_NAMES,
  JOB_NAMES,
} from '@sms/shared';
import {
  classifyTwitterError,
  classifyLinkedInError,
  classifyFacebookError,
} from '@sms/shared/lib/error-classifier';
import { createLogger } from '@sms/shared/logger';
import type { WorkerDb } from './db.js';
import { publishPost, PostLifecycleAbort } from './post-lifecycle.service.js';
import { callTwitter } from './twitter-publish.service.js';
import { callLinkedIn } from './linkedin-publish.service.js';
import { callFacebook } from './facebook-publish.service.js';
import {
  checkBudgetForWorker,
  checkLinkedInBudgetForWorker,
  checkFacebookBudgetForWorker,
} from './rate-limit.js';
import { buildBackoffStrategy } from './backoff.js';

export interface PublishJobPayload {
  postId: string;
  postVersion: number;
  correlationId: string;
}

export interface PublishJobResult {
  platformPostId?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface PublishWorkerDeps {
  redis: Redis;
  db: WorkerDb;
  notificationQueue: Queue;
}

export interface PublishHandlerDeps {
  db: WorkerDb;
  notificationQueue: Queue;
  publishPostImpl?: typeof publishPost;
  callTwitterImpl?: typeof callTwitter;
  // Phase 8 — platform dispatcher accepts per-platform publish impls so tests
  // can substitute mocks without spinning up real LinkedIn / Facebook calls.
  callLinkedInImpl?: typeof callLinkedIn;
  callFacebookImpl?: typeof callFacebook;
  checkBudgetImpl?: typeof checkBudgetForWorker;
  checkLinkedInBudgetImpl?: typeof checkLinkedInBudgetForWorker;
  checkFacebookBudgetImpl?: typeof checkFacebookBudgetForWorker;
}

const PUBLISH_WORKER_CONFIG = {
  concurrency: 2,
  lockDuration: 30_000,
  stalledInterval: 30_000,
  maxStalledCount: 1,
} as const;

const DEFAULT_MAX_ATTEMPTS = 4;

/**
 * Pure handler function — exported so unit tests can invoke it directly
 * without standing up a BullMQ Worker. The `createPublishWorker` factory
 * below wraps this in a real Worker.
 */
export function createPublishHandler(deps: PublishHandlerDeps) {
  const baseLogger = createLogger('publish-worker');
  const runPublish = deps.publishPostImpl ?? publishPost;
  const runCallTwitter = deps.callTwitterImpl ?? callTwitter;
  const runCallLinkedIn = deps.callLinkedInImpl ?? callLinkedIn;
  const runCallFacebook = deps.callFacebookImpl ?? callFacebook;
  const runCheckBudget = deps.checkBudgetImpl ?? checkBudgetForWorker;
  const runCheckLinkedInBudget =
    deps.checkLinkedInBudgetImpl ?? checkLinkedInBudgetForWorker;
  const runCheckFacebookBudget =
    deps.checkFacebookBudgetImpl ?? checkFacebookBudgetForWorker;

  return async function handle(
    job: Job<PublishJobPayload>,
  ): Promise<PublishJobResult> {
    const logger = baseLogger.child({
      correlationId: job.data.correlationId,
      postId: job.data.postId,
      jobId: job.id,
      attempt: job.attemptsMade + 1,
    });

    // Track the resolved platform for this run so the catch-block classifier
    // dispatch knows which API's error semantics to apply. Captured by the
    // budget callback (which sees the platform first via the joined profile).
    type SupportedPlatform = 'twitter' | 'linkedin' | 'facebook';
    let resolvedPlatform: SupportedPlatform = 'twitter';

    try {
      const result = await runPublish(deps.db, {
        postId: job.data.postId,
        expectedVersion: job.data.postVersion,
        correlationId: job.data.correlationId,
        currentAttemptNum: job.attemptsMade + 1,
        callTwitter: async (profile, postText, isThread, extras) => {
          // Plan 02 added typed posts.platform / posts.visibility / posts.linkUrl
          // columns. The lifecycle passes them through `extras` so we dispatch
          // here without a second SELECT. Direct field access — no
          // `as Record<string, unknown>` casts (B-01 cascade complete).
          const platform = (extras?.platform ?? profile.platform) as
            | 'twitter'
            | 'linkedin'
            | 'facebook';
          if (platform === 'linkedin') {
            const visibility = (extras?.visibility as
              | 'PUBLIC'
              | 'CONNECTIONS'
              | null
              | undefined) ?? 'PUBLIC';
            return runCallLinkedIn({
              profile,
              postText,
              visibility,
              correlationId: job.data.correlationId,
            });
          }
          if (platform === 'facebook') {
            return runCallFacebook({
              profile,
              postText,
              linkUrl: extras?.linkUrl ?? null,
              correlationId: job.data.correlationId,
            });
          }
          // Default Twitter path — preserves existing wiring exactly.
          return runCallTwitter({
            profile,
            postText,
            isThread,
            correlationId: job.data.correlationId,
          });
        },
        checkBudget: async (profileId: string) => {
          // Resolve the platform from the joined profile so the lifecycle
          // can branch on rate_limit_exhausted vs budget_exhausted, and so
          // the catch-block classifier knows which error semantics apply.
          const [profileRow] = await deps.db
            .select({ platform: socialProfiles.platform })
            .from(socialProfiles)
            .where(eq(socialProfiles.id, profileId));
          const platform = (profileRow?.platform ?? 'twitter') as
            | 'twitter'
            | 'linkedin'
            | 'facebook';
          resolvedPlatform = platform;

          if (platform === 'linkedin') {
            const state = await runCheckLinkedInBudget(deps.db, {
              profileId,
              additionalCount: 1,
            });
            return {
              wouldExceed: state.willExceed,
              blockThresholdHit: state.blockThresholdHit,
              platform,
            };
          }
          if (platform === 'facebook') {
            // POST-FB-02 Pitfall 2 — multi-photo counts each upload + the feed
            // call independently. Phase 8 worker hot path doesn't yet thread
            // mediaIds.length here; the API pre-flight + the worker's runtime
            // re-check are layered defenses. This single-call estimate is
            // conservative and matches Phase 7's existing behavior.
            const state = await runCheckFacebookBudget(deps.db, {
              profileId,
              additionalCount: 1,
            });
            return {
              wouldExceed: state.willExceed,
              blockThresholdHit: state.blockThresholdHit,
              platform,
            };
          }
          const state = await runCheckBudget(deps.db, {
            profileId,
            additionalPostCount: 1,
          });
          return { wouldExceed: state.wouldExceed, platform };
        },
        // TOKEN-04: enables the 401 → `token_revoked` notification emit
        // inside post-lifecycle.service.ts recordFailureAttempt.
        notificationQueue: deps.notificationQueue,
      });

      logger.info(
        { platformPostId: result.platformPostId },
        'Publish succeeded',
      );
      return { platformPostId: result.platformPostId };
    } catch (err) {
      if (err instanceof PostLifecycleAbort) {
        // Graceful aborts never throw to BullMQ — they resolve cleanly so
        // the job does not consume retry budget. The scanner's next pass
        // re-enqueues the post if it is still due.
        if (err.reason === 'already_published') {
          logger.info('Idempotent skip — post already published');
          return { skipped: true, skipReason: err.reason };
        }
        if (
          err.reason === 'version_mismatch' ||
          err.reason === 'budget_exhausted' ||
          err.reason === 'not_scheduled' ||
          err.reason === 'thread_unsupported' ||
          err.reason === 'media_pending' ||
          err.reason === 'token_unhealthy' ||
          err.reason === 'rate_limit_exhausted'
        ) {
          // Phase 07-04 (TOKEN-05) / Phase 8 (LIMIT-06/LIMIT-07):
          // rate_limit_exhausted mirrors budget_exhausted / token_unhealthy —
          // post stays in `scheduled`, no retry budget consumed. The scanner
          // re-enqueues once the platform window resets.
          logger.info(
            { reason: err.reason },
            'Graceful abort — scanner will re-evaluate',
          );
          return { skipped: true, skipReason: err.reason };
        }
      }

      // Phase 8: classifier dispatch by platform — LinkedIn/Facebook errors
      // (LinkedInPublishApiError / FacebookPublishApiError) carry the same
      // ClassifiedError shape as Twitter via @sms/shared classifyXError.
      // The let-binding of `resolvedPlatform` is mutated inside an async
      // closure (the checkBudget callback above). TypeScript's control-flow
      // analysis can't see that mutation from this catch block, so it
      // narrows the variable back to its initial literal type. Re-widen via
      // a string cast — runtime value reflects the closure assignment.
      const platformAtFailure = resolvedPlatform as string;
      const classifier =
        platformAtFailure === 'linkedin'
          ? classifyLinkedInError
          : platformAtFailure === 'facebook'
            ? classifyFacebookError
            : classifyTwitterError;
      const classification = classifier(err);
      if (classification.kind === 'permanent') {
        logger.warn(
          { errorCode: classification.errorCode, httpStatus: classification.httpStatus },
          'Permanent failure — skipping retries',
        );
        throw new UnrecoverableError(classification.message);
      }

      logger.warn(
        { errorCode: classification.errorCode, httpStatus: classification.httpStatus },
        'Transient failure — will retry',
      );
      throw err;
    }
  };
}

export function createPublishWorker({
  redis,
  db,
  notificationQueue,
}: PublishWorkerDeps): Worker<PublishJobPayload, PublishJobResult> {
  const baseLogger = createLogger('publish-worker');
  const handler = createPublishHandler({ db, notificationQueue });

  const worker = new Worker<PublishJobPayload, PublishJobResult>(
    QUEUE_NAMES.publish,
    handler,
    {
      connection: redis,
      concurrency: PUBLISH_WORKER_CONFIG.concurrency,
      lockDuration: PUBLISH_WORKER_CONFIG.lockDuration,
      stalledInterval: PUBLISH_WORKER_CONFIG.stalledInterval,
      maxStalledCount: PUBLISH_WORKER_CONFIG.maxStalledCount,
      settings: {
        backoffStrategy: buildBackoffStrategy(),
      },
    },
  );

  // Failed listener — fires when BullMQ has exhausted retries OR a handler
  // throws UnrecoverableError. Emits a notification event for Phase 9 to
  // surface via email / in-app alert (WORKER-07, D-11).
  worker.on('failed', async (job, err) => {
    if (!job) return;

    const attemptsCap = job.opts.attempts ?? DEFAULT_MAX_ATTEMPTS;
    const isFinalFailure =
      err.name === 'UnrecoverableError' || job.attemptsMade >= attemptsCap;
    if (!isFinalFailure) return;

    try {
      let postRow: { profileId: string | null } | undefined;
      try {
        [postRow] = await db
          .select({ profileId: posts.profileId })
          .from(posts)
          .where(eq(posts.id, job.data.postId))
          .limit(1);
      } catch (lookupErr) {
        baseLogger.error(
          { err: lookupErr, postId: job.data.postId },
          'publish-failed listener: failed to resolve profileId',
        );
        return;
      }

      if (!postRow?.profileId) {
        baseLogger.error(
          { postId: job.data.postId },
          'publish-failed listener: post not found, skipping notification enqueue',
        );
        return;
      }

      await notificationQueue.add(JOB_NAMES.publishFailedNotification, {
        eventType: 'publish_failed',
        postId: job.data.postId,
        profileId: postRow.profileId,
        errorMessage: err.message,
        correlationId: job.data.correlationId,
        occurredAt: new Date().toISOString(),
      });
    } catch (enqueueErr) {
      baseLogger.error(
        { err: enqueueErr, postId: job.data.postId },
        'Failed to enqueue publish-failed notification event',
      );
    }
  });

  worker.on('error', (err) => {
    baseLogger.error({ err }, 'Publish worker error event');
  });

  return worker;
}
