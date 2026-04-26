---
phase: 08-linkedin-facebook-post-creation
plan: 01
subsystem: testing
tags: [vitest, msw, tdd, linkedin, facebook, rate-limit, zod, discriminated-union]

# Dependency graph
requires:
  - phase: 07-multi-platform-profiles-token-lifecycle
    provides: socialProfiles schema with linkedin/facebook OAuth, tokenStatus, encrypted tokens
provides:
  - 14 failing test files (RED state) covering every Phase-08 requirement
  - MSW v2 handlers for LinkedIn /rest/images, /rest/posts and Facebook /photos, /feed, /videos
  - post-service-platform.test.ts that closes Plan 03 Task 2 Nyquist gap (B-04) — T-DATA-01 invariants
  - Failure-mode handler factories for testing rollback and orphaned-photo cleanup
affects: [08-02-schema-shared-and-migration, 08-03-api-routes-and-rate-limit, 08-04-worker-publish-services, 08-05a-web-forms-and-previews, 08-05b-dashboard-and-rate-limit-chip, 08-07-integration-verification]

# Tech tracking
tech-stack:
  added: [msw@2.13.6 (devDep on @sms/web)]
  patterns:
    - "Wave-0 RED stubs: every requirement and threat has a failing test before implementation begins"
    - "MSW handler module exports happy-path + failure-mode factory pair"
    - "Service-level T-DATA-01 invariants tested with PostServiceError code matching"

key-files:
  created:
    - packages/shared/src/__tests__/platform-text-limits.test.ts
    - packages/shared/src/__tests__/posts-discriminated-union.test.ts
    - packages/api/src/__tests__/posts-platform.test.ts
    - packages/api/src/__tests__/post-service-platform.test.ts
    - packages/api/src/__tests__/rate-limit-platform.test.ts
    - packages/worker/src/__tests__/linkedin-publish.test.ts
    - packages/worker/src/__tests__/facebook-publish.test.ts
    - packages/worker/src/__tests__/post-lifecycle-rate-limit.test.ts
    - packages/web/src/__tests__/VisibilitySelector.test.tsx
    - packages/web/src/__tests__/LinkedInPreview.test.tsx
    - packages/web/src/__tests__/FacebookPreview.test.tsx
    - packages/web/src/__tests__/cross-platform-switch.test.ts
    - packages/web/src/__tests__/RateLimitsCard.test.tsx
    - packages/web/src/__tests__/helpers/msw-handlers.ts
  modified:
    - packages/web/package.json (msw devDep)
    - pnpm-lock.yaml (msw resolution)

key-decisions:
  - "Installed msw@2.13.6 as devDep on @sms/web — required by Plan 08-01 Task 3 acceptance criteria"
  - "Used buildPlatformMockDb local helper instead of extending shared mock-db — keeps the platform-invariant test self-contained without polluting shared helpers"
  - "Chose live failing assertions over it.todo / it.skip — Wave 0 contract requires non-zero exit"

patterns-established:
  - "Per-platform schema drift testing: discriminated-union stubs assert .strict() rejection of cross-platform fields (T-API-03)"
  - "Atomic CAS counter contract: rate-limit tests assert single UPDATE call per check, not separate read-then-write"
  - "Multi-photo orphan handling: facebook-publish test asserts thrown error carries orphanedPhotoIds for caller cleanup (T-WORKER-02)"
  - "MSW handler module pattern: happy-path array + failure-mode factory function exports, mountable on setupServer"

requirements-completed:
  - POST-LI-01
  - POST-LI-02
  - POST-LI-03
  - POST-LI-04
  - POST-LI-05
  - POST-FB-01
  - POST-FB-02
  - POST-FB-03
  - POST-FB-04
  - POST-FB-05
  - POST-FB-06
  - LIMIT-06
  - LIMIT-07
  - LIMIT-08

# Metrics
duration: 7min
completed: 2026-04-26
---

# Phase 08 Plan 01: Test Stubs and MSW Handlers Summary

**14 failing Wave-0 RED test stubs covering every Phase-08 requirement and STRIDE threat, plus MSW handler module for LinkedIn + Facebook integration tests.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-26T13:52:44Z
- **Completed:** 2026-04-26T13:59:32Z
- **Tasks:** 3
- **Files modified:** 16 (14 new test files, 2 dep manifest updates)

## Accomplishments

