import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { DateTime } from 'luxon';
import { and, eq } from 'drizzle-orm';
import { bulkImportRequestSchema, csvQueueRowSchema, csvScheduledRowSchema, JOB_NAMES } from '@sms/shared';
import { queues, socialProfiles } from '@sms/db';
import type { Db } from '@sms/db';
import { requireAuth } from '../middleware/auth-guard.js';
import { bulkOperationsLimiter } from '../middleware/rate-limiter.js';
import { csvUpload } from '../middleware/csv-upload.js';
import { checkBulkBudgetWithDb } from '../services/rate-limit.service.js';
import { CsvParseError, parseCsvBuffer } from '../services/bulk-import.service.js';
import type { CsvRowError } from '../services/bulk-import.service.js';
import { InvalidIdempotencyKeyError, type BulkOperationFactory } from '../services/bulk-operation.factory.js';

interface BulkImportRouterDeps {
  db: Db;
  bulkOperationFactory: BulkOperationFactory;
}

function requestCorrelationId(req: { id?: string }): string {
  return req.id ?? randomUUID();
}

function csvValidationDetails(errors: CsvRowError[]) {
  return errors.slice(0, 10).map((error) => ({
    rowNumber: error.rowNumber,
    reason: error.reason,
  }));
}

export function buildCsvValidationFailure(parsedCsv: { rows: unknown[]; errors: CsvRowError[] }) {
  if (parsedCsv.errors.length > 0) {
    return {
      error: 'CSV validation failed',
      code: 'csv_validation_failed',
      errorCount: parsedCsv.errors.length,
      details: csvValidationDetails(parsedCsv.errors),
    };
  }

  if (parsedCsv.rows.length === 0) {
    return {
      error: 'CSV validation failed',
      code: 'csv_validation_failed',
      errorCount: 0,
      details: [{ reason: 'CSV must include at least one data row.' }],
    };
  }

  return null;
}

function rejectInvalidCsv(res: Response, parsedCsv: { rows: unknown[]; errors: CsvRowError[] }): boolean {
  const failure = buildCsvValidationFailure(parsedCsv);
  if (failure) {
    res.status(400).json(failure);
    return true;
  }

  return false;
}

export function createBulkImportRouter({ db, bulkOperationFactory }: BulkImportRouterDeps): Router {
  const router = Router();

  router.post(
    '/',
    requireAuth,
    bulkOperationsLimiter,
    csvUpload.single('file'),
    async (req, res) => {
      const parsedBody = bulkImportRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(400).json({ error: 'Validation failed', details: parsedBody.error.issues });
        return;
      }

      const userId = req.session.userId!;
      const { target, profileId, queueId } = parsedBody.data;
      const idempotencyKey = req.get('Idempotency-Key');

      try {
        const replayedBulkOperation = await bulkOperationFactory.findExistingBulkOperation({
          userId,
          idempotencyKey,
        });
        if (replayedBulkOperation) {
          res.status(202).json(replayedBulkOperation);
          return;
        }
      } catch (err) {
        if (err instanceof InvalidIdempotencyKeyError) {
          res.status(400).json({ error: err.message });
          return;
        }
        throw err;
      }

      if (!req.file) {
        res.status(400).json({ error: 'CSV file is required' });
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
      if (rejectInvalidCsv(res, parsedCsv)) {
        return;
      }

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

      try {
        const bulkOperation = await bulkOperationFactory.startBulkOperation({
          userId,
          idempotencyKey,
          operationType,
          targetKind: target === 'scheduled' ? 'profile' : 'queue',
          targetId,
          params: target === 'scheduled'
            ? { profileId, rows: parsedCsv.rows, errors: parsedCsv.errors }
            : { profileId, queueId, rows: parsedCsv.rows, errors: parsedCsv.errors },
          correlationId: requestCorrelationId(req as { id?: string }),
        });

        res.status(202).json(bulkOperation.replay
          ? bulkOperation
          : {
              ...bulkOperation,
              parsedCount: parsedCsv.rows.length,
              errorCount: parsedCsv.errors.length,
            });
      } catch (err) {
        if (err instanceof InvalidIdempotencyKeyError) {
          res.status(400).json({ error: err.message });
          return;
        }
        throw err;
      }
    },
  );

  router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'CSV file exceeds 10 MB limit' });
      return;
    }
    if (err instanceof CsvParseError) {
      res.status(400).json({
        error: 'CSV parse failed',
        code: err.code,
        details: [{ reason: err.message }],
      });
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
