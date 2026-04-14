import { Queue, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { QUEUE_NAMES, JOB_NAMES, buildPublishJobId } from '@sms/shared';

// Factory that wraps the BullMQ `publish` queue with the two operations the
// post routes need: enqueue a delayed publish for a scheduled post and
// cancel a scheduled publish before it fires (edit → re-enqueue, or delete).
//
// Credential discipline (D-06 / T-04-02-01): the job payload contains ONLY
// identifiers and a correlation ID. Twitter credentials are decrypted inside
// the worker at the moment of publish and never enter Redis.

export interface PublishJobPayload {
  postId: string;
  postVersion: number;
  correlationId: string;
}

export interface PublishQueueService {
  publishQueue: Queue<PublishJobPayload>;
  enqueuePublish: (
    postId: string,
    postVersion: number,
    scheduledAt: Date,
    correlationId: string,
  ) => Promise<Job<PublishJobPayload>>;
  cancelScheduled: (postId: string, postVersion: number) => Promise<void>;
}

export function createPublishQueueService(redis: Redis): PublishQueueService {
  const publishQueue = new Queue<PublishJobPayload>(QUEUE_NAMES.publish, {
    connection: redis,
    defaultJobOptions: {
      // Keep a small trailing window of completed jobs for Bull-Board visibility
      // without letting Redis memory grow unbounded.
      removeOnComplete: { count: 100 },
      // Keep the last 500 failures for DLQ inspection (D-11).
      removeOnFail: { count: 500 },
      // 4 total attempts = initial + 3 retries (D-09, WORKER-04).
      attempts: 4,
      // Custom backoff strategy is registered by the worker (Plan 03) —
      // producers cannot register strategies, only reference them by name.
      backoff: { type: 'publishBackoff' },
    },
  });

  async function enqueuePublish(
    postId: string,
    postVersion: number,
    scheduledAt: Date,
    correlationId: string,
  ): Promise<Job<PublishJobPayload>> {
    // Clamp negative delay to zero so a scheduledAt that has already passed
    // (e.g. worker recovery after an outage) fires immediately rather than
    // throwing inside BullMQ's validator.
    const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());
    return publishQueue.add(
      JOB_NAMES.publishPost,
      { postId, postVersion, correlationId },
      {
        delay: delayMs,
        jobId: buildPublishJobId(postId, postVersion),
      },
    );
  }

  async function cancelScheduled(
    postId: string,
    postVersion: number,
  ): Promise<void> {
    const jobId = buildPublishJobId(postId, postVersion);
    const job = await publishQueue.getJob(jobId);
    if (!job) {
      return;
    }
    // Only remove jobs that are still in the delayed set. Once a job has
    // moved to `active` the worker holds the lock and cancelling would race
    // with the in-flight API call. In that case we rely on the post_version
    // optimistic check inside the worker transaction (D-02) to abort cleanly.
    const isDelayed = await job.isDelayed();
    if (isDelayed) {
      await job.remove();
    }
  }

  return { publishQueue, enqueuePublish, cancelScheduled };
}
