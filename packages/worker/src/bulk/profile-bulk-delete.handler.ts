import { and, eq, inArray } from 'drizzle-orm';
import { posts } from '@sms/db';
import { selectedPostIds, type BulkJobContext, type BulkJobData, type BulkJobResult } from './common.js';
import { drainDelayedJobs } from './drain-delayed-jobs.js';

export async function handleProfileBulkDelete(
  job: { data: BulkJobData },
  ctx: BulkJobContext,
): Promise<BulkJobResult> {
  const postIds = selectedPostIds(job.data.params);
  if (postIds.length === 0) {
    throw new Error('Bulk delete job payload must include resolved postIds');
  }

  await drainDelayedJobs({ db: ctx.db, publishQueue: ctx.publishQueue, postIds });
  if (postIds.length > 0) {
    await ctx.db.delete(posts).where(and(eq(posts.userId, job.data.userId), inArray(posts.id, postIds)));
  }

  return { status: 'succeeded', successCount: postIds.length, failureCount: 0 };
}
