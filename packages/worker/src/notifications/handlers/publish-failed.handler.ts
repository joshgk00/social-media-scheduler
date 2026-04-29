import { publishFailedNotificationSchema } from '@sms/shared';
import type { NotificationHandlerContext, NotificationJob } from './common.js';
import {
  appBaseUrl,
  parseNotificationPayload,
  performNotificationSideEffects,
  resolveUserIdFromPost,
  resolveUserIdFromProfile,
} from './common.js';
import { renderPublishFailedEmail } from '../templates/publish-failed.template.js';

export async function handlePublishFailedNotification(
  ctx: NotificationHandlerContext,
  job: NotificationJob<unknown>,
): Promise<void> {
  const payload = await parseNotificationPayload(
    job,
    (data) => publishFailedNotificationSchema.safeParse(data),
    'publish_failed',
  );
  const { userId, postPreview } = await resolveUserIdFromPost(ctx, payload.postId);
  const { profileLabel } = await resolveUserIdFromProfile(ctx, payload.profileId);

  // Composite failures surface as AggregateError from performNotificationSideEffects.
  await performNotificationSideEffects({
    ctx,
    userId,
    eventType: 'publish_failed',
    title: `Publish failed on ${profileLabel}`,
    body: payload.errorMessage,
    linkPath: `/posts/${payload.postId}`,
    payload,
    email: renderPublishFailedEmail({ ...payload, profileLabel, postPreview }, appBaseUrl(ctx)),
  });
}

export const handlePublishFailed = (
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> => handlePublishFailedNotification(ctx, job);
