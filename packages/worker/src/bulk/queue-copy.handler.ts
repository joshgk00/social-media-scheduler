import { and, eq, max } from 'drizzle-orm';
import { posts, queues } from '@sms/db';
import { JOB_NAMES } from '@sms/shared';
import type { BulkJobContext, BulkJobData, BulkJobResult } from './common.js';

export async function handleQueueCopy(
  job: { data: BulkJobData },
  ctx: BulkJobContext,
): Promise<BulkJobResult> {
  const sourceQueueId = job.data.targetId;
  const targetQueueId = String(job.data.data.targetQueueId ?? '');
  if (!sourceQueueId || !targetQueueId) throw new Error('Source and target queue IDs are required');

  const copiedCount = await ctx.db.transaction(async (tx) => {
    const [sourceQueue] = await tx
      .select({ id: queues.id, profileId: queues.profileId })
      .from(queues)
      .where(and(eq(queues.id, sourceQueueId), eq(queues.userId, job.data.userId)));
    const [targetQueue] = await tx
      .select({ id: queues.id, profileId: queues.profileId })
      .from(queues)
      .where(and(eq(queues.id, targetQueueId), eq(queues.userId, job.data.userId)));
    if (!sourceQueue || !targetQueue) throw new Error('Queue not found');
    if (sourceQueue.profileId !== targetQueue.profileId) {
      throw new Error('Cross-profile copy rejected');
    }

    const sourcePosts = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.queueId, sourceQueueId), eq(posts.userId, job.data.userId)));
    const [maxRow] = await tx
      .select({ maxPosition: max(posts.queuePosition) })
      .from(posts)
      .where(eq(posts.queueId, targetQueueId));
    const basePosition = Number(maxRow?.maxPosition ?? 0) + 1;

    if (sourcePosts.length > 0) {
      await tx.insert(posts).values(sourcePosts.map((post, index) => ({
        userId: post.userId,
        profileId: post.profileId,
        platform: post.platform,
        text: post.text,
        status: 'queued' as const,
        isThread: post.isThread,
        hasSpinnableText: post.hasSpinnableText,
        autoDestructAfter: post.autoDestructAfter,
        queueId: targetQueueId,
        queuePosition: basePosition + index,
        notes: post.notes,
        visibility: post.visibility,
        linkUrl: post.linkUrl,
      })));
    }

    return sourcePosts.length;
  });

  if (job.data.data.randomizeAfter === true) {
    await ctx.bulkOpsQueue.add(JOB_NAMES.bulkQueueRandomize, {
      ...job.data,
      targetId: targetQueueId,
      operationType: JOB_NAMES.bulkQueueRandomize,
      data: {},
    });
  }

  return { status: 'succeeded', successCount: copiedCount, failureCount: 0 };
}
