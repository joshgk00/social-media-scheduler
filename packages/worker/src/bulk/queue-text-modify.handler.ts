import { and, eq } from 'drizzle-orm';
import { posts } from '@sms/db';
import { getPlatformCharCount, queueTextModifyInputSchema, type QueueTextModifyInput } from '@sms/shared';
import type { BulkJobContext, BulkJobData, BulkJobResult } from './common.js';

function applyTextModifyMode(text: string, modifyParams: QueueTextModifyInput): string {
  switch (modifyParams.mode) {
    case 'append':
      return `${text}${modifyParams.separator}${modifyParams.text}`;
    case 'remove':
      return text.replaceAll(modifyParams.text, '');
    case 'replace':
      return text.replaceAll(modifyParams.find, modifyParams.replace);
  }
}

export async function handleQueueTextModify(
  job: { data: BulkJobData },
  ctx: BulkJobContext,
): Promise<BulkJobResult> {
  const queueId = job.data.targetId;
  if (!queueId) throw new Error('Queue targetId is required');
  const parsedInput = queueTextModifyInputSchema.safeParse(job.data.params);
  if (!parsedInput.success) {
    throw new Error('Invalid queue text modify job payload');
  }

  const queuePosts = await ctx.db
    .select({ id: posts.id, text: posts.text, platform: posts.platform })
    .from(posts)
    .where(and(eq(posts.queueId, queueId), eq(posts.userId, job.data.userId)));
  let updatedCount = 0;
  let skippedCount = 0;

  await ctx.db.transaction(async (tx) => {
    for (const post of queuePosts) {
      const nextText = applyTextModifyMode(post.text, parsedInput.data);
      const charCount = getPlatformCharCount(
        nextText,
        post.platform as 'twitter' | 'linkedin' | 'facebook',
      );
      if (charCount.exceedsCap) {
        skippedCount += 1;
        continue;
      }
      await tx.update(posts).set({ text: nextText, updatedAt: new Date() }).where(eq(posts.id, post.id));
      updatedCount += 1;
    }
  });

  return {
    status: skippedCount > 0 ? 'partial' : 'succeeded',
    successCount: updatedCount,
    failureCount: skippedCount,
  };
}
