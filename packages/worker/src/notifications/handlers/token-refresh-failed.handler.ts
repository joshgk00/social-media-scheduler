import { tokenNotificationEventSchema } from '@sms/shared';
import type { NotificationHandlerContext, NotificationJob } from './common.js';
import {
  appBaseUrl,
  parseNotificationPayload,
  performNotificationSideEffects,
} from './common.js';
import { renderTokenRefreshFailedEmail } from '../templates/token-refresh-failed.template.js';

export async function handleTokenRefreshFailedNotification(
  ctx: NotificationHandlerContext,
  job: NotificationJob<unknown>,
): Promise<void> {
  const payload = await parseNotificationPayload(
    job,
    (data) => tokenNotificationEventSchema.safeParse(data),
    'token_refresh_failed',
  );

  // Composite failures surface as AggregateError from performNotificationSideEffects.
  await performNotificationSideEffects({
    ctx,
    userId: payload.userId,
    eventType: 'token_refresh_failed',
    title: `Token refresh failed for ${payload.platform}`,
    body: payload.reason,
    linkPath: `/profiles/${payload.profileId}`,
    payload,
    email: renderTokenRefreshFailedEmail(payload, appBaseUrl(ctx)),
  });
}

export const handleTokenRefreshFailed = (
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> => handleTokenRefreshFailedNotification(ctx, job);
