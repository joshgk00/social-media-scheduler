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
  PublishFailure,
  type Publisher,
  type SupportedPlatform,
} from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import { createStorageBackend, type StorageBackend } from '@sms/shared/storage';
import {
  TokenVaultError,
  type ProfileWithEncryptedTokens,
  type TokenVault,
} from '@sms/shared/tokens';
import type { WorkerDb } from './db.js';
import { publishPost, PostLifecycleAbort } from './post-lifecycle.service.js';
import { createTwitterPublisher } from './publishers/twitter.js';
import { createLinkedInPublisher } from './publishers/linkedin.js';
import { createFacebookPublisher } from './publishers/facebook.js';
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
  vault: TokenVault;
}

export interface PublishHandlerDeps {
  db: WorkerDb;
  notificationQueue: Queue;
  vault: TokenVault;
  publishPostImpl?: typeof publishPost;
  publishers?: Partial<Record<PublishPlatform, Publisher>>;
  checkBudgetImpl?: typeof checkBudgetForWorker;
  storage?: StorageBackend;
}

const PUBLISH_WORKER_CONFIG = {
  concurrency: 2,
  lockDuration: 30_000,
  stalledInterval: 30_000,
  maxStalledCount: 1,
} as const;

const DEFAULT_MAX_ATTEMPTS = 4;
type PublishPlatform = SupportedPlatform;

function isPublishPlatform(platform: string): platform is PublishPlatform {
  return platform === 'twitter' || platform === 'linkedin' || platform === 'facebook';
}

