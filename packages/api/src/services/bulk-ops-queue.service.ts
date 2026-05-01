import { Queue, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { QUEUE_NAMES, type JobName } from '@sms/shared';

export interface BulkJobPayload {
  bulkOperationId: string;
  userId: string;
  operationType: string;
  targetKind: 'profile' | 'queue' | 'scheduled-list';
  targetId: string | null;
  idempotencyKey: string;
  data: Record<string, unknown>;
  correlationId: string;
}

export interface BulkOpsQueueService {
  bulkOpsQueue: Queue<BulkJobPayload>;
  enqueueBulkOp: (
    jobName: JobName,
    payload: BulkJobPayload,
    timestampSeconds: number,
  ) => Promise<Job<BulkJobPayload>>;
}

export function createBulkOpsQueueService(redis: Redis): BulkOpsQueueService {
  const bulkOpsQueue = new Queue<BulkJobPayload>(QUEUE_NAMES.bulkOps, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  });

  async function enqueueBulkOp(
    jobName: JobName,
    payload: BulkJobPayload,
    _timestampSeconds: number,
  ): Promise<Job<BulkJobPayload>> {
    return bulkOpsQueue.add(jobName, payload, {
      jobId: payload.bulkOperationId,
    });
  }

  return { bulkOpsQueue, enqueueBulkOp };
}
