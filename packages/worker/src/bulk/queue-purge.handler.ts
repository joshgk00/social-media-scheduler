import { and, eq, inArray } from 'drizzle-orm';
import { posts, queues } from '@sms/db';
import type { BulkJobContext, BulkJobData, BulkJobResult } from './common.js';
import { drainDelayedJobs } from './drain-delayed-jobs.js';

export async function handleQueuePurge(
  job: { data: BulkJobData },
  ctx: BulkJobContext,
): Promise<BulkJobResult> {
  const queueId = job.data.targetId;
  if (!queueId) throw new Error('Queue targetId is required');

  const [queue] = await ctx.db
    .select({ id: queues.id })
    .from(queues)
    .where(and(eq(queues.id, queueId), eq(queues.userId, job.data.userId)));
  if (!queue) throw new Error('Queue not found');

  const purgeablePosts = await ctx.db
    .select({ id: posts.id })
    .from(posts)
    .where(and(
      eq(posts.queueId, queueId),
      eq(posts.userId, job.data.userId),
      inArray(posts.status, ['queued', 'draft', 'paused']),
    ));

  await drainDelayedJobs({
    db: ctx.db,
    publishQueue: ctx.publishQueue,
    postIds: purgeablePosts.map((post) => post.id),
  });

  if (purgeablePosts.length > 0) {
    await ctx.db
      .delete(posts)
      .where(and(eq(posts.userId, job.data.userId), inArray(posts.id, purgeablePosts.map((post) => post.id))));
  }

  return { status: 'succeeded', successCount: purgeablePosts.length, failureCount: 0 };
}
