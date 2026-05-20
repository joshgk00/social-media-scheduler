import { describe, expect, it } from 'vitest';
import { buildCsvValidationFailure } from '../../routes/bulk-import.js';

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
});
