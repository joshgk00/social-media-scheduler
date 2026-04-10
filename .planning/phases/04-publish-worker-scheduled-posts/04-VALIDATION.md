---
phase: 4
slug: publish-worker-scheduled-posts
status: signed-off
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-09
finalized: 2026-04-10
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | packages/*/vitest.config.ts (per-package) |
| **Quick run command** | `pnpm -w vitest run --changed` |
| **Full suite command** | `pnpm -w vitest run` |
| **Estimated runtime** | ~60 seconds (unit) + ~90 seconds (integration with testcontainers) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -w vitest run --changed`
- **After every plan wave:** Run `pnpm -w vitest run`
- **Before `/gsd-verify-work`:** Full suite (including integration) must be green
- **Max feedback latency:** 90 seconds for unit tests; integration tests run on phase-gate

---

## Wave 0 Requirements (REAL files -- replaces placeholder list)

These files must exist before the test files that depend on them. Each entry maps to a specific plan + task that creates the file.

- [x] `packages/worker/src/__tests__/helpers/mock-twitter.ts` -- MSW handlers for Twitter API responses (Plan 03 Task 1)
- [x] `packages/worker/src/__tests__/helpers/seed-post.ts` -- DB seed helper for posts + social_profiles (Plan 03 Task 1)
- [x] `packages/worker/src/__tests__/helpers/testcontainer.ts` -- Postgres + Redis testcontainer factory (Plan 06 Task 1)
- [x] `packages/worker/vitest.config.ts` -- already exists from Phase 1; confirmed and updated in Plan 06 Task 1 to set `testTimeout: 60000` for integration tests

---

## Per-Task Verification Map

Every Phase 4 requirement maps to at least one automated test. Status reflects the state at phase sign-off.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Wave Status | Sampling Check |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|----------------|
| 4-01-01 | 01 | 1 | LIMIT-01 | T-04-01-04 | monthly_tweet_budget column exists with default 500 | unit | `node -e "const fs=require('fs'); const sp=fs.readFileSync('packages/db/src/schema/social-profiles.ts','utf8'); process.exit(sp.includes('monthly_tweet_budget')?0:1)"` | pass | every commit |
| 4-01-02 | 01 | 1 | LIMIT-02 | T-04-01-04 | warn_threshold_percent column with default 80 | unit | `node -e "const fs=require('fs'); const sp=fs.readFileSync('packages/db/src/schema/social-profiles.ts','utf8'); process.exit(sp.includes('warn_threshold_percent')?0:1)"` | pass | every commit |
| 4-01-03 | 01 | 1 | SCHED-04 / WORKER-06 | T-04-01-01 | post_attempts table exists with cascade FK | unit | `pnpm -F @sms/db tsc --noEmit` | pass | every commit |
| 4-02-01 | 02 | 2 | LIMIT-01 / LIMIT-02 / LIMIT-03 / LIMIT-04 | T-04-02-03 | Pure check-budget calculator with bounds | unit | `pnpm -F @sms/shared vitest run src/__tests__/check-budget.test.ts` | pass | every commit |
| 4-02-02 | 02 | 2 | LIMIT-05 | T-04-02-03 | checkBulkBudget delta-aware bulk pre-flight | unit | `pnpm -F @sms/shared vitest run src/__tests__/check-budget.test.ts` | pass | every commit |
| 4-02-03 | 02 | 2 | LIMIT-01 / LIMIT-02 / LIMIT-03 / LIMIT-04 | T-04-02-* | DB-backed wrapper service | unit | `pnpm -F @sms/api vitest run src/services/__tests__/rate-limit.service.test.ts` | pass | every commit |
| 4-02-04 | 02 | 2 | WORKER-02 | -- | Publish queue factory with stable jobId | unit | `pnpm -F @sms/api vitest run src/services/__tests__/publish-queue.service.test.ts` | pass | every commit |
| 4-02-05 | 02 | 2 | WORKER-04 | T-04-02-04 | Error classifier permanent vs transient | unit | `pnpm -F @sms/shared vitest run` (covered transitively via @sms/api tests that import classifier) | pass | every commit |
| 4-03-01 | 03 | 3 | WORKER-04 | -- | backoff schedule + retry-after | unit | `pnpm -F @sms/worker vitest run src/__tests__/backoff.test.ts` | pass | every commit |
| 4-03-02 | 03 | 3 | WORKER-06 | T-04-03-03 | idempotency via platform_post_id | unit | `pnpm -F @sms/worker vitest run src/__tests__/post-lifecycle.test.ts` | pass | every wave |
| 4-03-03 | 03 | 3 | LIMIT-03 | T-04-03-04 | runtime budget re-check aborts publish | unit | `pnpm -F @sms/worker vitest run src/__tests__/post-lifecycle.test.ts` | pass | every wave |
| 4-03-04 | 03 | 3 | WORKER-03 (partial) / SCHED-01 | -- | scanner uses isNull(platformPostId) predicate | unit | `pnpm -F @sms/worker vitest run src/__tests__/scanner.test.ts` | pass | every wave |
| 4-03-05 | 03 | 3 | WORKER-01 | -- | worker process starts heartbeat + publish + scanner | unit | `pnpm -F @sms/worker vitest run src/__tests__/publish-worker.test.ts` | pass | every commit |
| 4-03-06 | 03 | 3 | LIMIT-03 (worker side) | T-04-03-04 | worker rate-limit wrapper imports from @sms/shared only | unit | `pnpm -F @sms/worker vitest run src/__tests__/rate-limit.test.ts` | pass | every commit |
| 4-04-01 | 04 | 3 | SCHED-03 | T-04-04-01 | Retry endpoint enforces ownership + state | integration | `pnpm -F @sms/api vitest run src/__tests__/routes/retry.test.ts` | pass | every wave |
| 4-04-02 | 04 | 3 | SCHED-04 | T-04-04-02 | History endpoint groups by cycle | integration | `pnpm -F @sms/api vitest run src/__tests__/routes/history.test.ts` | pass | every wave |
| 4-04-03 | 04 | 3 | LIMIT-01 / LIMIT-04 | T-04-04-03..04 | Rate limit GET/PATCH with strict Zod | integration | `pnpm -F @sms/api vitest run src/__tests__/routes/rate-limit.test.ts` | pass | every wave |
| 4-04-04 | 04 | 3 | LIMIT-02 | T-04-04-11 | Warn notification deduped per profile per month | integration | `pnpm -F @sms/api vitest run src/__tests__/routes/warn-notification.test.ts` | pass | every wave |
| 4-04-05 | 04 | 3 | WORKER-07 | T-04-04-06 | Bull-Board behind requireAuth | integration | `pnpm -F @sms/api vitest run src/__tests__/routes/admin.test.ts` | pass | every wave |
| 4-05-01 | 05 | 4 | SCHED-01 / SCHED-02 | T-04-05-01 | Posts page polling + history modal | component | `pnpm -F @sms/web vitest run src/__tests__/components/PostHistoryDialog.test.tsx` | pass | every wave |
| 4-05-02 | 05 | 4 | LIMIT-04 | T-04-05-03 | Rate limit settings dialog with validation | component | `pnpm -F @sms/web vitest run src/__tests__/components/RateLimitSettingsDialog.test.tsx` | pass | every wave |
| 4-05-03 | 05 | 4 | SCHED-01 / LIMIT-01 / LIMIT-02 / LIMIT-04 | -- | End-to-end UI flow | manual | Plan 05 Task 3 human checkpoint (10 sub-steps) | pass | phase gate |
| 4-06-01 | 06 | 5 | WORKER-04 / WORKER-05 / WORKER-06 / WORKER-07 / SCHED-04 / LIMIT-03 | T-04-03-03 | E2E publish + retry + DLQ + idempotency + budget abort | integration | `pnpm -F @sms/worker vitest run src/__tests__/integration/post-lifecycle.integration.test.ts` | pass | phase gate |
| 4-06-02 | 06 | 5 | WORKER-08 | T-04-03-08 | Graceful shutdown drains in-flight | integration | `pnpm -F @sms/worker vitest run src/__tests__/integration/shutdown.integration.test.ts` | pass | phase gate |
| 4-06-03 | 06 | 5 | WORKER-07 | -- | DLQ notification event emitted | integration | `pnpm -F @sms/worker vitest run src/__tests__/integration/failed-listener.integration.test.ts` | pass | phase gate |
| 4-06-04 | 06 | 5 | WORKER-08 / SCHED-04 (DST) | -- | DST transition behavior | manual | See "Manual-Only Verifications" below | manual | phase gate |

*Status legend: pass = green, fail = red, manual = manual-only, pending = not yet run*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bull-Board UI loads and shows queues behind auth | WORKER-07 | Visual/session-cookie flow hard to test end-to-end in unit tests | Log in via browser then navigate to `/admin/queues` then confirm queue list loads; logout then confirm 401 |
| DST transition honored during a real schedule | SCHED-04 | Requires wall-clock to advance through a DST boundary or explicit system clock spoofing | Schedule post for 1:30 AM local on DST spring-forward day then verify fires at correct UTC instant via worker log |
| Posts page polling + retry + rate-limit warn/block UI | SCHED-01 / LIMIT-01 / LIMIT-02 / LIMIT-04 | Visual + session flow | See Plan 05 Task 3 (10 verification sub-steps) |
| Phase 4 final five success criteria | All Phase 4 reqs | Phase-gate | See Plan 06 Task 3 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all real helper files (no phantom references -- revision Blocker 3)
- [x] No watch-mode flags
- [x] Feedback latency < 90s for unit tests (integration tests with testcontainers exceed 90s -- documented as phase-gate cadence above)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** APPROVED (date: 2026-04-10)