function redactSafeMessage(input: string): string {
  return input
    .replace(/(access_token=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(oauth(?:_token|_nonce)?=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[redacted]')
    .replace(/([A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})/g, '[redacted-token]');
}

function safePublishFailureMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown publish failure';
  return redactSafeMessage(message);
}

function createDefaultPublishers(): Record<PublishPlatform, Publisher> {
  return {
    twitter: createTwitterPublisher(),
    linkedin: createLinkedInPublisher(),
    facebook: createFacebookPublisher(),
  };
}

function asVaultProfile(profile: typeof socialProfiles.$inferSelect): ProfileWithEncryptedTokens {
  if (!isPublishPlatform(profile.platform)) {
    throw new PublishFailure({
      kind: 'permanent',
      errorCode: 'unsupported_profile_platform',
      message: `Unsupported profile platform: ${profile.platform}`,
    });
  }
  return {
    ...profile,
    platform: profile.platform,
    linkedinAccountType:
      profile.linkedinAccountType === 'organization' ? 'organization' : 'person',
  };
}

function unsealPublisherCredentials(
  vault: TokenVault,
  profile: typeof socialProfiles.$inferSelect,
) {
  const vaultProfile = asVaultProfile(profile);
  try {
    return {
      safeProfile: vault.toSafeProfile(vaultProfile),
      credentials: vault.unsealForProfile(vaultProfile),
    };
  } catch (err) {
    if (err instanceof TokenVaultError) {
      throw new PublishFailure({
        kind: 'permanent',
        errorCode: 'credential_error',
        message: err.message,
        cause: err,
      });
    }
    throw err;
  }
}

/**
 * Pure handler function — exported so unit tests can invoke it directly
 * without standing up a BullMQ Worker. The `createPublishWorker` factory
 * below wraps this in a real Worker.
 */
export function createPublishHandler(deps: PublishHandlerDeps) {
  const baseLogger = createLogger('publish-worker');
  const runPublish = deps.publishPostImpl ?? publishPost;
  const publishers = {
    ...createDefaultPublishers(),
    ...deps.publishers,
  };
  const runCheckBudget = deps.checkBudgetImpl ?? checkBudgetForWorker;

  return async function handle(
    job: Job<PublishJobPayload>,
  ): Promise<PublishJobResult> {
    const logger = baseLogger.child({
      correlationId: job.data.correlationId,
      postId: job.data.postId,
      jobId: job.id,
      attempt: job.attemptsMade + 1,
    });

    try {
      const attemptsCap = job.opts.attempts ?? 1;
      const result = await runPublish(deps.db, {
        postId: job.data.postId,
        expectedVersion: job.data.postVersion,
        correlationId: job.data.correlationId,
        currentAttemptNum: job.attemptsMade + 1,
        isFinalAttempt: job.attemptsMade + 1 >= attemptsCap,
        publish: async (profile, publishablePost, publishCtx) => {
          const { safeProfile, credentials } = unsealPublisherCredentials(
            deps.vault,
            profile,
          );
          return publishers[publishablePost.platform].publish(
            safeProfile,
            credentials,
            publishablePost,
            publishCtx,
          );
        },
        checkBudget: async (profileId: string) => {
          // Resolve the platform from the joined profile so the lifecycle can
          // branch on rate_limit_exhausted vs budget_exhausted.
          const [profileRow] = await deps.db
            .select({ platform: socialProfiles.platform })
            .from(socialProfiles)
            .where(eq(socialProfiles.id, profileId));
          const rawPlatform = profileRow?.platform ?? '';
          const platform: PublishPlatform = isPublishPlatform(rawPlatform)
            ? rawPlatform
            : 'twitter';

          if (platform === 'linkedin') {
            const state = await checkLinkedInBudgetForWorker(deps.db, {
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
            const state = await checkFacebookBudgetForWorker(deps.db, {
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
        storage: deps.storage,
      });

      logger.info(
        { platformPostId: result.platformPostId },
        'Publish succeeded',
      );
      return { platformPostId: result.platformPostId };
    } catch (err) {
      if (err instanceof PostLifecycleAbort) {
        const abortKind = err.invariant.kind;
        // Graceful aborts never throw to BullMQ — they resolve cleanly so
        // the job does not consume retry budget. The scanner's next pass
        // re-enqueues the post if it is still due.
        if (abortKind === 'already_published') {
          logger.info('Idempotent skip — post already published');
          return { skipped: true, skipReason: abortKind };
        }
        if (
          abortKind === 'version_mismatch' ||
          abortKind === 'budget_exhausted' ||
          abortKind === 'not_scheduled' ||
          abortKind === 'thread_unsupported' ||
          abortKind === 'media_pending' ||
          abortKind === 'token_unhealthy' ||
          abortKind === 'rate_limit_exhausted'
        ) {
          // Phase 07-04 (TOKEN-05) / Phase 8 (LIMIT-06/LIMIT-07):
          // rate_limit_exhausted mirrors budget_exhausted / token_unhealthy —
          // post stays in `scheduled`, no retry budget consumed. The scanner
          // re-enqueues once the platform window resets.
          logger.info(
            { reason: abortKind },
            'Graceful abort — scanner will re-evaluate',
          );
          return { skipped: true, skipReason: abortKind };
        }
      }

      if (err instanceof PublishFailure) {
        if (err.kind === 'permanent') {
          logger.warn(
            { errorCode: err.errorCode, httpStatus: err.httpStatus },
            'Permanent failure — skipping retries',
          );
          throw new UnrecoverableError(err.message);
        }

        logger.warn(
          { errorCode: err.errorCode, httpStatus: err.httpStatus },
          'Transient failure — will retry',
        );
        throw err;
      }

      throw err;
    }
  };
}

export function createPublishWorker({
  redis,
  db,
  notificationQueue,
  vault,
}: PublishWorkerDeps): Worker<PublishJobPayload, PublishJobResult> {
  const baseLogger = createLogger('publish-worker');
  const storage = createStorageBackend();
  const handler = createPublishHandler({ db, notificationQueue, vault, storage });

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

    const attemptsCap = job.opts.attempts ?? 1;
    const isFinalFailure =
      err.name === 'UnrecoverableError' || job.attemptsMade >= attemptsCap;
    if (!isFinalFailure) return;

    try {
      let postRow: { profileId: string | null; platform: string } | undefined;
      try {
        [postRow] = await db
          .select({ profileId: posts.profileId, platform: posts.platform })
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
      if (!isPublishPlatform(postRow.platform)) {
        baseLogger.error(
          { postId: job.data.postId, platform: postRow.platform },
          'publish-failed listener: unsupported platform, skipping notification enqueue',
        );
        return;
      }

      await notificationQueue.add(JOB_NAMES.publishFailedNotification, {
        eventType: 'publish_failed',
        postId: job.data.postId,
        profileId: postRow.profileId,
        errorMessage: safePublishFailureMessage(err),
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
