import { tokenNotificationEventSchema } from '@sms/shared';
import type { NotificationHandlerContext, NotificationJob } from './common.js';
import {
  appBaseUrl,
  parseNotificationPayload,
  performNotificationSideEffects,
} from './common.js';
import { renderTokenReauthRequiredEmail } from '../templates/token-reauth-required.template.js';

export async function handleTokenReauthRequiredNotification(
  ctx: NotificationHandlerContext,
  job: NotificationJob<unknown>,
): Promise<void> {
  const payload = await parseNotificationPayload(
    job,
    (data) => tokenNotificationEventSchema.safeParse(data),
    'token_reauth_required',
  );

  // Composite failures surface as AggregateError from performNotificationSideEffects.
  await performNotificationSideEffects({
    ctx,
    userId: payload.userId,
    eventType: 'token_reauth_required',
    title: `Re-authentication required for ${payload.platform}`,
    body: payload.reason,
    linkPath: `/profiles/${payload.profileId}`,
    payload,
    email: renderTokenReauthRequiredEmail(payload, appBaseUrl(ctx)),
  });
}

export const handleTokenReauthRequired = (
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> => handleTokenReauthRequiredNotification(ctx, job);
