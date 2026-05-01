import { posts, socialProfiles } from '@sms/db';
import { and, eq } from 'drizzle-orm';
import { csvImportScheduledJobDataSchema } from '@sms/shared';
import type { BulkJobContext, BulkJobData, BulkJobResult } from './common.js';

export async function handleCsvImportScheduled(
  job: { data: BulkJobData },
  ctx: BulkJobContext,
): Promise<BulkJobResult> {
  const parsedPayload = csvImportScheduledJobDataSchema.safeParse(job.data.params);
  if (!parsedPayload.success) {
    throw new Error('Invalid scheduled CSV import job payload');
  }
  const { rows, errors, profileId } = parsedPayload.data;

  if (rows.length > 0) {
    const [profile] = await ctx.db
      .select({ platform: socialProfiles.platform })
      .from(socialProfiles)
      .where(and(
        eq(socialProfiles.id, profileId),
        eq(socialProfiles.userId, job.data.userId),
      ));
    if (!profile) throw new Error('Profile not found for bulk CSV import');

    await ctx.db.transaction(async (tx) => {
      await tx.insert(posts).values(rows.map((row) => ({
        userId: job.data.userId,
        profileId,
        platform: profile.platform,
        text: String(row.text),
        status: 'scheduled' as const,
        scheduledAt: new Date(String(row.scheduled_at)),
        hasSpinnableText: row.spinnable === true,
        autoDestructAfter: typeof row.auto_destruct_after === 'string' ? row.auto_destruct_after : null,
        notes: typeof row.notes === 'string' ? row.notes : null,
      })));
    });
  }

  return {
    status: rows.length === 0 && errors.length > 0 ? 'failed' : errors.length > 0 ? 'partial' : 'succeeded',
    successCount: rows.length,
    failureCount: errors.length,
  };
}
