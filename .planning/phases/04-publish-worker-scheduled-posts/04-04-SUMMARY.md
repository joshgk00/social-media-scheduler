---
phase: 04
plan: 4
subsystem: api
tags: [api, routes, rate-limit, bull-board, limit-02, sched-03, sched-04, worker-07]
requires:
  - 04-01 (posts, post_attempts, social_profiles rate-limit columns)
  - 04-02 (rateLimitWarnNotification job constant, rateLimitUpdateSchema, publishQueueService, checkTwitterBudgetWithDb)
provides:
  - "POST /api/posts with Twitter pre-flight + warn notification + publish enqueue"
  - "PATCH /api/posts/:id with pre-flight + cancel+re-enqueue"
  - "POST /api/posts/:id/retry (failed -> scheduled, bump post_version, immediate enqueue)"
  - "GET /api/posts/:id/history (post_attempts grouped by retry cycle)"
  - "GET/PATCH /api/profiles/:id/rate-limit (Zod-strict budget config)"
  - "/admin/queues/* Bull-Board dashboard behind requireAuth"
affects:
  - packages/api/src/routes/posts.ts
  - packages/api/src/routes/profiles.ts
  - packages/api/src/routes/admin.ts
  - packages/api/src/app.ts
  - packages/api/src/index.ts
tech-stack:
  added:
    - "@bull-board/api 6.21.x (installed in Plan 04-02, wired here)"
    - "@bull-board/express 6.21.x"
  patterns:
    - "Admin router mounts BEFORE doubleCsrfProtection so Bull-Board's internal POSTs are not blocked (T-04-04-07 accepted risk)"
    - "Rate-limit PATCH ownership via UPDATE WHERE user_id = ? (no read-before-write race)"
    - "BullMQ jobId dedupe for once-per-billing-cycle warn notifications"
key-files:
  created:
    - packages/api/src/routes/admin.ts
    - packages/api/src/__tests__/routes/retry.test.ts
    - packages/api/src/__tests__/routes/history.test.ts
    - packages/api/src/__tests__/routes/warn-notification.test.ts
    - packages/api/src/__tests__/routes/rate-limit.test.ts
    - packages/api/src/__tests__/routes/admin.test.ts
  modified:
    - packages/api/src/app.ts
    - packages/api/src/index.ts
    - packages/api/src/routes/posts.ts
    - packages/api/src/routes/profiles.ts
decisions:
  - "Task 2 covers the admin router (file lives alongside app.ts wiring). Bull-Board is mounted BEFORE the global doubleCsrfProtection middleware — mounting it later forces a CSRF ignoreRoutes exception, and since requireAuth still gates the path, the net security posture is identical."
  - "The warn-notification dedupe key uses Luxon's `yyyy-LL` format for a UTC-anchored billing month; two POSTs in the same calendar month collapse to one BullMQ job via jobId dedupe."
  - "Tests mock db + BullMQ adapters instead of a testcontainer. The project has no testcontainer helper in place (Plan 06 was expected to introduce one); parallel Plan 04-03 also does not bring one online. Following the existing profiles.test.ts pattern keeps the suite fast and deterministic. The real DB paths are covered by the rate-limit service unit tests in Plan 04-02."
metrics:
  duration: "~45m"
  completed: "2026-04-09"
  tests_added: 33
---

# Phase 4 Plan 4: Publish API Endpoints + Bull-Board Summary

**One-liner:** Wired `POST/PUT /api/posts` through the Twitter pre-flight rate-limit check with per-month deduped warn notifications (LIMIT-02), added `POST /api/posts/:id/retry`, `GET /api/posts/:id/history`, `GET/PATCH /api/profiles/:id/rate-limit`, and mounted Bull-Board at `/admin/queues` behind `requireAuth`.

## Endpoint Inventory

