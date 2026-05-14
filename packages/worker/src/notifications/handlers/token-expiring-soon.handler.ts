import { tokenNotificationEventSchema } from '@sms/shared';
import type { NotificationHandlerContext, NotificationJob } from './common.js';
import {
  appBaseUrl,
  parseNotificationPayload,
  performNotificationSideEffects,
} from './common.js';
import { renderTokenExpiringSoonEmail } from '../templates/token-expiring-soon.template.js';

export async function handleTokenExpiringSoonNotification(
  ctx: NotificationHandlerContext,
  job: NotificationJob<unknown>,
): Promise<void> {
  const payload = await parseNotificationPayload(
    job,
    (data) => tokenNotificationEventSchema.safeParse(data),
    'token_expiring_soon',
  );

  // Composite failures surface as AggregateError from performNotificationSideEffects.
  await performNotificationSideEffects({
    ctx,
    userId: payload.userId,
    eventType: 'token_expiring_soon',
    title: `Token expiring soon for ${payload.platform}`,
    body: payload.reason,
    linkPath: `/profiles/${payload.profileId}`,
    payload,
    email: renderTokenExpiringSoonEmail(payload, appBaseUrl(ctx)),
  });
}

export const handleTokenExpiringSoon = (
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> => handleTokenExpiringSoonNotification(ctx, job);
