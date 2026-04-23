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
import { QUEUE_NAMES, JOB_NAMES, classifyTwitterError } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { WorkerDb } from './db.js';
import { publishPost, PostLifecycleAbort } from './post-lifecycle.service.js';
import { callTwitter } from './twitter-publish.service.js';
import { checkBudgetForWorker } from './rate-limit.js';
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
  checkBudgetImpl?: typeof checkBudgetForWorker;
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
      const result = await runPublish(deps.db, {
        postId: job.data.postId,
        expectedVersion: job.data.postVersion,
        correlationId: job.data.correlationId,
        currentAttemptNum: job.attemptsMade + 1,
        callTwitter: (profile, postText, isThread) =>
          runCallTwitter({
            profile,
            postText,
            isThread,
            correlationId: job.data.correlationId,
          }),
        checkBudget: async (profileId: string) => {
          const state = await runCheckBudget(deps.db, {
            profileId,
            additionalPostCount: 1,
          });
          return { wouldExceed: state.wouldExceed };
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
          err.reason === 'token_unhealthy'
        ) {
          // Phase 07-04 (TOKEN-05): token_unhealthy mirrors budget_exhausted —
          // post stays in `scheduled`, no retry budget consumed. Scanner will
          // re-enqueue once the user Reconnects and tokenStatus flips back to
          // `active`.
          logger.info(
            { reason: err.reason },
            'Graceful abort — scanner will re-evaluate',
          );
          return { skipped: true, skipReason: err.reason };
        }
      }

      const classification = classifyTwitterError(err);
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
      await notificationQueue.add(JOB_NAMES.publishFailedNotification, {
        kind: 'publish_failed',
        postId: job.data.postId,
        correlationId: job.data.correlationId,
        reason: err.message,
        at: new Date().toISOString(),
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
