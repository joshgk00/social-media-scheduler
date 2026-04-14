---
phase: 04-publish-worker-scheduled-posts
plan: 02
subsystem: shared-primitives-and-api-services

tags: [bullmq, luxon, rate-limit, error-classifier, zod, shared-package, publish-queue]

# Dependency graph
requires:
  - phase: 04-publish-worker-scheduled-posts
    plan: 01
    provides: post_attempts table, monthly_tweet_budget + warn_threshold_percent columns
provides:
  - QUEUE_NAMES / JOB_NAMES / buildPublishJobId constants for BullMQ (@sms/shared)
  - classifyTwitterError + ClassifiedError discriminated union (@sms/shared/lib)
  - checkTwitterBudget + checkBulkBudget pure calculators (@sms/shared/rate-limit)
  - rateLimitUpdateSchema.strict() + rateLimitStateSchema + RateLimitUpdate type (@sms/shared/schemas)
  - postAttemptSchema + postHistoryResponseSchema + PostAttemptOutcome type (@sms/shared/schemas)
  - loadTwitterUsage / checkTwitterBudgetWithDb / checkBulkBudgetWithDb (@sms/api DB-backed wrappers)
  - createPublishQueueService factory with enqueuePublish / cancelScheduled (@sms/api)
  - Dependency baseline: bullmq, luxon, @bull-board/api, @bull-board/express, twitter-api-v2 wired into api/shared/worker packages
affects: [04-03, 04-04, 04-05, 04-06, worker, api, phase-10-csv]

# Tech tracking
tech-stack:
  added:
    - "bullmq ~5.73.0 (api — was worker-only before)"
    - "luxon ~3.7.2 (api + worker — new)"
    - "@bull-board/api ~6.21.0 (api — new)"
    - "@bull-board/express ~6.21.0 (api — new)"
    - "twitter-api-v2 ~1.29.0 (shared — needed by the classifier; api already had it)"
    - "drizzle-orm ~0.45.2 (worker — new)"
    - "postgres ~3.4.9 (worker — new)"
    - "@types/luxon ~3.7.1 (api + worker devDeps — luxon ships no types)"
    - "testcontainers ^10 (worker devDep — staged for Plan 03 worker tests)"
  patterns:
    - "Pure math in @sms/shared, DB-backed wrappers in @sms/api — eliminates worker→api dependency (Blocker 4)"
    - "BullMQ stable jobIds keyed on (postId, postVersion) for free idempotency + edit-race recovery"
    - "Zod strict() on the rate-limit update body to block mass-assignment (T-04-02-02)"
    - "Error classifier reads only Twitter-authored fields (ErrorV1 and ErrorV2 safe via duck-typed helpers) — never echoes OAuth headers"
    - "Single calendar month UTC boundary via luxon DateTime.utc().startOf('month')"

key-files:
  created:
    - packages/shared/src/constants/queues.ts
    - packages/shared/src/lib/error-classifier.ts
    - packages/shared/src/rate-limit/check-budget.ts
    - packages/shared/src/schemas/rate-limit.ts
    - packages/shared/src/schemas/post-history.ts
    - packages/shared/src/__tests__/check-budget.test.ts
    - packages/api/src/services/rate-limit.service.ts
    - packages/api/src/services/publish-queue.service.ts
    - packages/api/src/services/__tests__/rate-limit.service.test.ts
    - packages/api/src/services/__tests__/publish-queue.service.test.ts
  modified:
    - packages/shared/src/index.ts (re-export new modules)
    - packages/shared/package.json (add twitter-api-v2 for classifier types)
    - packages/api/package.json (add bullmq, luxon, bull-board, @types/luxon)
    - packages/worker/package.json (add luxon, twitter-api-v2, drizzle-orm, postgres, @types/luxon, testcontainers)
    - pnpm-lock.yaml

