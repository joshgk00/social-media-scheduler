import { and, eq, inArray } from 'drizzle-orm';
import { posts, queues } from '@sms/db';
import { selectedPostIds, type BulkJobContext, type BulkJobData, type BulkJobResult } from './common.js';
import { drainDelayedJobs } from './drain-delayed-jobs.js';

export async function handleProfilePause(
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
          eq(posts.status, 'scheduled'),
        ));
      postIds = rows.map((row) => row.id);
    }
    await drainDelayedJobs({ db: ctx.db, publishQueue: ctx.publishQueue, postIds });
    if (postIds.length > 0) {
      await ctx.db.update(posts).set({ status: 'paused' }).where(and(
        eq(posts.userId, job.data.userId),
        inArray(posts.id, postIds),
      ));
      successCount += postIds.length;
    }
  }

  if ((scope === 'queues' || scope === 'both') && job.data.targetId) {
    const updatedQueues = await ctx.db
      .update(queues)
      .set({ isPaused: true, updatedAt: new Date() })
      .where(and(eq(queues.userId, job.data.userId), eq(queues.profileId, job.data.targetId)))
      .returning({ id: queues.id });
    successCount += updatedQueues.length;
  }

  return { status: 'succeeded', successCount, failureCount: 0 };
}