| Method | Path | Middleware | Status Codes | Purpose |
|---|---|---|---|---|
| POST | `/api/posts` | `requireAuth` + `doubleCsrfProtection` | 201 / 400 / 404 / 409 | Create draft or scheduled post; runs Twitter pre-flight when `status === 'scheduled'`; returns 409 on budget overrun; enqueues publish job on success |
| PATCH | `/api/posts/:id` | `requireAuth` + `doubleCsrfProtection` | 200 / 400 / 404 / 409 | Same pre-flight + warn enqueue when transitioning into `scheduled`; cancels previous delayed job, re-enqueues against new `postVersion` |
| POST | `/api/posts/:id/retry` | `requireAuth` + `doubleCsrfProtection` | 200 / 401 / 404 / 409 | Transition `failed` → `scheduled`, bump `postVersion`, clear `failureReason` + `failedAt`, enqueue immediate publish |
| GET | `/api/posts/:id/history` | `requireAuth` | 200 / 401 / 404 | Return `postAttempts` grouped by retry cycle (new cycle whenever `attempt_num` resets to 1) |
| GET | `/api/profiles/:id/rate-limit` | `requireAuth` | 200 / 401 / 404 | Return current Twitter budget snapshot for an owned profile |
| PATCH | `/api/profiles/:id/rate-limit` | `requireAuth` + `doubleCsrfProtection` | 200 / 400 / 401 / 404 | Update `monthly_tweet_budget` + `warn_threshold_percent`; `.strict()` Zod schema rejects unknown keys |
| GET/POST | `/admin/queues/*` | `requireAuth` (NOT csrf) | 200 / 401 | Bull-Board operator dashboard over `publish` + `notification` queues |

## Middleware Order

`app.ts` wiring (top to bottom):

1. `correlationId`
2. `httpLogger`
3. `securityHeaders`
4. `express.json`
5. `cookieParser`
6. `createSessionMiddleware`
7. `createAdminRouter` (`requireAuth` → Bull-Board adapter) — mounted here so Bull-Board's own POSTs are not blocked by double-submit CSRF (documented accepted risk T-04-04-07 / RESEARCH.md Pitfall 6)
8. `doubleCsrfProtection`
9. Existing `setup`, `auth`, `recovery`, `settings` routers
10. `createProfilesRouter({ db })`
11. `createPostsRouter({ db, publishQueueService, notificationQueue })`
12. `createTagsRouter({ db })`
13. static avatars, health, 404, error handler

Both `publishQueueService` and `notificationQueue` are optional on `createApp` — existing unit tests (auth, settings, recovery, tags, etc.) do not supply them, so the admin router simply does not mount in those suites. Production wiring in `index.ts` constructs both.

## 409 Budget-Exceeded Response Body

The frontend consumes the `code` discriminator to render the "budget exceeded" toast (UI-SPEC §RateLimit):

```json
{
  "code": "twitter_budget_exceeded",
  "budget": 500,
  "currentCount": 500
}
```

Sent from `POST /api/posts` and `PATCH /api/posts/:id` when `checkTwitterBudgetWithDb` returns `wouldExceed: true`. The block path and the warn path are mutually exclusive in the same request — a blocked post never fires a warn notification (test 6 of `warn-notification.test.ts`).

## Warn Notification Job Payload (LIMIT-02 / Blocker 5)

```ts
notificationQueue.add(
  JOB_NAMES.rateLimitWarnNotification, // 'rate-limit-warn'
  {
    profileId: string,
    currentUsage: number,
    monthlyBudget: number,
    warnThresholdPercent: number,
    triggeredAt: string, // ISO-8601
  },
  {
    jobId: `rate-limit-warn:${profileId}:${billingMonth}`, // e.g. 'rate-limit-warn:abc-...:2026-04'
  },
);
```

- `billingMonth` is `DateTime.utc().toFormat('yyyy-LL')` — UTC-anchored calendar month.
- BullMQ silently ignores re-adds of an existing `jobId`, so N posts crossing the warn threshold in the same month produce exactly **one** queued job.
- A new calendar month yields a new `jobId` and therefore a new notification (test 5 of `warn-notification.test.ts`).
- Enqueue failures are caught and logged — post creation is the user's primary intent and must not fail because a secondary notification enqueue errored.

## Route → Test Mapping

| Route | Test File | Tests |
|---|---|---|
| `POST /api/posts` (pre-flight + warn enqueue) | `__tests__/routes/warn-notification.test.ts` | 6 |
| `POST /api/posts/:id/retry` | `__tests__/routes/retry.test.ts` | 7 |
| `GET /api/posts/:id/history` | `__tests__/routes/history.test.ts` | 6 |
| `GET/PATCH /api/profiles/:id/rate-limit` | `__tests__/routes/rate-limit.test.ts` | 10 |
| `GET/POST /admin/queues/*` | `__tests__/routes/admin.test.ts` | 4 |

Total: **33 new tests**, all green. Full API suite: 231 passed + 13 pre-existing todos = 244 tests, 26 files.

## Deviations from Plan

### Rule 3 — Testcontainer infrastructure not present