key-decisions:
  - "Pure rate-limit calculators live in @sms/shared — the worker imports the same checkTwitterBudget the api wrapper delegates to, so neither package needs the other (revision Blocker 4, T-04-02-07)"
  - "checkBulkBudget is a semantic alias for checkTwitterBudget — Phase 10 CSV upload will wire it with additionalCount = csvRowCount, giving LIMIT-05 a clear Phase-4-owned contract"
  - "Error classifier lives in @sms/shared/lib/ so both api (manual retry, tests) and worker (runtime retry decision) import it via @sms/shared — no cross-package dependency"
  - "Mock bullmq Queue with a real function constructor via vi.hoisted refs — arrow-function mockImplementation breaks `new Queue(...)`"
  - "Test directory follows the plan-provided path (packages/api/src/services/__tests__/) rather than the pre-existing packages/api/src/__tests__/services/ convention, matching the verify commands in the plan"

# Execution metrics
metrics:
  duration: ~18 min
  completed: 2026-04-09
  tasks: 3
  tests_added: 29  # 12 shared + 10 rate-limit + 7 publish-queue
  files_changed: 15

# Threat model touch-points
security:
  - "T-04-02-01 mitigated: publish job payload strongly typed to {postId, postVersion, correlationId}; unit test asserts Object.keys(payload).sort() === ['correlationId', 'postId', 'postVersion']"
  - "T-04-02-02 mitigated: rateLimitUpdateSchema.strict() rejects unknown keys before any DB write"
  - "T-04-02-03 mitigated: budget bound 1..10000 and warnThresholdPercent bound 1..99 enforced in Zod"
  - "T-04-02-04 mitigated: classifier reads only ApiResponseError.errors[].message / ApiResponseError.data.detail — never the request headers or body"
  - "T-04-02-06 documented: rate-limit primitives are ownership-agnostic, route handlers (Plan 04) MUST verify profile ownership before calling them"
  - "T-04-02-07 mitigated: single source of truth for the budget math lives in @sms/shared/rate-limit/check-budget.ts; worker and api both delegate to it"

# Traceability
requirements:
  - WORKER-02
  - WORKER-04
  - LIMIT-01
  - LIMIT-02
  - LIMIT-03
  - LIMIT-04
  - LIMIT-05
---

# Phase 4 Plan 2: Shared Primitives & API-Side Rate-Limit + Publish-Queue Services Summary

Landed the shared primitives and API wrappers the worker (Plan 3) and route handlers (Plan 4) will build on: BullMQ queue/job name constants, a pure Twitter error classifier, pure rate-limit calculators (single + bulk), DB-backed rate-limit wrappers that delegate math to `@sms/shared`, and a `createPublishQueueService` factory. Also added the new runtime dependencies (`bullmq`, `luxon`, `@bull-board/*`, `twitter-api-v2`, `drizzle-orm`, `postgres`) to the correct packages with tilde-pinned versions per CLAUDE.md.

## Architecture note — worker never imports @sms/api

The rate-limit math (`checkTwitterBudget`, `checkBulkBudget`) lives in `packages/shared/src/rate-limit/check-budget.ts` as pure functions of `{ currentUsage, monthlyBudget, warnThresholdPercent, additionalCount }`. The API wrapper in `packages/api/src/services/rate-limit.service.ts` loads usage from Postgres via Drizzle and delegates to the shared pure function. Plan 03's worker will do the same — load usage via the worker's own Drizzle client, then call the same shared calculator. There is zero cross-package dependency between `@sms/worker` and `@sms/api`. A grep check confirmed this:

```
$ rg "from '@sms/api" packages/worker/src/
# no matches
```

## Deliverables

### @sms/shared exports added

