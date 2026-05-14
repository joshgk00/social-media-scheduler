import { autoDestructFailedNotificationSchema } from '@sms/shared';
import type { NotificationHandlerContext, NotificationJob } from './common.js';
import {
  appBaseUrl,
  parseNotificationPayload,
  performNotificationSideEffects,
  resolveUserIdFromPost,
} from './common.js';
import { renderAutoDestructFailedEmail } from '../templates/auto-destruct-failed.template.js';

export async function handleAutoDestructFailedNotification(
  ctx: NotificationHandlerContext,
  job: NotificationJob<unknown>,
): Promise<void> {
  const payload = await parseNotificationPayload(
    job,
    (data) => autoDestructFailedNotificationSchema.safeParse(data),
    'auto_destruct_failed',
  );
  const { userId } = await resolveUserIdFromPost(ctx, payload.postId);

  // Composite failures surface as AggregateError from performNotificationSideEffects.
  await performNotificationSideEffects({
    ctx,
    userId,
    eventType: 'auto_destruct_failed',
    title: 'Auto-destruct failed',
    body: payload.errorMessage,
    linkPath: `/posts/${payload.postId}`,
    payload,
    email: renderAutoDestructFailedEmail(payload, appBaseUrl(ctx)),
  });
}

export const handleAutoDestructFailed = (
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> => handleAutoDestructFailedNotification(ctx, job);
