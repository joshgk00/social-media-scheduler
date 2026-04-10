---
phase: 04-publish-worker-scheduled-posts
plan: 3
subsystem: worker
tags: [bullmq, twitter-api-v2, drizzle, luxon, pino, ioredis]

requires:
  - phase: 04-publish-worker-scheduled-posts/01
    provides: post_attempts table, social_profiles monthly_tweet_budget + warn_threshold_percent, posts.post_version
  - phase: 04-publish-worker-scheduled-posts/02
    provides: "@sms/shared queue constants, classifyTwitterError, checkTwitterBudget pure calculator, publish-queue service"
provides:
  - BullMQ publish worker with concurrency=2 and custom backoff strategy
  - Reconciliation scanner with drizzle isNull(posts.platformPostId) predicate
  - Transactional post-lifecycle service (SELECT FOR UPDATE, optimistic lock, idempotency)
  - Worker-owned rate-limit wrapper delegating to @sms/shared pure calculator
  - Worker-owned Drizzle client factory (createWorkerDb) with bounded pool
  - Twitter publish service with AES-256-GCM credential decryption scoped to a single function
  - Graceful SIGTERM/SIGINT shutdown with 30s per-resource timeout and try/catch isolation
affects: [phase-04-plan-04, phase-04-plan-05, phase-04-plan-06, phase-05-queue-engine, phase-09-notifications]

tech-stack:
  added:
    - bullmq ~5.73.0 (Worker, Queue, UnrecoverableError, custom backoffStrategy)
    - twitter-api-v2 ~1.29.0 (TwitterApi, ApiResponseError)
    - drizzle-orm ~0.45.2 (postgres-js adapter, isNull helper)
    - postgres ~3.4.9 (connection pool)
    - luxon ~3.7.2 (DateTime.utc().startOf('month') for month boundary)
  patterns:
    - Factory functions for workers (createPublishWorker, createPublishHandler, startScanner, createWorkerDb)
    - Env vars read inside main() — never at module scope
    - SELECT FOR UPDATE short lock, Twitter call OUTSIDE the transaction
    - Two-layer idempotency (platform_post_id column check + unique index backstop)
    - Pure error classifier + thin DB wrapper (zero cross-package drift)
    - Graceful shutdown with per-resource try/catch and Promise.race timeout

key-files:
  created:
    - packages/worker/src/db.ts
    - packages/worker/src/backoff.ts
    - packages/worker/src/rate-limit.ts
    - packages/worker/src/twitter-publish.service.ts
    - packages/worker/src/post-lifecycle.service.ts
    - packages/worker/src/publish-worker.ts
    - packages/worker/src/scanner.ts
    - packages/worker/src/__tests__/backoff.test.ts
    - packages/worker/src/__tests__/rate-limit.test.ts
    - packages/worker/src/__tests__/post-lifecycle.test.ts
    - packages/worker/src/__tests__/publish-worker.test.ts
    - packages/worker/src/__tests__/scanner.test.ts
    - packages/worker/src/__tests__/helpers/mock-db.ts
    - packages/worker/src/__tests__/helpers/mock-twitter.ts
    - packages/worker/src/__tests__/helpers/seed-post.ts
  modified:
    - packages/worker/src/index.ts

key-decisions:
  - "Worker package imports zero @sms/api modules — rate-limit wrapper is local and delegates to the shared pure calculator"
  - "Twitter call happens OUTSIDE the SELECT FOR UPDATE transaction to avoid serializing workers behind network I/O"
  - "Plaintext OAuth tokens live only as function-local consts inside callTwitter — never cached, never logged"
  - "Scanner WORKER-03 scope limited to scheduledAt timing; queue recurrence (day-of-week, hour window, interval) is Phase 5"
  - "Threads (isThread=true) rejected via PostLifecycleAbort('thread_unsupported') so Phase 4.5 can pick them up cleanly"
  - "Scanner enqueue test asserts isNull() predicate via util.inspect (drizzle nodes have cycles, JSON.stringify fails)"
  - "Backoff strategy exposed as BullMQ's BackoffStrategy type (optional params, MinimalJob) instead of a narrower custom signature"
  - "Lifecycle tests use the Phase 2/3 mock-db pattern rather than testcontainers — keeps the suite fast and deterministic"

