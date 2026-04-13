import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { QUEUE_NAMES, JOB_NAMES, buildAutoDestructJobId } from '@sms/shared';

export interface AutoDestructJobPayload {
  postId: string;
  platformPostId: string;
  correlationId: string;
}

export interface AutoDestructQueueService {
  autoDestructQueue: Queue<AutoDestructJobPayload>;
  enqueueAutoDestruct: (
    postId: string,
    platformPostId: string,
    publishedAt: Date,
    autoDestructAfter: string,
  ) => Promise<void>;
}

function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)\s*(minutes?|hours?|days?|weeks?)$/i);
  if (!match) return 0;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase().replace(/s$/, '');

  const multipliers: Record<string, number> = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
  };

  return value * (multipliers[unit] ?? 0);
}

export function createAutoDestructQueueService(redis: Redis): AutoDestructQueueService {
  const autoDestructQueue = new Queue<AutoDestructJobPayload>(QUEUE_NAMES.autoDestruct, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    },
  });

  async function enqueueAutoDestruct(
    postId: string,
    platformPostId: string,
    publishedAt: Date,
    autoDestructAfter: string,
  ): Promise<void> {
    const durationMs = parseDurationToMs(autoDestructAfter);
    if (durationMs <= 0) return;

    const targetTime = publishedAt.getTime() + durationMs;
    const delayMs = Math.max(0, targetTime - Date.now());

    const jobId = buildAutoDestructJobId(postId, platformPostId);
    const correlationId = randomUUID();

    await autoDestructQueue.add(
      JOB_NAMES.autoDestructPost,
      { postId, platformPostId, correlationId },
      { delay: delayMs, jobId },
    );
  }

  return { autoDestructQueue, enqueueAutoDestruct };
}
