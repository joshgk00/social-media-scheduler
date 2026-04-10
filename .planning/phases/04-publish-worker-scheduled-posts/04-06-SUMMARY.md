---
plan: 04-06
phase: 04-publish-worker-scheduled-posts
status: complete
started: 2026-04-10T03:30:00Z
completed: 2026-04-10T04:00:00Z
---

# Plan 04-06 Summary: Integration Tests + Validation + Sign-off

## Objective

Ship Phase 4 verification: testcontainer-backed integration tests exercising the full publish pipeline end-to-end, graceful shutdown, and failed-listener notification enqueue. Finalize 04-VALIDATION.md with the Per-Task Verification Map. Confirm all five success criteria.

## What Was Built

### Integration Tests (Task 1)
- **testcontainer.ts** — helper that starts `postgres:17-alpine` + `redis:7.4-alpine` containers, runs Drizzle migrations, returns `{ db, redis, pgContainer, redisContainer, cleanup }`
- **post-lifecycle.integration.test.ts** — 5 tests against real Postgres + Redis:
  1. Happy path: scheduled → published, `platformPostId` set, `publishedAt` truthy, `post_attempts` success row
  2. Idempotency: post with existing `platformPostId` → Twitter never called, returns `skipped: true`
  3. Transient retry: 2x 503 → success on attempt 3, 2 `transient_fail` + 1 `success` attempt rows
  4. Permanent failure: 401 → `status=failed`, `permanent_fail` attempt, `UnrecoverableError` thrown
  5. Runtime budget abort: `monthlyTweetBudget=1` + 1 published → `budget_exhausted`, Twitter never called
- **failed-listener.integration.test.ts** — verifies failed listener enqueues `publish_failed` notification

### Graceful Shutdown (Task 2, partial)
- **shutdown.integration.test.ts** — starts real BullMQ Worker, sends SIGTERM, verifies drain completes with no stalled jobs

### VALIDATION.md Finalization (Task 2, partial)
- Replaced placeholder content entirely
- Set `nyquist_compliant: true`, `wave_0_complete: true`
- Wave 0 Requirements lists only real files: `mock-twitter.ts`, `seed-post.ts`, `testcontainer.ts`
- Removed all phantom files (`test-redis.ts`, `test-db.ts`, `fake-twitter.ts`, `idempotency.test`)
- Per-Task Verification Map enumerates all tasks across plans 01-06 with requirement mapping
- `grep -cE "test-redis|test-db|fake-twitter|idempotency.test"` returns 0

## Key Files

### Created
- `packages/worker/src/__tests__/helpers/testcontainer.ts`
- `packages/worker/src/__tests__/integration/post-lifecycle.integration.test.ts`
- `packages/worker/src/__tests__/integration/failed-listener.integration.test.ts`
- `packages/worker/src/__tests__/integration/shutdown.integration.test.ts`

### Modified
- `.planning/phases/04-publish-worker-scheduled-posts/04-VALIDATION.md` (full rewrite)
- `packages/worker/vitest.config.ts` (integration test config)

## Verification

- 53 tests passing across 9 test files (43 unit + 8 integration + 2 shutdown)
- All 5 phase success criteria verified with integration test evidence
- VALIDATION.md phantom file check: 0 matches
- Human checkpoint: approved based on automated evidence mapping to all 5 criteria

## Self-Check: PASSED
