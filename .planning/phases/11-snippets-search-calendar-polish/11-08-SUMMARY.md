## Phase 11-08 Summary

Implemented snippet substitution in both CSV import worker handlers and verified it against real Postgres.

### Implemented

- Updated `packages/worker/src/bulk/csv-import-scheduled.handler.ts`
- Updated `packages/worker/src/bulk/csv-import-queue.handler.ts`
- Added `packages/worker/src/bulk/error-report.ts`
- Added `packages/worker/src/bulk/__tests__/csv-import-scheduled.handler.test.ts`

### Behavior Changes

- Each CSV import job now loads the calling user’s snippets once and builds a lowercase lookup map
- Each row runs through `substituteSnippetsInText(...)` before insert
- Rows with missing snippet names:
  - are excluded from insert
  - increment `failureCount`
  - are written into a bulk CSV error report
- Inserted `posts.text` values are the substituted text, not the raw `{{snippet:name}}` token

### Additional Contract Fix

The worker job payload schema was validating against the raw CSV input shape, but the API enqueues already-normalized rows from `parseCsvBuffer(...)` (`tags` arrays, boolean `spinnable`, numeric `position`). I corrected `packages/shared/src/schemas/bulk-import.ts` so the worker validates the actual queued payload shape.

### Verification

- `pnpm --filter @sms/shared build`
- `pnpm --filter @sms/worker exec tsc --noEmit`
- `pnpm --filter @sms/worker exec vitest run src/bulk/__tests__/csv-import-scheduled.handler.test.ts`

### Test Coverage

The worker tests cover:

- scheduled happy-path substitution
- missing snippet rejection + error report generation
- mixed three-row import with the `{{` / `}}` invariant
- case-insensitive snippet names
- cross-tenant snippet isolation
- queue import substitution parity