- Established RED state across the entire phase: every requirement (POST-LI-01..05, POST-FB-01..06, LIMIT-06..08) and every threat (T-API-01..03, T-DATA-01, T-WORKER-01..03, T-LIMITS-01) has at least one failing test asserting its eventual GREEN behavior.
- Closed the Nyquist B-04 gap by adding `post-service-platform.test.ts` covering BOTH T-DATA-01 invariants — denormalize-on-insert (Test 1) AND PLATFORM_IMMUTABLE on update (Test 5). Plan 03 Task 2's `tdd="true"` now has a failing test to drive GREEN.
- Shipped reusable MSW v2 handlers (`phase8LinkedInHandlers`, `phase8FacebookHandlers`) plus failure-mode factories (`makeLinkedInFailureHandler`, `makeFacebookFailureHandler`) for rollback and partial-failure tests.
- Code-point counting test (`platform-text-limits.test.ts`) explicitly asserts the family-emoji ZWJ sequence is 5 code points, blocking Pitfall 4 (graphemes != code points).
- Atomic CAS UPDATE contract documented across rate-limit + lifecycle tests — separate read-then-write implementations will fail T-API-02 / T-LIMITS-01 assertions.

## Task Commits

1. **Task 1: Create shared package test stubs** - `23ec814` (test)
2. **Task 2: Create API + worker test stubs** - `bb93448` (test)
3. **Task 3: Create web test stubs + MSW handlers** - `daca0a1` (test)

## Files Created/Modified

### Shared package (failing tests for Plan 02)
- `packages/shared/src/__tests__/platform-text-limits.test.ts` — code-point counting + per-platform limit constants (POST-LI-04, POST-FB-05)
- `packages/shared/src/__tests__/posts-discriminated-union.test.ts` — per-variant `.strict()` and char-limit rejection (T-API-01, T-API-03)

### API package (failing tests for Plan 03)
- `packages/api/src/__tests__/posts-platform.test.ts` — POST /api/posts route validation (POST-LI-01, POST-FB-01, T-API-01, T-API-03)
- `packages/api/src/__tests__/post-service-platform.test.ts` — T-DATA-01 invariants (denormalize on insert + PLATFORM_IMMUTABLE on update); closes B-04 Nyquist gap
- `packages/api/src/__tests__/rate-limit-platform.test.ts` — LIMIT-06 / LIMIT-07 + atomic CAS UPDATE shape (T-API-02, T-LIMITS-01)

### Worker package (failing tests for Plan 04)
- `packages/worker/src/__tests__/linkedin-publish.test.ts` — POST-LI-01/02 + T-WORKER-01 (no /posts after PUT failure) + T-WORKER-03 (no token in logs)
- `packages/worker/src/__tests__/facebook-publish.test.ts` — POST-FB-01..04 + T-WORKER-02 (orphaned photo cleanup) + T-WORKER-03
- `packages/worker/src/__tests__/post-lifecycle-rate-limit.test.ts` — graceful abort on `rate_limit_exhausted` + atomic counter increment

### Web package (failing tests for Plans 05a/05b)
- `packages/web/src/__tests__/VisibilitySelector.test.tsx` — POST-LI-03 radio + a11y arrow keys
- `packages/web/src/__tests__/LinkedInPreview.test.tsx` — POST-LI-05 visibility line + spinnable highlighting
- `packages/web/src/__tests__/FacebookPreview.test.tsx` — POST-FB-06 1/3/4/8-image grids + linkUrl + video preview
- `packages/web/src/__tests__/cross-platform-switch.test.ts` — D-04 helper with code-point truncation, toast strings
- `packages/web/src/__tests__/RateLimitsCard.test.tsx` — LIMIT-08 dashboard widget, green/yellow/red bands, a11y
- `packages/web/src/__tests__/helpers/msw-handlers.ts` — `phase8LinkedInHandlers`, `phase8FacebookHandlers`, failure-mode factories

### Dependency manifest
- `packages/web/package.json` — added `msw@2.13.6` devDep
- `pnpm-lock.yaml` — msw resolution graph

## Decisions Made

- **Installed msw@2.13.6 as devDep on @sms/web.** Plan 08-01 Task 3 acceptance criterion explicitly mandates `phase8LinkedInHandlers|phase8FacebookHandlers` exports importing `from 'msw'`. The package was not previously installed; this is required for the task, not a speculative add.
- **Used a local `buildPlatformMockDb` helper inside `post-service-platform.test.ts` rather than extending the shared `helpers/mock-db.ts`.** The shared helper's chainable signature does not currently support the `select-then-conditional-insert` flow needed for the platform invariants. Plan 03 Task 2 may extend the shared helper; Wave 0 keeps the test self-contained.
- **Live failing assertions, no `it.skip` / `it.todo`.** Wave 0's contract is non-zero exit on Vitest. Skipped tests would silently pass and defeat the gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing msw devDependency on @sms/web**
- **Found during:** Task 3 (web test stubs + MSW handlers)
- **Issue:** The plan's Task 3 mandates `msw-handlers.ts` importing `{ http, HttpResponse } from 'msw'`. The `msw` package was not present in the @sms/web manifest, so the helper would fail import collection.
- **Fix:** `pnpm --filter @sms/web add -D msw` (resolved msw@2.13.6).
- **Files modified:** `packages/web/package.json`, `pnpm-lock.yaml`
- **Verification:** `node -e "import('msw').then(m => console.log(Object.keys(m)))"` returns the expected exports including `HttpResponse`, `HttpHandler`.
- **Committed in:** `daca0a1` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking dep install)
**Impact on plan:** Required to satisfy Task 3 acceptance criteria. No scope creep — only the libraries the plan explicitly references.

