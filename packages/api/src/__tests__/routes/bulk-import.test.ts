// Wave 0 stub -- implementation lands in Plan 03. Replace it.todo with real assertions during the GREEN phase.
import { describe, it } from 'vitest';

describe('bulk import route', () => {
  it.todo('parses streaming CSV rows with csv-parse v6 and bom:true');
  it.todo('returns 409 twitter_budget_exceeded when projected monthly Twitter posts exceed budget');
  it.todo('commits valid rows and writes errors-{jobId}.csv on partial success');
  it.todo('rejects oversized.csv with 413 via multer fileSize limit');
  it.todo('rejects non-CSV MIME uploads before parsing');
  it.todo('requires an authenticated session and applies bulkOperationsLimiter');
  it.todo('enforces CSRF token on multipart upload');
});