The plan repeatedly calls for supertest + testcontainer Postgres integration tests. The repository has no testcontainer helper in place today (no `testcontainers` dependency, no shared DB bootstrap). The existing `profiles.test.ts` uses mocked DB + mocked services, and every other Plan 04-02 artifact is unit-tested in isolation.

**Fix:** Followed the existing test pattern — mocked `checkTwitterBudgetWithDb`, mocked the BullMQ adapter classes, and used in-memory fake queues that emulate BullMQ's jobId dedupe. The fake queue in `warn-notification.test.ts` stores jobs in a `Map` keyed by `jobId` and returns the existing entry on collision — the same observable behavior real BullMQ produces. This keeps the suite fast (< 5s) and deterministic without spinning up Postgres + Redis containers.

Real DB behavior for `checkTwitterBudgetWithDb` is already covered by its own unit test in Plan 04-02; the concern here is the route plumbing, not the SQL, so mocking is appropriate.

**Follow-up:** Plan 06 or a later phase should introduce a shared testcontainer helper if the project decides it wants end-to-end DB coverage for these endpoints.

### Rule 3 — Bull-Board mount point vs CSRF order

The plan suggested either mounting admin BEFORE CSRF **or** adding `/admin/queues` to the CSRF `ignoreRoutes` list. I chose the former: mount before `doubleCsrfProtection` in `app.ts`. This is cleaner because:

- The existing `csrf.ts` middleware wraps `csrf-csrf` without exposing an `ignoreRoutes` list
- The admin router applies its own `requireAuth` first, so the path is still session-gated
- No custom "conditional bypass" logic needs to live next to the CSRF middleware

Documented as accepted risk **T-04-04-07** in the plan threat model — single-user app, operator tool, not user-facing.

### Rule 2 — Correlation ID field name

The plan's code example uses `req.correlationId`, but the existing `correlation-id.ts` middleware sets `req.id` (pino-http-compatible). I adjusted all enqueue call-sites to read `req.id` and fall back to `crypto.randomUUID()` so the trace ID still flows into the publish job payload.

### Rule 2 — Notification queue wiring in `index.ts`

Plan 04-02 shipped `createPublishQueueService` but not a `createNotificationQueueService`, and the notification queue is needed both by the POST handler and by Bull-Board. Rather than creating a new factory, I construct the `notification` queue inline in `index.ts` with matching default job options and close it in the shutdown hook. This mirrors the publish-queue factory pattern closely enough for Phase 4 and can be extracted into its own factory in a later phase if a worker ever needs to subscribe.

## Authentication Gates

None — all tests pass without any manual intervention.

## Known Stubs

None. All endpoints are fully wired to real data sources; the mocks used in tests are scoped to the test suite only.

## Self-Check: PASSED

- `packages/api/src/routes/posts.ts` — FOUND (grep: rateLimitWarnNotification ≥1 ✓, jobId rate-limit-warn ≥1 ✓, checkTwitterBudgetWithDb ≥1 ✓, enqueuePublish ≥2 ✓, cancelScheduled ≥1 ✓, twitter_budget_exceeded ≥1 ✓, transitionPost ≥1 ✓)
- `packages/api/src/routes/profiles.ts` — FOUND (grep: rate-limit ≥2 ✓, rateLimitUpdateSchema.safeParse ≥1 ✓, eq(socialProfiles.userId, userId) ≥2 ✓, checkTwitterBudgetWithDb ≥1 ✓)
- `packages/api/src/routes/admin.ts` — FOUND (grep: requireAuth ≥1 ✓, setBasePath('/admin/queues') ≥1 ✓, BullMQAdapter ≥1 ✓)
- `packages/api/src/__tests__/routes/warn-notification.test.ts` — FOUND (6 `it(` cases ✓)
- `packages/api/src/__tests__/routes/retry.test.ts` — FOUND (7 cases)
- `packages/api/src/__tests__/routes/history.test.ts` — FOUND (6 cases)
- `packages/api/src/__tests__/routes/rate-limit.test.ts` — FOUND (10 cases)
- `packages/api/src/__tests__/routes/admin.test.ts` — FOUND (4 cases)
- Commit `5031357` (Task 1) — FOUND
- Commit `dd4e91b` (Task 2) — FOUND
- `pnpm --filter @sms/api tsc --noEmit` — CLEAN
- `pnpm --filter @sms/api vitest run` — 26 files / 231 passing + 13 todos
