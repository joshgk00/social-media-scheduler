import { and, eq, max } from 'drizzle-orm';
import { posts, queues, socialProfiles } from '@sms/db';
import { csvImportQueueJobDataSchema } from '@sms/shared';
import type { BulkJobContext, BulkJobData, BulkJobResult } from './common.js';

export async function handleCsvImportQueue(
  job: { data: BulkJobData },
  ctx: BulkJobContext,
): Promise<BulkJobResult> {
  const parsedPayload = csvImportQueueJobDataSchema.safeParse(job.data.data);
  if (!parsedPayload.success) {
    throw new Error('Invalid queue CSV import job payload');
  }
  const { rows, errors: initialErrors, profileId, queueId } = parsedPayload.data;
  const errors = [...initialErrors];
  let successCount = 0;
  const [profile] = await ctx.db
    .select({ platform: socialProfiles.platform })
    .from(socialProfiles)
    .where(and(
      eq(socialProfiles.id, profileId),
      eq(socialProfiles.userId, job.data.userId),
    ));
  if (!profile) throw new Error('Profile not found for bulk CSV import');

  const [queue] = await ctx.db
    .select({ id: queues.id, profileId: queues.profileId })
    .from(queues)
    .where(and(
      eq(queues.id, queueId),
      eq(queues.userId, job.data.userId),
      eq(queues.profileId, profileId),
    ));
  if (!queue) throw new Error('Queue not found for bulk CSV import');

  await ctx.db.transaction(async (tx) => {
    const [maxRow] = await tx
      .select({ maxPosition: max(posts.queuePosition) })
      .from(posts)
      .where(eq(posts.queueId, queue.id));
    let nextPosition = Number(maxRow?.maxPosition ?? 0) + 1;

    for (const row of rows) {
      await tx.insert(posts).values({
        userId: job.data.userId,
        profileId,
        platform: profile.platform,
        text: String(row.text),
        status: 'queued',
        queueId: queue.id,
        queuePosition: nextPosition,
        hasSpinnableText: row.spinnable === true,
        autoDestructAfter: typeof row.auto_destruct_after === 'string' ? row.auto_destruct_after : null,
        notes: typeof row.notes === 'string' ? row.notes : null,
      });
      successCount += 1;
      nextPosition += 1;
    }
  });

  return {
    status: successCount === 0 && errors.length > 0 ? 'failed' : errors.length > 0 ? 'partial' : 'succeeded',
    successCount,
    failureCount: errors.length,
  };
}