patterns-established:
  - "Factory pattern: createPublishWorker/createPublishHandler split so tests exercise the handler without BullMQ"
  - "Mock-db helper uses separate queues for execute() and select() calls, letting lifecycle tests seed raw FOR UPDATE rows"
  - "PostLifecycleAbort carries a typed reason string — handler returns {skipped:true, skipReason} for graceful aborts, only real failures throw"
  - "Worker shutdown uses closeWithTimeout(name, fn) with Promise.race(30s) and per-resource try/catch — one failure does not skip siblings"
  - "Runtime rate-limit re-check inside SELECT FOR UPDATE transaction (D-26/LIMIT-03) leaves post scheduled for next scanner pass"

requirements-completed:
  - WORKER-01
  - WORKER-02
  - WORKER-03
  - WORKER-04
  - WORKER-05
  - WORKER-06
  - WORKER-07
  - WORKER-08
  - LIMIT-03

duration: ~25min
completed: 2026-04-09
---

# Phase 4 Plan 3: Publish Worker Pipeline Summary

**BullMQ publish worker with transactional SELECT-FOR-UPDATE lifecycle, reconciliation scanner using drizzle isNull() idempotency guard, custom Retry-After backoff, and graceful SIGTERM shutdown — all delivered with zero @sms/api imports in the worker package.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 (both committed atomically)
- **Files created:** 15
- **Files modified:** 1 (packages/worker/src/index.ts)
- **Tests added:** 42 (6 backoff + 6 rate-limit + 11 post-lifecycle + 10 publish-worker + 9 scanner; 45 worker tests total including the existing 3 heartbeat tests)

## Accomplishments

