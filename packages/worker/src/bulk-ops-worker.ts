import { Worker, UnrecoverableError, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { JOB_NAMES, QUEUE_NAMES } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { BulkJobContext, BulkJobData, BulkJobResult } from './bulk/common.js';
import {
  markBulkOperationFailed,
  markBulkOperationFinished,
  markBulkOperationRunning,
} from './bulk/common.js';
import { handleCsvImportQueue } from './bulk/csv-import-queue.handler.js';
import { handleCsvImportScheduled } from './bulk/csv-import-scheduled.handler.js';
import { handleQueueCopy } from './bulk/queue-copy.handler.js';
import { handleQueueDedupe } from './bulk/queue-dedupe.handler.js';
import { handleQueuePurge } from './bulk/queue-purge.handler.js';
import { handleQueueRandomize } from './bulk/queue-randomize.handler.js';
import { handleQueueTextModify } from './bulk/queue-text-modify.handler.js';
import { handleProfileBulkDelete } from './bulk/profile-bulk-delete.handler.js';
import { handleProfilePause } from './bulk/profile-pause.handler.js';
import { handleProfileResume } from './bulk/profile-resume.handler.js';

const logger = createLogger('bulk-ops-worker');

export interface BulkOpsWorkerDeps extends BulkJobContext {
  redis: Redis;
}

export type BulkOpsWorkerRuntime = Worker & {
  process: (job: Job<BulkJobData>) => Promise<void>;
};

async function dispatchBulkJob(job: Job<BulkJobData>, ctx: BulkJobContext): Promise<BulkJobResult> {
  switch (job.name) {
    case JOB_NAMES.bulkCsvImportScheduled:
      return handleCsvImportScheduled(job, ctx);
    case JOB_NAMES.bulkCsvImportQueue:
      return handleCsvImportQueue(job, ctx);
    case JOB_NAMES.bulkQueueRandomize:
      return handleQueueRandomize(job, ctx);
    case JOB_NAMES.bulkQueuePurge:
      return handleQueuePurge(job, ctx);
    case JOB_NAMES.bulkQueueCopy:
      return handleQueueCopy(job, ctx);
    case JOB_NAMES.bulkQueueTextModify:
      return handleQueueTextModify(job, ctx);
    case JOB_NAMES.bulkQueueDedupe:
      return handleQueueDedupe(job, ctx);
    case JOB_NAMES.bulkProfilePause:
      return handleProfilePause(job, ctx);
    case JOB_NAMES.bulkProfileResume:
      return handleProfileResume(job, ctx);
    case JOB_NAMES.bulkProfileBulkDelete:
      return handleProfileBulkDelete(job, ctx);
    default:
      throw new UnrecoverableError(`Unknown bulk operation job name: ${job.name}`);
  }
}

async function processBulkJob(job: Job<BulkJobData>, ctx: BulkJobContext): Promise<void> {
  await markBulkOperationRunning(ctx.db, job.data.bulkOperationId);
  try {
    const result = await dispatchBulkJob(job, ctx);
    await markBulkOperationFinished(ctx.db, job.data.bulkOperationId, result);
    await ctx.notificationQueue.add('bulk-completed', {
      eventType: 'bulk_completed',
      userId: job.data.userId,
      bulkOperationId: job.data.bulkOperationId,
      operation: job.data.operationType,
      successCount: result.successCount,
      failureCount: result.failureCount,
      errorReportPath: result.errorReportPath ?? null,
      correlationId: job.data.correlationId,
    });
  } catch (err) {
    await markBulkOperationFailed(ctx.db, job.data.bulkOperationId, err);
    throw err;
  }
}

export function createBulkOpsWorker(deps: BulkOpsWorkerDeps): BulkOpsWorkerRuntime {
  const concurrency = Number.parseInt(process.env.BULK_OPS_WORKER_CONCURRENCY ?? '2', 10);
  const worker = new Worker<BulkJobData>(
    QUEUE_NAMES.bulkOps,
    (job) => processBulkJob(job, deps),
    {
      connection: deps.redis,
      concurrency,
      lockDuration: 5 * 60 * 1000,
    },
  );

  worker.on('error', (err) => logger.error({ err }, 'Bulk operations worker error'));
  worker.on('failed', (job, err) => {
    logger.warn({ err, jobId: job?.id, jobName: job?.name }, 'Bulk operation job failed');
  });

  return Object.assign(worker, {
    process: (job: Job<BulkJobData>) => processBulkJob(job, deps),
  }) as BulkOpsWorkerRuntime;
}
