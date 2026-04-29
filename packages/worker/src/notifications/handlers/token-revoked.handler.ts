import { ALWAYS_ON_EVENT_TYPES, tokenNotificationEventSchema } from '@sms/shared';
import type { NotificationHandlerContext, NotificationJob } from './common.js';
import {
  appBaseUrl,
  parseNotificationPayload,
  performNotificationSideEffects,
} from './common.js';
import { renderTokenRevokedEmail } from '../templates/token-revoked.template.js';

export async function handleTokenRevokedNotification(
  ctx: NotificationHandlerContext,
  job: NotificationJob<unknown>,
): Promise<void> {
  const payload = await parseNotificationPayload(
    job,
    (data) => tokenNotificationEventSchema.safeParse(data),
    'token_revoked',
  );
  const isAlwaysOn = ALWAYS_ON_EVENT_TYPES.has('token_revoked');

  // Composite failures surface as AggregateError from performNotificationSideEffects.
  await performNotificationSideEffects({
    ctx,
    userId: payload.userId,
    eventType: 'token_revoked',
    title: `Token revoked for ${payload.platform}`,
    body: isAlwaysOn ? payload.reason : payload.reason,
    linkPath: `/profiles/${payload.profileId}`,
    payload,
    email: renderTokenRevokedEmail(payload, appBaseUrl(ctx)),
  });
}

export const handleTokenRevoked = (
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> => handleTokenRevokedNotification(ctx, job);
