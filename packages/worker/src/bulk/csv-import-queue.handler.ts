import { and, eq, max } from 'drizzle-orm';
import { posts, queues, snippets, socialProfiles } from '@sms/db';
import { csvImportQueueJobDataSchema, substituteSnippetsInText } from '@sms/shared';
import type { BulkJobContext, BulkJobData, BulkJobResult } from './common.js';
import { isBulkCsvRowError, writeBulkErrorReport } from './error-report.js';

export async function handleCsvImportQueue(
  job: { data: BulkJobData },
  ctx: BulkJobContext,
): Promise<BulkJobResult> {
  const parsedPayload = csvImportQueueJobDataSchema.safeParse(job.data.params);
  if (!parsedPayload.success) {
    throw new Error('Invalid queue CSV import job payload');
  }
  const { rows, errors: initialErrors, profileId, queueId } = parsedPayload.data;
  const errors = initialErrors.filter(isBulkCsvRowError);
  let successCount = 0;
  const userSnippets = await ctx.db
    .select({ name: snippets.name, body: snippets.body })
    .from(snippets)
    .where(eq(snippets.userId, job.data.userId));
  const snippetMap = new Map<string, string>(
    userSnippets.map((userSnippet) => [userSnippet.name.toLowerCase(), userSnippet.body]),
  );
  const validRows: typeof rows = [];

  for (const [index, row] of rows.entries()) {
    const { result, missing } = substituteSnippetsInText(
      row.text,
      (snippetName) => snippetMap.get(snippetName),
    );

    if (missing.length > 0) {
      for (const missingName of missing) {
        errors.push({
          rowNumber: index + 2,
          reason: `Unknown snippet "${missingName}"`,
          row,
        });
      }
      continue;
    }

    validRows.push({ ...row, text: result });
  }

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

  if (validRows.length > 0) {
    await ctx.db.transaction(async (tx) => {
      const [maxRow] = await tx
        .select({ maxPosition: max(posts.queuePosition) })
        .from(posts)
        .where(eq(posts.queueId, queue.id));
      let nextPosition = Number(maxRow?.maxPosition ?? 0) + 1;

      for (const row of validRows) {
        await tx.insert(posts).values({
          userId: job.data.userId,
          profileId,
          platform: profile.platform,
          text: row.text,
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
  }

  const errorReportPath = await writeBulkErrorReport(
    ctx.storageRoot,
    job.data.bulkOperationId,
    errors,
  );

  return {
    status: successCount === 0 && errors.length > 0 ? 'failed' : errors.length > 0 ? 'partial' : 'succeeded',
    successCount,
    failureCount: errors.length,
    errorReportPath,
  };
}