- **Transactional publish lifecycle** that enforces three-layer idempotency: (a) the `platform_post_id IS NOT NULL` guard inside the SELECT FOR UPDATE transaction, (b) the drizzle `isNull(posts.platformPostId)` filter in the scanner query, (c) the uniqueIndex from Phase 1 as the hard DB backstop.
- **Custom BullMQ backoff strategy** implementing the 30s → 5min → 30min schedule with a Twitter `rateLimit.reset` override (clamped to 30 min max).
- **Reconciliation scanner** with the Phase 4 scope split clearly documented in-source: scheduledAt timing comparison only; queue recurrence explicitly deferred to Phase 5 with a source comment.
- **Credential discipline**: `callTwitter` decrypts OAuth tokens as function-local consts, passes them straight to the TwitterApi constructor, and never touches `logger.*`. Unit test in post-lifecycle covers the error-path classification without exercising real decrypt.
- **Graceful shutdown** using `closeWithTimeout(name, fn)` with Promise.race(30s) and per-resource try/catch. Close order: publishWorker → scannerWorker → publishQueue → scannerQueue → notificationQueue → pgClient → redis.quit().
- **Zero @sms/api imports in packages/worker/src/** verified by grep (see Self-Check below).

## Task Commits

1. **Task 1: backoff + lifecycle + twitter publish + rate-limit wrapper + worker db** — `b3929a6` (feat)
2. **Task 2: publish worker + scanner + index wiring + graceful shutdown** — `b09a876` (feat)

## Files Created/Modified

### Created
- `packages/worker/src/db.ts` — `createWorkerDb(databaseUrl)` factory. Bounded pool (max 5, idle 20s, connect 10s). Returns `{db, pgClient}` so shutdown can close the driver.
- `packages/worker/src/backoff.ts` — `buildBackoffStrategy()` with 30s/5min/30min schedule and Twitter Retry-After override (clamped at 30 min). Registered inside the Worker constructor's `settings.backoffStrategy`.
- `packages/worker/src/rate-limit.ts` — `loadWorkerUsage` + `checkBudgetForWorker`. Same COUNTED_STATUSES list as the api wrapper. Delegates to `checkTwitterBudget` from `@sms/shared`.
- `packages/worker/src/twitter-publish.service.ts` — `callTwitter({profile, postText, isThread, correlationId})`. Validates all 12 encrypted token fields, decrypts with the `ENCRYPTION_KEY` env var read inside the function, throws `TwitterPublishUnsupportedError` on threads.
- `packages/worker/src/post-lifecycle.service.ts` — `publishPost(db, ctx)` + `PostLifecycleAbort` class with reasons `version_mismatch | already_published | not_scheduled | budget_exhausted | thread_unsupported`. Three-phase flow: transactional lock, network call outside the txn, success-or-failure attempt row write.
- `packages/worker/src/publish-worker.ts` — `createPublishHandler({db, notificationQueue, ...})` (exported for tests) + `createPublishWorker({redis, db, notificationQueue})`. Concurrency 2, lockDuration 30s, stalledInterval 30s, maxStalledCount 1. Failed listener enqueues `publishFailedNotification` events when retries exhausted.
- `packages/worker/src/scanner.ts` — `selectDuePosts(db, horizon)` + `enqueueDuePosts({db, publishQueue, now})` + `startScanner(redis, db, publishQueue)`. 60s repeat, 90s horizon, drizzle `isNull(posts.platformPostId)` predicate with source comment tying the scope to Phase 4.
- `packages/worker/src/__tests__/backoff.test.ts` — 8 tests covering schedule progression, cap, Retry-After honoring (future + past), non-rate-limit fallthrough.
- `packages/worker/src/__tests__/rate-limit.test.ts` — 6 tests covering empty profile, missing profile, under-cap, at-cap, warn threshold at 80%, remaining floor at zero.
- `packages/worker/src/__tests__/post-lifecycle.test.ts` — 11 tests covering every abort branch + transient/permanent failure attempt rows + duplicate content (187).
- `packages/worker/src/__tests__/publish-worker.test.ts` — 11 tests covering handler invocation, attemptsMade accounting, transient rethrow, UnrecoverableError for 401/187, every graceful abort reason, and a source-file invariant check.
- `packages/worker/src/__tests__/scanner.test.ts` — 6 tests covering the isNull predicate (both source-level and runtime inspect), enqueueDuePosts payload + jobId + delay, SCAN_HORIZON_MS, and the platformPostId exclusion behavior.
- `packages/worker/src/__tests__/helpers/mock-db.ts` — chainable drizzle mock with separate execute() and select() queues.
- `packages/worker/src/__tests__/helpers/mock-twitter.ts` — factory for `ApiResponseError` / `ApiRequestError` fakes that pass the classifier's instanceof checks.
- `packages/worker/src/__tests__/helpers/seed-post.ts` — `seedLockedPost` + `seedSocialProfile` row fabricators.

### Modified
- `packages/worker/src/index.ts` — extended `main()` to create the BullMQ-compatible Redis (`maxRetriesPerRequest: null`), the worker DB pool, publish + notification queues, the publish worker, and the scanner. Shutdown handler closes everything in order with per-resource try/catch and a 30s Promise.race timeout.

## Decisions Made

- **Mock DB over testcontainers.** The plan allowed either; the Phase 2/3 api tests use mocks, so the worker lifecycle tests do too. Keeps the suite fast (<1.5s) and avoids testcontainer flakiness. The scanner's `isNull` predicate is asserted two ways: (a) drizzle AST inspection via `util.inspect(depth=8)`, (b) source-file grep for `isNull(posts.platformPostId)`.
- **Split handler from worker.** `createPublishHandler(deps)` returns the job handler function; `createPublishWorker(deps)` wraps it in a `new Worker(...)`. Tests exercise the handler directly — no BullMQ Redis required.
- **Signature widened for BullMQ compatibility.** The backoff strategy now uses BullMQ's `BackoffStrategy` type (`type?: string, err?: Error, job?: MinimalJob`). The original narrower tuple signature was incompatible with BullMQ 5.73's declaration. A separate `PublishBackoffStrategy` alias is exported for any future code that wants the strict form.
- **Scanner query helper split.** `selectDuePosts(db, horizon)` and `enqueueDuePosts(deps)` are exported separately from `startScanner(...)` so tests do not need a BullMQ scheduler.
- **Thread posts abort gracefully.** Instead of throwing an unhandled error that BullMQ would retry, thread-flagged posts abort with `PostLifecycleAbort('thread_unsupported')` so the handler resolves cleanly and the post stays in the scheduled state. Phase 4.5 picks them up without a half-written chain.
- **Monthly usage query uses `inArray(posts.status, [...])`.** `inArray` compiles to SQL `IN (...)` with proper parameter binding. Matches the api wrapper byte-for-byte — both packages read the same `COUNTED_STATUSES = ['published', 'auto_destructing', 'destroyed']`.

## Deviations from Plan

None — plan executed exactly as written.

One narrow Rule 3 fix was needed during Task 2 typecheck: the initial backoff strategy signature used a custom `(number, string, Error, Job) => number` tuple, which does not satisfy BullMQ 5.73's `BackoffStrategy` type (optional params, `MinimalJob` instead of `Job`). Migrated to BullMQ's exported type and kept the narrower alias as `PublishBackoffStrategy` for future callers. Committed in `b09a876` along with the rest of Task 2.

**Total deviations:** 0 (one mid-task typecheck fix folded into Task 2's commit, no scope creep)
**Impact on plan:** None.

## Issues Encountered

1. **Drizzle SQL nodes have cycles.** The scanner test initially used `JSON.stringify(whereArg)` to check the drizzle AST for `platformPostId`, which threw `TypeError: Converting circular structure to JSON`. Switched to `util.inspect(whereArg, { depth: 8 })` which handles cycles by printing `[Circular]` markers. Both `selectDuePosts` tests now pass.
2. **BullMQ BackoffStrategy type signature.** Resolved in the deviation note above — BullMQ's type uses optional parameters and `MinimalJob`. The implementation works either way at runtime, but TypeScript needed the widened types to accept the strategy function as `settings.backoffStrategy`.

## Notification Event Payload Shape

The `publishFailedNotification` event emitted by the failed listener (WORKER-07, for Phase 9 consumption and Plan 05 UI):

```json
{
  "kind": "publish_failed",
  "postId": "<uuid>",
  "correlationId": "<uuid>",
  "reason": "<classified error message>",
  "at": "<ISO-8601 UTC timestamp>"
}
```

Reason comes from either `UnrecoverableError.message` (which the handler derived from `classifyTwitterError(err).message`) or the final-attempt transient error's `.message`. Phase 9's consumer and Plan 05's UI toast must both treat `reason` as plain text — no HTML rendering.

## Architectural Invariants Verified

- `rg "from '@sms/api" packages/worker/src/` → **0 matches** (revision Blocker 4 satisfied)
- `grep "isNull(posts.platformPostId)" packages/worker/src/scanner.ts` → **1 match** (revision Warning 1 satisfied)
- `grep "WORKER-03 (Phase 4 partial)" packages/worker/src/scanner.ts` → **1 match** (scope split documented in-source)
- `grep "concurrency: 2" packages/worker/src/publish-worker.ts` → **1 match**
- `grep "lockDuration: 30_000" packages/worker/src/publish-worker.ts` → **1 match**
- `grep "maxRetriesPerRequest: null" packages/worker/src/index.ts` → **1 match** (BullMQ Pitfall 1)
- `packages/worker/src/index.ts` still calls `startHeartbeat` (Phase 1 loop preserved)

## User Setup Required

None — no new env vars or external service configuration. Reuses `REDIS_URL`, `DATABASE_URL`, `ENCRYPTION_KEY` from Phase 1.

## Known Stubs

None. The single-tweet publish path is fully wired. Thread support is a documented scope boundary (Phase 4.5), not a stub — the lifecycle service explicitly throws `PostLifecycleAbort('thread_unsupported')` and the handler logs it as a graceful abort, which is the correct behavior for Phase 4's scope.

## Next Phase Readiness

- **Plan 04 (API routes + Bull-Board)** can assume the publish worker is listening on the `publish` queue and the notification queue exists. The failed-notification event payload shape above is the contract.
- **Plan 05 (UI)** can assume post state flows scheduled → publishing → published with `post_attempts` rows available for the attempts modal.
- **Phase 5 (Queue Engine)** will extend `selectDuePosts` with additional WHERE predicates for queue recurrence. The current `// WORKER-03 (Phase 4 partial)` comment in scanner.ts flags the exact line.
- **Phase 9 (Notifications)** will add the notification queue consumer that processes the `publishFailedNotification` and `rateLimitWarnNotification` events enqueued by this plan and Plan 02.

## Self-Check: PASSED

File existence:
- FOUND: packages/worker/src/db.ts
- FOUND: packages/worker/src/backoff.ts
- FOUND: packages/worker/src/rate-limit.ts
- FOUND: packages/worker/src/twitter-publish.service.ts
- FOUND: packages/worker/src/post-lifecycle.service.ts
- FOUND: packages/worker/src/publish-worker.ts
- FOUND: packages/worker/src/scanner.ts
- FOUND: packages/worker/src/index.ts
- FOUND: packages/worker/src/__tests__/backoff.test.ts
- FOUND: packages/worker/src/__tests__/rate-limit.test.ts
- FOUND: packages/worker/src/__tests__/post-lifecycle.test.ts
- FOUND: packages/worker/src/__tests__/publish-worker.test.ts
- FOUND: packages/worker/src/__tests__/scanner.test.ts
- FOUND: packages/worker/src/__tests__/helpers/mock-db.ts
- FOUND: packages/worker/src/__tests__/helpers/mock-twitter.ts
- FOUND: packages/worker/src/__tests__/helpers/seed-post.ts

Commit existence:
- FOUND: b3929a6 (Task 1: backoff + lifecycle + twitter publish + rate-limit + db)
- FOUND: b09a876 (Task 2: publish worker + scanner + graceful shutdown)

Test results:
- `pnpm --filter @sms/worker test run` → **6 test files passed, 45 tests passed**
- `npx tsc --noEmit` (worker) → clean exit

---
*Phase: 04-publish-worker-scheduled-posts*
*Completed: 2026-04-09*
