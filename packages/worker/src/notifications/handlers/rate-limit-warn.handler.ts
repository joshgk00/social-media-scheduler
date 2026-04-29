import { rateLimitWarnNotificationSchema } from '@sms/shared';
import type { NotificationHandlerContext, NotificationJob } from './common.js';
import {
  parseNotificationPayload,
  performNotificationSideEffects,
  resolveUserIdFromProfile,
} from './common.js';

export async function handleRateLimitWarnNotification(
  ctx: NotificationHandlerContext,
  job: NotificationJob<unknown>,
): Promise<void> {
  const payload = await parseNotificationPayload(
    job,
    (data) => rateLimitWarnNotificationSchema.safeParse(data),
    'rate_limit_warn',
  );
  const { userId, profileLabel } = await resolveUserIdFromProfile(ctx, payload.profileId);

  // Composite failures surface as AggregateError from performNotificationSideEffects.
  await performNotificationSideEffects({
    ctx,
    userId,
    eventType: 'rate_limit_warn',
    title: `Rate limit warning for ${profileLabel}`,
    body: `${payload.currentUsage} of ${payload.monthlyBudget} posts used.`,
    linkPath: `/profiles/${payload.profileId}`,
    payload: {
      ...payload,
      correlationId: `rate-limit-warn-${payload.profileId}-${payload.triggeredAt}`,
    },
  });
}

export const handleRateLimitWarn = (
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> => handleRateLimitWarnNotification(ctx, job);
