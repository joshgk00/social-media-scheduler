import { rateLimitReachedNotificationSchema } from '@sms/shared';
import type { NotificationHandlerContext, NotificationJob } from './common.js';
import {
  appBaseUrl,
  parseNotificationPayload,
  performNotificationSideEffects,
} from './common.js';
import { renderRateLimitReachedEmail } from '../templates/rate-limit-reached.template.js';

export async function handleRateLimitReachedNotification(
  ctx: NotificationHandlerContext,
  job: NotificationJob<unknown>,
): Promise<void> {
  const payload = await parseNotificationPayload(
    job,
    (data) => rateLimitReachedNotificationSchema.safeParse(data),
    'rate_limit_reached',
  );

  // Composite failures surface as AggregateError from performNotificationSideEffects.
  await performNotificationSideEffects({
    ctx,
    userId: payload.userId,
    eventType: 'rate_limit_reached',
    title: `Rate limit reached for ${payload.platform}`,
    body: 'Publishing is paused until the rate limit window resets.',
    linkPath: `/profiles/${payload.profileId}`,
    payload,
    email: renderRateLimitReachedEmail(payload, appBaseUrl(ctx)),
  });
}

export const handleRateLimitReached = (
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> => handleRateLimitReachedNotification(ctx, job);
