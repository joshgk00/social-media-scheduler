import { and, eq, inArray } from 'drizzle-orm';
import { posts } from '@sms/db';
import { dedupeKey } from '@sms/shared';
import type { BulkJobContext, BulkJobData, BulkJobResult } from './common.js';

export async function handleQueueDedupe(
  job: { data: BulkJobData },
  ctx: BulkJobContext,
): Promise<BulkJobResult> {
  const queueId = job.data.targetId;
  if (!queueId) throw new Error('Queue targetId is required');

  const postRows = await ctx.db
    .select({
      id: posts.id,
      text: posts.text,
      hasSpinnableText: posts.hasSpinnableText,
      queuePosition: posts.queuePosition,
    })
    .from(posts)
    .where(and(eq(posts.queueId, queueId), eq(posts.userId, job.data.userId)));
  const sortedRows = [...postRows].sort((left, right) => (left.queuePosition ?? 0) - (right.queuePosition ?? 0));
  const seen = new Set<string>();
  const duplicateIds: string[] = [];

  for (const post of sortedRows) {
    const key = dedupeKey(post);
    if (seen.has(key)) {
      duplicateIds.push(post.id);
      continue;
    }
    seen.add(key);
  }

  if (duplicateIds.length > 0) {
    await ctx.db.delete(posts).where(inArray(posts.id, duplicateIds));
  }

  return { status: 'succeeded', successCount: duplicateIds.length, failureCount: 0 };
}
