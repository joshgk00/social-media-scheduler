// BullMQ Worker consuming the 'auto-destruct' queue. Handles delayed
// deletion of published posts from Twitter after the configured delay.
//
// D-12: 3 retries with exponential backoff (30s -> 5min -> 30min).
// Uses attempts: 4 (initial + 3 retries), same pattern as publish worker.
//
// D-13: Platform 404 treated as success by the lifecycle service.
//
// After all retries exhausted: post stays in 'auto_destructing' with
// failureReason set, notification emitted via notificationQueue.

import { Worker, type Job, type Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { QUEUE_NAMES, JOB_NAMES } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { WorkerDb } from './db.js';
import { autoDestructPost } from './auto-destruct-lifecycle.service.js';
import { deleteTweet } from './twitter-delete.service.js';
import { buildBackoffStrategy } from './backoff.js';

export interface AutoDestructJobPayload {
  postId: string;
  platformPostId: string;
  correlationId: string;
}

export interface AutoDestructWorkerDeps {
  redis: Redis;
  db: WorkerDb;
  notificationQueue: Queue;
}

const AUTO_DESTRUCT_CONFIG = {
  concurrency: 2,
  lockDuration: 30_000,
  stalledInterval: 30_000,
  maxStalledCount: 1,
  attempts: 4,
} as const;

const logger = createLogger('auto-destruct-worker');

export function createAutoDestructWorker(
  deps: AutoDestructWorkerDeps,
): Worker<AutoDestructJobPayload> {
  const worker = new Worker<AutoDestructJobPayload>(
    QUEUE_NAMES.autoDestruct,
    async (job: Job<AutoDestructJobPayload>) => {
      const jobLogger = logger.child({
        correlationId: job.data.correlationId,
        postId: job.data.postId,
        platformPostId: job.data.platformPostId,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
      });

      jobLogger.info('Processing auto-destruct job');

      await autoDestructPost(deps.db, {
        postId: job.data.postId,
        platformPostId: job.data.platformPostId,
        correlationId: job.data.correlationId,
        callDelete: async (profile, platformPostId) => {
          return deleteTweet({
            profile,
            platformPostId,
            correlationId: job.data.correlationId,
          });
        },
      });

      jobLogger.info('Auto-destruct completed');
    },
    {
      connection: deps.redis,
      concurrency: AUTO_DESTRUCT_CONFIG.concurrency,
      lockDuration: AUTO_DESTRUCT_CONFIG.lockDuration,
      stalledInterval: AUTO_DESTRUCT_CONFIG.stalledInterval,
      maxStalledCount: AUTO_DESTRUCT_CONFIG.maxStalledCount,
      settings: {
        backoffStrategy: buildBackoffStrategy(),
      },
    },
  );

  // Exhausted retries: emit notification (D-12)
  worker.on('failed', async (job, err) => {
    if (!job) return;

    const attemptsCap = job.opts.attempts ?? AUTO_DESTRUCT_CONFIG.attempts;
    const isFinalFailure = job.attemptsMade >= attemptsCap;
    if (!isFinalFailure) return;

    try {
      await deps.notificationQueue.add(JOB_NAMES.autoDestructFailedNotification, {
        kind: 'auto_destruct_failed',
        postId: job.data.postId,
        platformPostId: job.data.platformPostId,
        correlationId: job.data.correlationId,
        reason: err.message,
        at: new Date().toISOString(),
      });
    } catch (enqueueErr) {
      logger.error(
        { err: enqueueErr, postId: job.data.postId },
        'Failed to enqueue auto-destruct-failed notification',
      );
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Auto-destruct worker error event');
  });

  return worker;
}
