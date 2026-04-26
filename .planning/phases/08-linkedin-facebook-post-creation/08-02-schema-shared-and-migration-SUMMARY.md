---
phase: 08-linkedin-facebook-post-creation
plan: 02
subsystem: database
tags: [drizzle, postgres, zod, discriminated-union, rate-limit, linkedin, facebook, schema, migration]

# Dependency graph
requires:
  - phase: 08-linkedin-facebook-post-creation/01
    provides: 14 RED test stubs (shared, api, worker, web) — Plan 02 turns the shared/schema subset GREEN
  - phase: 07-multi-platform-profiles-token-lifecycle
    provides: socialProfiles schema with linkedin/facebook OAuth + tokenStatus
provides:
  - 7 new social_profiles columns (linkedin_daily_limit/count/window_start_utc, facebook_hourly_limit/count/window_start_utc, linkedin_account_type)
  - 3 new posts columns (platform default 'twitter', visibility nullable, link_url nullable)
  - Migration 0006_phase-08-rate-limit-windows applied to live DB
  - createPostSchema and updatePostSchema as strict discriminated unions over `platform`
  - rateLimitStateSchema as platform-discriminated union (twitter monthly / linkedin daily / facebook hourly)
  - countCodePoints + PLATFORM_TEXT_LIMITS in @sms/shared
  - checkLinkedInBudget + checkFacebookBudget pure calculators
