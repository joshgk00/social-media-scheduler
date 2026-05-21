import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildCsvValidationFailure, createBulkImportRouter } from '../../routes/bulk-import.js';

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440012';
const IDEMPOTENCY_KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('bulk import route', () => {
  it.todo('parses streaming CSV rows with csv-parse v6 and bom:true');
  it.todo('returns 409 twitter_budget_exceeded when projected monthly Twitter posts exceed budget');
  it.todo('commits valid rows and writes errors-{jobId}.csv on partial success');
  it.todo('rejects oversized.csv with 413 via multer fileSize limit');
  it.todo('rejects non-CSV MIME uploads before parsing');
  it.todo('requires an authenticated session and applies bulkOperationsLimiter');
  it.todo('enforces CSRF token on multipart upload');

  it('builds a 400 body with row details for schema-invalid CSV rows', () => {
    expect(
      buildCsvValidationFailure({
        rows: [],
        errors: [
          {
            rowNumber: 2,
            reason: 'scheduled_at: Invalid datetime',
            row: { text: 'hello', scheduled_at: 'not-a-date' },
          },
        ],
      }),
    ).toEqual({
      error: 'CSV validation failed',
      code: 'csv_validation_failed',
      errorCount: 1,
      details: [{ rowNumber: 2, reason: 'scheduled_at: Invalid datetime' }],
    });
  });

  it('returns idempotency replay before requiring a CSV file or loading profile state', async () => {
    const replayedOperation = {
      bulkOperationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      jobId: null,
      replay: true,
    };
    const db = {
      select: vi.fn(() => {
        throw new Error('profile lookup should not run for idempotency replay');
      }),
    };
    const bulkOperationFactory = {
      findExistingBulkOperation: vi.fn().mockResolvedValue(replayedOperation),
      startBulkOperation: vi.fn(),
    };
    const app = express();
    app.use((req, _res, next) => {
      (req as typeof req & { session: { userId: string } }).session = { userId: USER_ID };
      next();
    });
    app.use('/bulk-import', createBulkImportRouter({
      db: db as never,
      bulkOperationFactory: bulkOperationFactory as never,
    }));

    const response = await request(app)
      .post('/bulk-import')
      .set('Idempotency-Key', IDEMPOTENCY_KEY)
      .field('target', 'scheduled')
      .field('profileId', PROFILE_ID);

    expect(response.status).toBe(202);
    expect(response.body).toEqual(replayedOperation);
    expect(bulkOperationFactory.findExistingBulkOperation).toHaveBeenCalledWith({
      userId: USER_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(db.select).not.toHaveBeenCalled();
    expect(bulkOperationFactory.startBulkOperation).not.toHaveBeenCalled();
  });
});
