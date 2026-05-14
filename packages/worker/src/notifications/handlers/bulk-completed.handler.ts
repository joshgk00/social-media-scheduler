import { bulkCompletedNotificationSchema } from '@sms/shared';
import type { NotificationHandlerContext, NotificationJob } from './common.js';
import {
  appBaseUrl,
  parseNotificationPayload,
  performNotificationSideEffects,
} from './common.js';
import { renderBulkCompletedEmail } from '../templates/bulk-completed.template.js';

function formatOperationLabel(operation: string): string {
  if (operation.includes('csv-import')) return 'Import';
  if (operation.includes('bulk-delete')) return 'Bulk delete';
  if (operation.includes('pause')) return 'Pause publishing';
  if (operation.includes('resume')) return 'Resume publishing';
  if (operation.includes('dedupe')) return 'Remove duplicates';
  if (operation.includes('text-modify')) return 'Modify text';
  if (operation.includes('copy')) return 'Copy queue';
  if (operation.includes('purge')) return 'Purge queue';
  if (operation.includes('randomize')) return 'Randomize queue';
  return 'Bulk operation';
}

export async function handleBulkCompletedNotification(
  ctx: NotificationHandlerContext,
  job: NotificationJob<unknown>,
): Promise<void> {
  const payload = await parseNotificationPayload(
    job,
    (data) => bulkCompletedNotificationSchema.safeParse(data),
    'bulk_completed',
  );
  const operationLabel = formatOperationLabel(payload.operation);
  const severity = payload.failureCount === 0
    ? 'info'
    : payload.successCount === 0
      ? 'error'
      : 'warning';
  const title = payload.successCount === 0 && payload.failureCount > 0
    ? `${operationLabel} failed`
    : `${operationLabel} complete`;
  const body = `${payload.successCount} succeeded, ${payload.failureCount} failed.`;
  const errorReportUrl = payload.errorReportPath
    ? `${appBaseUrl(ctx)}/media/${payload.errorReportPath.replace(/^.*bulk-errors\//, 'bulk-errors/')}`
    : null;

  await performNotificationSideEffects({
    ctx,
    userId: payload.userId,
    eventType: 'bulk_completed',
    title,
    body,
    linkPath: `/posts?bulkOp=${payload.bulkOperationId}`,
    payload: { ...payload, severity },
    email: renderBulkCompletedEmail({
      operationLabel,
      successCount: payload.successCount,
      failureCount: payload.failureCount,
      errorReportUrl,
    }, appBaseUrl(ctx)),
  });
}

export const handleBulkCompleted = (
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> => handleBulkCompletedNotification(ctx, job);