| Symbol | File | Purpose |
|--------|------|---------|
| `QUEUE_NAMES`, `JOB_NAMES`, `QueueName`, `JobName` | `constants/queues.ts` | Canonical BullMQ queue + job name constants. Only `publish` and `notification` queues exist in Phase 4 (D-04). |
| `buildPublishJobId(postId, postVersion)` | `constants/queues.ts` | Stable jobId (`post-${id}-v${version}`) giving idempotent re-enqueue + natural edit invalidation. |
| `classifyTwitterError(err)` → `ClassifiedError` | `lib/error-classifier.ts` | Maps `twitter-api-v2` errors to `transient` / `permanent` buckets. Uses safe duck-typed readers so both `ErrorV1` and `ErrorV2` shapes work without `any`. Handles ECONNRESET, auth errors, HTTP 400/401/403/404/422 as permanent, 408/429/500/502/503/504 as transient, duplicate-content 187 as permanent. |
| `checkTwitterBudget(args)` → `BudgetCheckResult` | `rate-limit/check-budget.ts` | Pure single-post pre-flight math. No I/O. |
| `checkBulkBudget(args)` → `BudgetCheckResult` | `rate-limit/check-budget.ts` | Pure CSV bulk pre-flight math (LIMIT-05 contract). Semantic alias — Phase 10 will wire the importer against this exact name. |
| `BudgetCheckArgs`, `BudgetCheckResult` | `rate-limit/check-budget.ts` | Shared types consumed by both api wrapper and the upcoming worker runtime re-check (D-26). |
| `rateLimitUpdateSchema` (`.strict()`), `RateLimitUpdate`, `rateLimitStateSchema`, `RateLimitState` | `schemas/rate-limit.ts` | PATCH body contract (mass-assignment blocked) and GET response contract. |
| `postAttemptSchema`, `postAttemptOutcomeSchema`, `postHistoryResponseSchema`, `PostAttemptDto`, `PostHistoryResponse`, `PostAttemptOutcome` | `schemas/post-history.ts` | Shapes for the SCHED-04 history modal response. |

All re-exported from `packages/shared/src/index.ts`.

### @sms/api service signatures added

`packages/api/src/services/rate-limit.service.ts`:

```ts
export async function loadTwitterUsage(
  db: Db,
  profileId: string,
): Promise<UsageSnapshot>;

export async function checkTwitterBudgetWithDb(
  db: Db,
  args: { profileId: string; additionalPostCount: number },
): Promise<BudgetCheckResult & { monthStartUtc: Date }>;

export async function checkBulkBudgetWithDb(
  db: Db,
  args: { profileId: string; additionalCount: number },
): Promise<BudgetCheckResult & { monthStartUtc: Date }>;
```

`packages/api/src/services/publish-queue.service.ts`:

```ts
export interface PublishJobPayload {
  postId: string;
  postVersion: number;
  correlationId: string;
}

export function createPublishQueueService(redis: Redis): {
  publishQueue: Queue<PublishJobPayload>;
  enqueuePublish: (
    postId: string,
    postVersion: number,
    scheduledAt: Date,
    correlationId: string,
  ) => Promise<Job<PublishJobPayload>>;
  cancelScheduled: (postId: string, postVersion: number) => Promise<void>;
};
```

Defaults: `attempts: 4`, `removeOnComplete: { count: 100 }`, `removeOnFail: { count: 500 }`, `backoff: { type: 'publishBackoff' }` (strategy registered by the worker in Plan 03).

### Dependencies installed

| Package | Target | Version spec | Scope |
|---------|--------|--------------|-------|
| bullmq | packages/api | ~5.73.0 | prod |
| luxon | packages/api | ~3.7.2 | prod |
| @bull-board/api | packages/api | ~6.21.0 | prod |
| @bull-board/express | packages/api | ~6.21.0 | prod |
| @types/luxon | packages/api | ~3.7.1 | dev |
| luxon | packages/worker | ~3.7.2 | prod |
| twitter-api-v2 | packages/worker | ~1.29.0 | prod |
| drizzle-orm | packages/worker | ~0.45.2 | prod |
| postgres | packages/worker | ~3.4.9 | prod |
| @types/luxon | packages/worker | ~3.7.1 | dev |
| testcontainers | packages/worker | ^10.28.0 | dev |
| twitter-api-v2 | packages/shared | ~1.29.0 | prod (added during execution — see deviation below) |

