import { queueEmptyNotificationSchema } from '@sms/shared';
import type { NotificationHandlerContext, NotificationJob } from './common.js';
import {
  parseNotificationPayload,
  performNotificationSideEffects,
  resolveUserIdFromQueue,
} from './common.js';

export async function handleQueueEmptyNotification(
  ctx: NotificationHandlerContext,
  job: NotificationJob<unknown>,
): Promise<void> {
  const payload = await parseNotificationPayload(
    job,
    (data) => queueEmptyNotificationSchema.safeParse(data),
    'queue_empty',
  );
  const { userId, queueName } = await resolveUserIdFromQueue(ctx, payload.queueId);

  await performNotificationSideEffects({
    ctx,
    userId,
    eventType: 'queue_empty',
    title: `Queue empty: ${queueName}`,
    body: `${payload.queueName} has no posts left to publish.`,
    linkPath: `/queues/${payload.queueId}`,
    payload,
  });
}

export const handleQueueEmpty = (
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> => handleQueueEmptyNotification(ctx, job);
