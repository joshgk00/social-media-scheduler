import { and, eq, inArray } from 'drizzle-orm';
import { posts, queues } from '@sms/db';
import { JOB_NAMES, buildPublishJobId } from '@sms/shared';
import { selectedPostIds, type BulkJobContext, type BulkJobData, type BulkJobResult } from './common.js';

export async function handleProfileResume(
  job: { data: BulkJobData },
  ctx: BulkJobContext,
): Promise<BulkJobResult> {
  const scope = String(job.data.params.scope ?? 'scheduled-posts');
  let successCount = 0;

  if (scope === 'scheduled-posts' || scope === 'both') {
    let postIds = selectedPostIds(job.data.params);
    if (postIds.length === 0 && job.data.targetId) {
      const rows = await ctx.db
        .select({ id: posts.id })
        .from(posts)
        .where(and(
          eq(posts.userId, job.data.userId),
          eq(posts.profileId, job.data.targetId),
          eq(posts.status, 'paused'),
        ));
      postIds = rows.map((row) => row.id);
    }
    const pausedPosts = postIds.length > 0
      ? await ctx.db
        .select({ id: posts.id, postVersion: posts.postVersion, scheduledAt: posts.scheduledAt })
        .from(posts)
        .where(and(eq(posts.userId, job.data.userId), inArray(posts.id, postIds), eq(posts.status, 'paused')))
      : [];
    if (pausedPosts.length > 0) {
      await ctx.db.update(posts).set({ status: 'scheduled' }).where(inArray(posts.id, pausedPosts.map((post) => post.id)));
      for (const post of pausedPosts) {
        if (!post.scheduledAt) continue;
        await ctx.publishQueue.add(
          JOB_NAMES.publishPost,
          { postId: post.id, postVersion: post.postVersion, correlationId: job.data.correlationId },
          {
            delay: Math.max(0, post.scheduledAt.getTime() - Date.now()),
            jobId: buildPublishJobId(post.id, post.postVersion),
          },
        );
      }
      successCount += pausedPosts.length;
    }
  }

  if ((scope === 'queues' || scope === 'both') && job.data.targetId) {
    const updatedQueues = await ctx.db
      .update(queues)
      .set({ isPaused: false, updatedAt: new Date() })
      .where(and(eq(queues.userId, job.data.userId), eq(queues.profileId, job.data.targetId)))
      .returning({ id: queues.id });
    successCount += updatedQueues.length;
  }

  return { status: 'succeeded', successCount, failureCount: 0 };
}