All production dependencies use tilde prefix per CLAUDE.md. No existing dependency versions were bumped.

## Tests

29 tests added across three suites, all green:

| Suite | File | Tests | Notes |
|-------|------|-------|-------|
| Pure calculators | `packages/shared/src/__tests__/check-budget.test.ts` | 12 | Includes the LIMIT-05 acceptance case (currentUsage 460 + additionalCount 50 > monthlyBudget 500 → wouldExceed true). |
| Rate-limit wrapper | `packages/api/src/services/__tests__/rate-limit.service.test.ts` | 10 | Pinned `Settings.now` to 2026-04-15 12:00 UTC. Covers empty, warn, block, multi-count projection, status-filter trust, not-found, bulk LIMIT-05, and exact-fit bulk batch. |
| Publish-queue service | `packages/api/src/services/__tests__/publish-queue.service.test.ts` | 7 | Mocks `Queue` with a real function constructor via `vi.hoisted`. Covers jobId derivation, future/past delay clamp, credential-free payload assertion, delayed-job remove, active-job skip, and null-job no-op. |

Full api test suite still passes: 21 test files, 198 tests, 13 todo.

## Deviations from plan

### Rule 3 — Added `twitter-api-v2` to `packages/shared`

- **Found during:** Task 2, first `tsc --noEmit` run on `packages/shared`
- **Issue:** The plan directs `error-classifier.ts` to live in `@sms/shared/lib/` and import from `twitter-api-v2`, but `packages/shared/package.json` had no `twitter-api-v2` dependency. Plan Task 1 explicitly said "Into `packages/shared`: no new runtime deps needed. ... The error classifier uses `twitter-api-v2` types only — already present in the workspace." This is only true if `shared` declares it as a dep — workspace-level hoisting does not propagate through pnpm.
- **Fix:** `pnpm --filter @sms/shared add twitter-api-v2@~1.29.0` (tilde-pinned per convention, matching the api package's existing version).
- **Files modified:** `packages/shared/package.json`, `pnpm-lock.yaml`
- **Committed in:** Task 2 commit

### Rule 1 — ErrorV1 / ErrorV2 discriminated union handling

- **Found during:** Task 2, second `tsc --noEmit` run after adding `twitter-api-v2` to shared
- **Issue:** `twitter-api-v2` exposes `ApiResponseError.errors` as `Array<ErrorV1 | ErrorV2>`, where v1 has `{ code, message }` and v2 has `{ detail, title }` but **no** `code` or `message` field. The literal pattern from RESEARCH.md `twitterErrors[0]?.code` triggered TS2339 on the `ErrorV2` arm, and `.some((e) => e.code === 187)` likewise failed.
- **Fix:** Added two internal helpers `readTwitterErrorCode(entry: unknown): number | null` and `readTwitterErrorMessage(entry: unknown): string | null` that duck-type the fields via `'code' in entry`, producing safe narrowing without `any`. The classifier body now routes all error-entry reads through the helpers. Semantics unchanged — v2 errors simply return `null` code (which then maps to `errorCode: 'unknown'`) and use `message`/`detail` fallthrough for the human-readable text.
- **Files modified:** `packages/shared/src/lib/error-classifier.ts`
- **Committed in:** Task 2 commit

### Rule 1 — Vitest mock hoisting in `rate-limit.service.test.ts`

- **Found during:** Task 3, first test run
- **Issue:** `vi.mock('@sms/db', () => ({ posts: mockPosts, ... }))` was hoisted above the `const mockPosts = ...` declaration, producing `ReferenceError: Cannot access 'mockPosts' before initialization`.
- **Fix:** Inlined the table stub construction inside the `vi.mock` factory so no outer variables are captured.
- **Committed in:** Task 3 commit

### Rule 1 — `Queue` mock must be a real constructor

- **Found during:** Task 3, first test run
- **Issue:** `vi.fn().mockImplementation(() => mockQueueInstance)` returns an arrow function, and `new Queue(...)` inside the service under test threw `TypeError: X is not a constructor`.
- **Fix:** Rewrote the mock to use `vi.fn(function MockQueue(this) { this.add = mockAdd; this.getJob = mockGetJob; })` with spies lifted via `vi.hoisted` so they survive the hoist.
- **Committed in:** Task 3 commit

### Rule 3 — `msw` dev dep skipped

- **Found during:** Task 1
- **Issue:** Plan Task 1 conditionally adds `msw@^2` to `packages/worker` devDeps "if Phase 3 didn't already add it". Phase 3 did not add msw to any workspace package, and Plan 04-02 doesn't write any worker tests — msw is only needed when Plan 03 starts mocking the Twitter HTTP layer.
- **Fix:** Deferred the `msw` install to Plan 03 where it will actually be consumed. Task 1 acceptance criteria did not list `msw` in the required deps.
- **Files modified:** none
- **Not committed** (deferred)

No architectural changes were required; no checkpoints were hit; no auth gates.

## Commits

| Hash | Task | Message |
|------|------|---------|
| c4d3294 | 1 | chore(04-02): install phase 4 dependencies |
| 5a1976f | 2 | feat(04-02): add shared queue/classifier/rate-limit primitives |
| a2e4fad | 3 | feat(04-02): add rate-limit wrapper and publish-queue services |

## Verification transcript

```
$ pnpm --filter @sms/shared test
 Test Files  3 passed (3)
      Tests  57 passed (57)

$ pnpm --filter @sms/api test
 Test Files  21 passed (21)
      Tests  198 passed | 13 todo (211)

$ (cd packages/shared && ./node_modules/.bin/tsc --noEmit)  # exit 0
$ (cd packages/api    && ./node_modules/.bin/tsc --noEmit)  # exit 0
$ (cd packages/worker && ./node_modules/.bin/tsc --noEmit)  # exit 0
$ (cd packages/db     && ./node_modules/.bin/tsc --noEmit)  # exit 0

$ rg "from '@sms/api" packages/worker/src/ | wc -l
0
```

## Self-Check: PASSED

- [x] `packages/shared/src/constants/queues.ts` exists and defines `QUEUE_NAMES`, `JOB_NAMES`, `buildPublishJobId`
- [x] `packages/shared/src/lib/error-classifier.ts` exists and exports `classifyTwitterError` + `ClassifiedError`
- [x] `packages/shared/src/rate-limit/check-budget.ts` exists with pure `checkTwitterBudget` + `checkBulkBudget`
- [x] `packages/shared/src/schemas/rate-limit.ts` exists with `rateLimitUpdateSchema.strict()` + bounds 1..10000 / 1..99
- [x] `packages/shared/src/schemas/post-history.ts` exists with `postHistoryResponseSchema`
- [x] `packages/shared/src/__tests__/check-budget.test.ts` 12 tests green (≥6 required, LIMIT-05 case included)
- [x] `packages/api/src/services/rate-limit.service.ts` exists with `loadTwitterUsage`, `checkTwitterBudgetWithDb`, `checkBulkBudgetWithDb`
- [x] `packages/api/src/services/publish-queue.service.ts` exists with `createPublishQueueService`
- [x] `packages/api/src/services/__tests__/rate-limit.service.test.ts` 10 tests green (≥8 required)
- [x] `packages/api/src/services/__tests__/publish-queue.service.test.ts` 7 tests green (≥5 required)
- [x] `@sms/shared` barrel re-exports all five new modules
- [x] All new prod deps use tilde (verified — no `^` on production dependency entries added in this plan)
- [x] `pnpm install` succeeds and lockfile is updated
- [x] Commits c4d3294, 5a1976f, a2e4fad exist in `git log`
- [x] `rg "from '@sms/api" packages/worker/src/` returns 0 matches
