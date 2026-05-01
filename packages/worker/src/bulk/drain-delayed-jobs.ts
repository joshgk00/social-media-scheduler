import { inArray } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { posts } from '@sms/db';
import { buildPublishJobId } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { WorkerDb } from '../db.js';

const logger = createLogger('drain-delayed-jobs');

export async function drainDelayedJobs({
  db,
  publishQueue,
  postIds,
}: {
  db: WorkerDb;
  publishQueue: Queue;
  postIds: string[];
}): Promise<void> {
  if (postIds.length === 0) return;
  const postRows = await db
    .select({ id: posts.id, postVersion: posts.postVersion })
    .from(posts)
    .where(inArray(posts.id, postIds));

  for (const post of postRows) {
    const publishJobId = buildPublishJobId(post.id, post.postVersion);
    try {
      const delayedJob = await publishQueue.getJob(publishJobId);
      if (delayedJob && await delayedJob.isDelayed()) {
        await delayedJob.remove();
      }
    } catch (err) {
      logger.warn({ err, postId: post.id, publishJobId }, 'Failed to remove delayed publish job');
    }
  }
}
