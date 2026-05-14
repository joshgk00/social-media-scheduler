import { and, eq, inArray } from 'drizzle-orm';
import { posts, queues } from '@sms/db';
import type { BulkJobContext, BulkJobData, BulkJobResult } from './common.js';

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export async function handleQueueRandomize(
  job: { data: BulkJobData },
  ctx: BulkJobContext,
): Promise<BulkJobResult> {
  const queueId = job.data.targetId;
  if (!queueId) throw new Error('Queue targetId is required');

  const successCount = await ctx.db.transaction(async (tx) => {
    const [queue] = await tx
      .select({ id: queues.id, cursorPosition: queues.cursorPosition })
      .from(queues)
      .where(and(eq(queues.id, queueId), eq(queues.userId, job.data.userId)));
    if (!queue) throw new Error('Queue not found');

    const queuePosts = await tx
      .select({ id: posts.id, queuePosition: posts.queuePosition })
      .from(posts)
      .where(and(eq(posts.queueId, queueId), eq(posts.userId, job.data.userId)));
    const sortedPosts = [...queuePosts].sort((left, right) => (left.queuePosition ?? 0) - (right.queuePosition ?? 0));
    const cursorPostId = sortedPosts[queue.cursorPosition]?.id ?? sortedPosts[0]?.id;
    const shuffledPosts = shuffle(sortedPosts);

    for (const [index, post] of shuffledPosts.entries()) {
      await tx.update(posts).set({ queuePosition: index + 1 }).where(eq(posts.id, post.id));
    }

    const newCursorPosition = Math.max(0, shuffledPosts.findIndex((post) => post.id === cursorPostId));
    await tx.update(queues).set({ cursorPosition: newCursorPosition }).where(eq(queues.id, queueId));

    return shuffledPosts.length;
  });

  return { status: 'succeeded', successCount, failureCount: 0 };
}
