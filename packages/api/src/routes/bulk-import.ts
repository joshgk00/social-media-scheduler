import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { DateTime } from 'luxon';
import { and, eq } from 'drizzle-orm';
import { bulkImportRequestSchema, csvQueueRowSchema, csvScheduledRowSchema, JOB_NAMES } from '@sms/shared';
import { bulkOperations, queues, socialProfiles } from '@sms/db';
import type { Db } from '@sms/db';
import { requireAuth } from '../middleware/auth-guard.js';
import { bulkOperationsLimiter } from '../middleware/rate-limiter.js';
import { csvUpload } from '../middleware/csv-upload.js';
import { checkBulkBudgetWithDb } from '../services/rate-limit.service.js';
import { parseCsvBuffer, writeErrorReport } from '../services/bulk-import.service.js';
import type { BulkOpsQueueService } from '../services/bulk-ops-queue.service.js';

interface BulkImportRouterDeps {
  db: Db;
  bulkOpsQueueService: BulkOpsQueueService;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestCorrelationId(req: { id?: string }): string {
  return req.id ?? randomUUID();
}

function parseIdempotencyKey(rawHeader: string | undefined): string | null {
  if (rawHeader === undefined) return randomUUID();
  const idempotencyKey = rawHeader.trim();
  return UUID_PATTERN.test(idempotencyKey) ? idempotencyKey : null;
}

export function createBulkImportRouter({ db, bulkOpsQueueService }: BulkImportRouterDeps): Router {
  const router = Router();

  router.post(
    '/',
    requireAuth,
    bulkOperationsLimiter,
    csvUpload.single('file'),
    async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'CSV file is required' });
        return;
      }

      const parsedBody = bulkImportRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(400).json({ error: 'Validation failed', details: parsedBody.error.issues });
        return;
      }

      const userId = req.session.userId!;
      const { target, profileId, queueId } = parsedBody.data;
      const idempotencyKey = parseIdempotencyKey(req.get('Idempotency-Key'));
      if (!idempotencyKey) {
        res.status(400).json({ error: 'Invalid Idempotency-Key header' });
        return;
      }

      const [existingBulkOperation] = await db
        .select({ id: bulkOperations.id })
        .from(bulkOperations)
        .where(and(
          eq(bulkOperations.userId, userId),
          eq(bulkOperations.idempotencyKey, idempotencyKey),
        ));
      if (existingBulkOperation) {
        res.status(202).json({
          bulkOperationId: existingBulkOperation.id,
          jobId: null,
          replay: true,
        });
        return;
      }

      const [profile] = await db
        .select({ id: socialProfiles.id, platform: socialProfiles.platform })
        .from(socialProfiles)
        .where(and(eq(socialProfiles.id, profileId), eq(socialProfiles.userId, userId)));

      if (!profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }

      const parsedCsv = target === 'scheduled'
        ? await parseCsvBuffer(req.file.buffer, csvScheduledRowSchema)
        : await parseCsvBuffer(req.file.buffer, csvQueueRowSchema);

      let queueName: string | null = null;
      if (target === 'queue') {
        const [queue] = await db
          .select({ id: queues.id, name: queues.name, profileId: queues.profileId })
          .from(queues)
          .where(and(
            eq(queues.id, queueId!),
            eq(queues.userId, userId),
            eq(queues.profileId, profileId),
          ));
        if (!queue) {
          res.status(404).json({ error: 'Queue not found' });
          return;
        }
        queueName = queue.name;
        const mismatchedRows = parsedCsv.rows.filter((row) => {
          const queueRow = row as { queue_name?: string };
          return queueRow.queue_name !== queue.name;
        });
        if (mismatchedRows.length > 0) {
          res.status(400).json({
            error: 'queue_name_mismatch',
            expected: queue.name,
            mismatchedRows: mismatchedRows.length,
          });
          return;
        }
      }

      if (target === 'scheduled' && profile.platform === 'twitter') {
        const monthStart = DateTime.utc().startOf('month');
        const attemptedAdditional = parsedCsv.rows.filter((row) => {
          if (!('scheduled_at' in (row as Record<string, unknown>))) {
            return false;
          }
          return DateTime
            .fromISO(String((row as Record<string, unknown>).scheduled_at), { zone: 'utc' })
            .toUTC()
            .hasSame(monthStart, 'month');
        }).length;

        const budget = await checkBulkBudgetWithDb(db, {
          profileId,
          additionalCount: attemptedAdditional,
        });

        if (budget.wouldExceed) {
          res.status(409).json({
            code: 'twitter_budget_exceeded',
            budget: budget.budget,
            currentCount: budget.currentUsage,
            attemptedAdditional,
          });
          return;
        }
      }

      const operationType = target === 'scheduled'
        ? JOB_NAMES.bulkCsvImportScheduled
        : JOB_NAMES.bulkCsvImportQueue;
      const targetId = target === 'scheduled' ? profileId : queueId!;
      const [bulkOperation] = await db
        .insert(bulkOperations)
        .values({
          userId,
          operationType,
          targetKind: target === 'scheduled' ? 'profile' : 'queue',
          targetId,
          idempotencyKey,
          payload: {
            target,
            profileId,
            queueId,
            queueName,
            parsedCount: parsedCsv.rows.length,
            errorCount: parsedCsv.errors.length,
          },
        })
        .returning();

      const errorReportPath = await writeErrorReport(
        process.env.MEDIA_DIR || './data/media',
        bulkOperation.id,
        parsedCsv.errors,
      );
      if (errorReportPath) {
        await db
          .update(bulkOperations)
          .set({ errorReportPath, failureCount: parsedCsv.errors.length })
          .where(eq(bulkOperations.id, bulkOperation.id));
      }

      const job = await bulkOpsQueueService.enqueueBulkOp(
        operationType,
        {
          bulkOperationId: bulkOperation.id,
          userId,
          operationType,
          targetKind: target === 'scheduled' ? 'profile' : 'queue',
          targetId,
          idempotencyKey,
          data: target === 'scheduled'
            ? { profileId, rows: parsedCsv.rows, errors: parsedCsv.errors }
            : { profileId, queueId, rows: parsedCsv.rows, errors: parsedCsv.errors },
          correlationId: requestCorrelationId(req as { id?: string }),
        },
        Math.floor(Date.now() / 1000),
      );

      res.status(202).json({
        bulkOperationId: bulkOperation.id,
        jobId: job.id,
        parsedCount: parsedCsv.rows.length,
        errorCount: parsedCsv.errors.length,
      });
    },
  );

  router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'CSV file exceeds 10 MB limit' });
      return;
    }
    if (err instanceof Error && err.message.includes('row limit')) {
      res.status(413).json({ error: err.message });
      return;
    }
    if (err instanceof Error && err.message.includes('CSV')) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  });

  return router;
}