## Issues Encountered

- The `pnpm --filter ... test` command timed out silently in some invocations on this machine. Verification was performed via direct `npx vitest run` from each package directory, which produced the expected non-zero exit and "Failed to resolve import" errors confirming RED state. All 5 web test files, all 6 backend test files, and both shared test files report failures because production modules are intentionally absent.

## Verification Snapshot

| Acceptance criterion | Threshold | Actual |
|---|---|---|
| `countCodePoints` matches in `platform-text-limits.test.ts` | >= 4 | 6 |
| `callLinkedIn` matches in `linkedin-publish.test.ts` | >= 5 | 9 |
| `callFacebook` matches in `facebook-publish.test.ts` | >= 5 | 9 |
| `rate_limit_exhausted` matches in `post-lifecycle-rate-limit.test.ts` | >= 1 | 7 |
| `checkLinkedInBudgetWithDb` / `checkFacebookBudgetWithDb` matches | >= 2 | 13 |
| `PLATFORM_MISMATCH` / `PLATFORM_IMMUTABLE` in `post-service-platform.test.ts` | >= 2 | 6 |
| `createPost` / `updatePost` in `post-service-platform.test.ts` | >= 4 | 13 |
| `phase8LinkedInHandlers` / `phase8FacebookHandlers` in msw-handlers | >= 2 | 5 |
| `applyPlatformSwitch` in `cross-platform-switch.test.ts` | >= 5 | 9 |
| `progressbar` in `RateLimitsCard.test.tsx` | >= 1 | 3 |
| All test runs exit non-zero (RED state) | yes | yes (shared, api, worker, web all exit 1) |

## TDD Gate Compliance

This is a Wave-0 RED-only plan — no GREEN gate is expected from Plan 08-01 itself. The downstream plans (02, 03, 04, 05a, 05b) drive these tests GREEN. Wave 0 contract (`type=execute` plan, `tdd="true"` tasks containing only RED stubs) is satisfied: 14 new test files committed, all failing for the structural reason that production modules are intentionally absent.

## User Setup Required

None - no external service configuration required for Wave 0 test stubs.

## Next Phase Readiness

- **Plan 02 (Schema, shared, migration):** has failing tests in `packages/shared/src/__tests__/platform-text-limits.test.ts` and `posts-discriminated-union.test.ts` to drive GREEN. The `cross-platform-switch.test.ts` also drives Plan 02's `applyPlatformSwitch` helper.
- **Plan 03 (API routes + rate limit):** has failing tests in `posts-platform.test.ts`, `post-service-platform.test.ts` (closes B-04 Nyquist gap), and `rate-limit-platform.test.ts`.
- **Plan 04 (Worker publish services):** has failing tests in `linkedin-publish.test.ts`, `facebook-publish.test.ts`, `post-lifecycle-rate-limit.test.ts`.
- **Plan 05a (Web forms + previews):** has failing tests in `VisibilitySelector.test.tsx`, `LinkedInPreview.test.tsx`, `FacebookPreview.test.tsx`.
- **Plan 05b (Dashboard + rate-limit chip):** has failing test in `RateLimitsCard.test.tsx`.
- **Plan 07 (Integration verification):** can mount the MSW handler module (`phase8LinkedInHandlers`, `phase8FacebookHandlers`) on `setupServer` for end-to-end coverage.

No blockers.

## Self-Check

- [x] All 14 created files exist on disk (verified post-write).
- [x] All 3 task commits exist on the current branch (`23ec814`, `bb93448`, `daca0a1`) — verified via `git log --oneline -5`.
- [x] Each requirement ID in the plan's `requirements` field has at least one failing test asserting it.
- [x] Each threat ID has at least one failing test exercising the mitigation.
- [x] T-DATA-01 invariants 1 (denormalize) and 2 (immutable) BOTH have explicit failing tests.
- [x] No `it.skip` / `it.todo` — all assertions live (RED is the contract).
- [x] MSW handlers cover LinkedIn /rest/images, /rest/posts AND Facebook /photos, /feed, /videos.

## Self-Check: PASSED

---
*Phase: 08-linkedin-facebook-post-creation*
*Completed: 2026-04-26*
