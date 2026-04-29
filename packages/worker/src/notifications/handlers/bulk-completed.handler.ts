import { createLogger } from '@sms/shared/logger';
import type { NotificationHandlerContext, NotificationJob } from './common.js';

const logger = createLogger('handler:bulk-completed');

export async function handleBulkCompletedNotification(
  _ctx: NotificationHandlerContext,
  job: NotificationJob<unknown>,
): Promise<void> {
  logger.info({ jobId: job.id, jobName: job.name }, 'bulk_completed received - no-op stub until Phase 10');
}

export const handleBulkCompleted = (
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> => handleBulkCompletedNotification(ctx, job);
