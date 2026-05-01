// Wave 0 stub -- implementation lands in Plan 03. Replace it.todo with real assertions during the GREEN phase.
import { describe, it } from 'vitest';

const endpoints = [
  'POST /api/bulk-import',
  'POST /api/posts/bulk-pause',
  'POST /api/posts/bulk-resume',
  'POST /api/posts/bulk-delete',
  'POST /api/posts/bulk-modify-tags',
  'POST /api/queues/:id/randomize',
  'POST /api/queues/:id/purge',
  'POST /api/queues/:id/copy',
  'POST /api/queues/:id/modify-text',
  'POST /api/queues/:id/dedupe',
  'GET /api/queues/:id/posts.csv',
] as const;

describe('bulk endpoint CSRF and auth gates', () => {
  for (const endpoint of endpoints) {
    it.todo(`${endpoint} rejects unauthenticated requests`);
    it.todo(`${endpoint} rejects unsafe requests without a valid CSRF token`);
  }
});
