import { posts, snippets, socialProfiles } from '@sms/db';
import { and, eq } from 'drizzle-orm';
import { csvImportScheduledJobDataSchema, substituteSnippetsInText } from '@sms/shared';
import type { BulkJobContext, BulkJobData, BulkJobResult } from './common.js';
import { isBulkCsvRowError, writeBulkErrorReport } from './error-report.js';

export async function handleCsvImportScheduled(
  job: { data: BulkJobData },
  ctx: BulkJobContext,
): Promise<BulkJobResult> {
  const parsedPayload = csvImportScheduledJobDataSchema.safeParse(job.data.params);
  if (!parsedPayload.success) {
    throw new Error('Invalid scheduled CSV import job payload');
  }
  const { rows, errors: initialErrors, profileId } = parsedPayload.data;
  const errors = initialErrors.filter(isBulkCsvRowError);
  const userSnippets = await ctx.db
    .select({ name: snippets.name, body: snippets.body })
    .from(snippets)
    .where(eq(snippets.userId, job.data.userId));
  const snippetMap = new Map<string, string>(
    userSnippets.map((userSnippet) => [userSnippet.name.toLowerCase(), userSnippet.body]),
  );
  const validRows: typeof rows = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = row.rowNumber ?? index + 2;
    const { result, missing } = substituteSnippetsInText(
      row.text,
      (snippetName) => snippetMap.get(snippetName),
    );

    if (missing.length > 0) {
      for (const missingName of missing) {
        errors.push({
          rowNumber,
          reason: `Unknown snippet "${missingName}"`,
          row,
        });
      }
      continue;
    }

    validRows.push({ ...row, text: result });
  }

  if (validRows.length > 0) {
    const [profile] = await ctx.db
      .select({ platform: socialProfiles.platform })
      .from(socialProfiles)
      .where(and(
        eq(socialProfiles.id, profileId),
        eq(socialProfiles.userId, job.data.userId),
      ));
    if (!profile) throw new Error('Profile not found for bulk CSV import');

    await ctx.db.transaction(async (tx) => {
      await tx.insert(posts).values(validRows.map((row) => ({
        userId: job.data.userId,
        profileId,
        platform: profile.platform,
        text: row.text,
        status: 'scheduled' as const,
        scheduledAt: new Date(String(row.scheduled_at)),
        hasSpinnableText: row.spinnable === true,
        autoDestructAfter: typeof row.auto_destruct_after === 'string' ? row.auto_destruct_after : null,
        notes: typeof row.notes === 'string' ? row.notes : null,
      })));
    });
  }

  const errorReportPath = await writeBulkErrorReport(
    ctx.storageRoot,
    job.data.bulkOperationId,
    errors,
  );

  return {
    status: validRows.length === 0 && errors.length > 0 ? 'failed' : errors.length > 0 ? 'partial' : 'succeeded',
    successCount: validRows.length,
    failureCount: errors.length,
    errorReportPath,
  };
}
