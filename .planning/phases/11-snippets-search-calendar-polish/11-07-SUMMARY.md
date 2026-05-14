## Phase 11-07 Summary

Implemented the calendar API endpoint and verified it against real Postgres.

### Implemented

- Added `packages/api/src/routes/calendar.ts`
  - `GET /api/calendar`
  - validates query params with `calendarQuerySchema`
  - normalizes single-value query filters into arrays for `platforms`, `profileIds`, and `tagIds`
  - preserves tenant scoping with `eq(posts.userId, userId)` as the first condition
  - enforces window bounds through the shared schema
  - filters by `scope`, `platforms`, `profileIds`, `tagIds`, and optional FTS `search`
  - excludes rows missing `profileId` / `scheduledAt`
  - annotates each event with `hasConflict` by reusing `checkConflicts(...)`
- Wired the router into `packages/api/src/app.ts`
- Added `packages/api/src/__tests__/integration/calendar-api.test.ts`

### Verification

- `pnpm --filter @sms/api exec tsc --noEmit`
- `pnpm --filter @sms/api exec vitest run src/__tests__/integration/calendar-api.test.ts`

### Test Coverage

The integration test covers:

- strict `[from,to]` window bounds
- `>100 day` validation rejection
- `hasConflict` for same-profile posts within `±5 minutes`
- `scope='scheduled' | 'queued' | 'both'`
- `platforms`, `profileIds`, `tagIds`, and `search` filters
- cross-tenant isolation
- `textPreview` truncation to 60 characters