affects: [08-03-api-routes-and-rate-limit, 08-04-worker-publish-services, 08-05a-web-forms-and-previews, 08-05b-dashboard-and-rate-limit-chip, 08-07-integration-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-platform Zod discriminated-union with cross-field rules applied at union level via superRefine (Zod 3 requires ZodObject variants)"
    - "Code-point-aware char counting for LinkedIn / Facebook via spread iterator"
    - "Denormalized posts.platform column (default 'twitter') so worker hot-path avoids JOIN — application enforces immutability (T-DATA-01)"
    - "varchar(16) NOT NULL DEFAULT for linkedin_account_type backfills as 'person' — matches Phase 7's only LinkedIn flow"

key-files:
  created:
    - packages/shared/src/lib/platform-text-limits.ts
    - packages/shared/src/lib/index.ts
    - packages/db/drizzle/0006_phase-08-rate-limit-windows.sql
    - packages/db/drizzle/meta/0006_snapshot.json
    - .planning/phases/08-linkedin-facebook-post-creation/deferred-items.md
  modified:
    - packages/shared/src/schemas/posts.ts
    - packages/shared/src/schemas/rate-limit.ts
    - packages/shared/src/rate-limit/check-budget.ts
    - packages/shared/src/index.ts
    - packages/db/src/schema/social-profiles.ts
    - packages/db/src/schema/posts.ts
    - packages/db/drizzle/meta/_journal.json

key-decisions:
  - "Applied superRefine at the discriminatedUnion level (not per variant). Zod 3 rejects ZodEffects inside discriminatedUnion, so cross-field rules dispatch on data.platform inside a single superRefine block."
  - "Kept lib-level barrel (packages/shared/src/lib/index.ts) AND root-level direct re-exports — root barrel predates the lib barrel and other lib files use direct re-exports; matched both styles."
  - "linkedin_account_type defaults to 'person' NOT NULL. Phase 7's only LinkedIn flow connected personal profiles, so the backfill is correct; organization profiles connected later set this explicitly at insert time (Plan 03 Task 2 / Pitfall 9)."
  - "Web layer type errors from the schema upgrade are deferred to Plans 05a/05b. Logged in deferred-items.md with file-by-file ownership."

patterns-established:
  - "Discriminated-union schemas use ZodObject variants only; cross-field rules live in a top-level superRefine that switches on the discriminator."
  - "Platform text limits use code-point counting (LinkedIn/Facebook) — never UTF-16 code units; Twitter routes through twitter-text instead."
  - "NOT NULL columns added in mid-life migrations carry a DEFAULT so the migration backfills safely without a separate UPDATE pass."

requirements-completed:
  - POST-LI-01
  - POST-LI-02
  - POST-LI-03
  - POST-LI-04
  - POST-FB-01
  - POST-FB-02
  - POST-FB-03
  - POST-FB-04
  - POST-FB-05
  - LIMIT-06
  - LIMIT-07

# Metrics
duration: 6min
completed: 2026-04-26
---

# Phase 08 Plan 02: Schema, Shared, and Migration Summary

**Drizzle schema gains 10 phase-8 columns (7 social_profiles + 3 posts), migration 0006 applied to the live DB, and @sms/shared exports discriminated-union createPostSchema/rateLimitStateSchema plus per-platform budget calculators — flipping the shared-package subset of Plan 01's RED tests GREEN.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-26T14:03:26Z
- **Completed:** 2026-04-26T14:09:05Z
- **Tasks:** 4
- **Files modified:** 12 (5 new, 7 modified)

## Accomplishments

- `@sms/shared` ships `countCodePoints`, `PLATFORM_TEXT_LIMITS`, `createPostSchema` / `updatePostSchema` as strict discriminated unions, `rateLimitStateSchema` as a platform-keyed union, and `checkLinkedInBudget` + `checkFacebookBudget` pure calculators — all 14 Plan-01 shared-package RED tests are now GREEN (140/140 shared suite passes).
- Drizzle schema gains 7 social_profiles columns (rate-limit windows + linkedin_account_type) and 3 posts columns (platform, visibility, link_url) without touching any existing column. The `platform` denormalization keeps the worker publish path JOIN-free (Pattern 1, Pitfall A5).
- Migration `0006_phase-08-rate-limit-windows.sql` was generated by drizzle-kit (10 ALTER TABLE statements, no unrelated changes) and applied via `pnpm db:migrate`. The live DB confirms NOT NULL backfills: 4 social profiles backfilled with `linkedin_daily_limit=100`, `facebook_hourly_limit=200`, `linkedin_account_type='person'`; 3 existing posts backfilled with `platform='twitter'`. `posts.visibility` and `posts.link_url` correctly remain NULL (no backfill expected).
- Cross-platform field smuggling (T-API-03) is now schema-rejected: `linkedin` payload carrying `linkUrl` returns a parse failure, as does `facebook` carrying `visibility`.

## Task Commits

1. **Task 1: Shared package — platform-text-limits + discriminated unions + budget calculators** — `61f7f07` (feat)
   - Auxiliary doc commit `c2b787d` (docs) tracking deferred web-layer type errors for Plans 05a/05b.
2. **Task 2: Drizzle schema extensions (social_profiles + posts)** — `77aee11` (feat)
3. **Task 3: drizzle-kit migration 0006 generation** — `23c3c6a` (feat)
4. **Task 4: Apply migration to live database** — runtime operation, no code commit (migration record id=7 in `drizzle.__drizzle_migrations`).

## Files Created/Modified

### Shared package
- `packages/shared/src/lib/platform-text-limits.ts` *(new)* — `countCodePoints`, `PLATFORM_TEXT_LIMITS`, `isWithinPlatformLimit`
- `packages/shared/src/lib/index.ts` *(new)* — aggregate barrel for `lib/`
- `packages/shared/src/schemas/posts.ts` *(modified)* — `createPostSchema` / `updatePostSchema` as discriminated unions over `platform`, `.strict()` per variant
- `packages/shared/src/schemas/rate-limit.ts` *(modified)* — `rateLimitStateSchema` as a platform-discriminated union
- `packages/shared/src/rate-limit/check-budget.ts` *(modified)* — `checkLinkedInBudget`, `checkFacebookBudget` pure calculators
- `packages/shared/src/index.ts` *(modified)* — added `platform-text-limits` re-export

### DB package
- `packages/db/src/schema/social-profiles.ts` *(modified)* — 7 new columns
- `packages/db/src/schema/posts.ts` *(modified)* — 3 new columns
- `packages/db/drizzle/0006_phase-08-rate-limit-windows.sql` *(new)* — 10 ALTER TABLE statements
- `packages/db/drizzle/meta/0006_snapshot.json` *(new)* — drizzle snapshot
- `packages/db/drizzle/meta/_journal.json` *(modified)* — 0006 entry

### Phase artefacts
- `.planning/phases/08-linkedin-facebook-post-creation/deferred-items.md` *(new)* — web layer follow-ups for Plans 05a/05b

## Decisions Made

- **superRefine at the union level, not per variant.** Zod 3's `discriminatedUnion` requires `ZodObject` members. Wrapping each variant in `.refine()` returns `ZodEffects` and breaks the discriminator. Solution: keep variants as plain ZodObjects, apply cross-field rules in a single top-level `superRefine` that branches on `data.platform`. This is the canonical Zod 3 pattern for cross-platform schemas.
- **Kept the root barrel's direct re-exports AND added a lib-level barrel.** The plan's Task 1 lists `packages/shared/src/lib/index.ts` as a file to ship. The existing convention re-exports from each lib file at the root barrel; the new lib barrel is additive — no consumer pattern changed.
- **`linkedin_account_type='person'` default backfill.** Phase 7's LinkedIn flow only handled personal accounts, so all currently-connected LinkedIn profiles are people. Organization profiles connected after Plan 03 set this explicitly during the OAuth callback insert (Pitfall 9).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restructured superRefine to satisfy Zod 3 discriminatedUnion type contract**
- **Found during:** Task 1 (typecheck after first draft)
- **Issue:** First draft applied `superRefine` to each variant individually before passing them to `z.discriminatedUnion(...)`. Zod 3's `discriminatedUnion` is typed to accept `ZodObject` members, but `superRefine` returns `ZodEffects`, producing TS2740 ("missing _cached, _getCached, shape, strict, and 14 more").
- **Fix:** Kept variants as plain `ZodObject`s; moved all cross-field rules (`requireScheduledAtWhenScheduled`, `requireLinkedInContent`, `requireFacebookContent`) into a single top-level `superRefine` on the union that branches on `data.platform`. Applied the same pattern to `updatePostSchema`.
- **Files modified:** `packages/shared/src/schemas/posts.ts`
- **Verification:** `pnpm --filter @sms/shared build` exits 0; all 14 Plan-01 shared tests pass.
- **Committed in:** `61f7f07`

---

**Total deviations:** 1 auto-fixed (Zod 3 typing constraint).
**Impact on plan:** Implementation pattern shift; behavior identical to the plan's described semantics. No scope creep.

## Issues Encountered

- `pnpm --filter @sms/web build` fails with type errors in `ProfileRateLimitIndicator.tsx`, `RateLimitSettingsDialog.tsx`, `EditPostPage.tsx`, `NewPostPage.tsx`. These are **expected** — the web layer was authored against the previous single-shape schemas and Plans 05a/05b are responsible for refactoring it to discriminate on `platform`. Logged in `deferred-items.md` with file-by-file ownership. `pnpm --filter @sms/api build` and `pnpm --filter @sms/shared build` both pass.

## User Setup Required

None — no external service configuration required for this plan.

## Verification Snapshot

| Acceptance criterion | Threshold | Actual |
|---|---|---|
| `countCodePoints` matches in `platform-text-limits.ts` | >= 1 | 2 |
| `discriminatedUnion` matches in `posts.ts` | >= 1 | 2 |
| `discriminatedUnion` matches in `rate-limit.ts` | >= 1 | 1 |
| `checkLinkedInBudget` / `checkFacebookBudget` matches in `check-budget.ts` | >= 2 | 2 |
| `pnpm --filter @sms/shared build` exit code | 0 | 0 |
| `pnpm --filter @sms/db build` exit code | 0 | 0 |
| `pnpm --filter @sms/shared test platform-text-limits posts-discriminated-union` | exit 0 | 14/14 pass |
| Migration `0006_phase-08-rate-limit-windows.sql` exists | yes | yes |
| `_journal.json` references 0006 tag | yes | yes |
| Migration touches only social_profiles + posts | yes | yes (10 ALTERs) |
| `pnpm db:migrate` exit | 0 | 0 |
| `__drizzle_migrations` row count | 7 | 7 (id=7 is 0006) |
| `social_profiles WHERE linkedin_daily_limit IS NULL` | 0 | 0 |
| `social_profiles WHERE linkedin_account_type IS NULL` | 0 | 0 |
| `posts WHERE platform IS NULL` | 0 | 0 |
| `posts WHERE visibility IS NOT NULL` (immediately post-migration) | 0 | 0 |

## TDD Gate Compliance

This plan is `type: execute` with `tdd="true"` on Tasks 1 and 2. The RED tests come from Plan 01 (committed in `23ec814`, `bb93448`, `daca0a1`). Plan 02 ships the implementation that drives the shared-subset GREEN. Tasks 3 (migration generation) and 4 (migration apply) are infrastructure and do not carry test gates.

- RED gate: Plan 01 commits `23ec814` (`test(08-01): ...`) and `daca0a1` cover the shared package's failing tests.
- GREEN gate: Plan 02 commit `61f7f07` (`feat(08-02): ...`) ships `countCodePoints`, `PLATFORM_TEXT_LIMITS`, the discriminated `createPostSchema`, and the budget calculators — `pnpm --filter @sms/shared test` returns 140/140 GREEN.
- REFACTOR: not required.

## Next Plan Readiness

- **Plan 03 (API routes + rate-limit):** can now insert `posts.platform` / `posts.visibility` / `posts.link_url` without `as` casts, and read `social_profiles.{linkedin,facebook}_*` for the atomic CAS UPDATE. Plan 01's `posts-platform.test.ts`, `post-service-platform.test.ts`, and `rate-limit-platform.test.ts` are still RED and ready to drive Plan 03 GREEN.
- **Plan 04 (Worker publish services):** the worker can read `linkedin_account_type` to dispatch the correct URN at LinkedIn publish; window columns are in place for the runtime re-check.
- **Plans 05a / 05b (Web):** must consume the new discriminated unions. `deferred-items.md` lists the four web files that currently fail typecheck — these are the entry points for those plans.

No blockers.

## Self-Check

- [x] All created files exist on disk
- [x] All 4 task commits exist on the current branch (`61f7f07`, `c2b787d`, `77aee11`, `23c3c6a`) — verified via `git log`
- [x] Migration 0006 applied to the live DB (drizzle.__drizzle_migrations id=7)
- [x] All 14 Plan-01 RED tests for shared-package concerns now pass
- [x] No NULL violations on NOT NULL columns (verified via SELECT count(*))
- [x] No unrelated tables touched by the migration

## Self-Check: PASSED

---
*Phase: 08-linkedin-facebook-post-creation*
*Completed: 2026-04-26*
