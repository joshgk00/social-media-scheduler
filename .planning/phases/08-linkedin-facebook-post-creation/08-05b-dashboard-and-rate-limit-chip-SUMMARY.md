---
phase: 08-linkedin-facebook-post-creation
plan: 05b
subsystem: web
tags: [react, vite, tanstack-query, dashboard, rate-limit, linkedin, facebook, twitter, accessibility]

# Dependency graph
requires:
  - phase: 08-linkedin-facebook-post-creation/01
    provides: Plan 01 RED test `__tests__/RateLimitsCard.test.tsx` — Plan 05b turns it GREEN
  - phase: 08-linkedin-facebook-post-creation/02
    provides: rateLimitStateSchema discriminated union (RateLimitState type)
  - phase: 08-linkedin-facebook-post-creation/03
    provides: GET /api/rate-limit (collection) + GET /api/rate-limit/:profileId (single, platform-aware) + per-platform 409 codes
  - phase: 08-linkedin-facebook-post-creation/05a
    provides: format-reset-time.ts helper, RateLimitsCard stub, useAllProfilesRateLimits stub
provides:
  - Real `useAllProfilesRateLimits` hook backed by GET /api/rate-limit collection endpoint, with select() unwrapping `{profiles: [...]}` to a flat array
  - `useRateLimit` re-routed to platform-aware /api/rate-limit/:profileId endpoint via apiClient.getRateLimit
  - `<RateLimitChip />` — compact dot+numeric+reset-time chip slotted into ProfileCard for LinkedIn/Facebook profiles (D-13/D-14, LIMIT-08)
  - `<RateLimitsCard />` — full LIMIT-08 dashboard table widget with green/yellow/red color bands at 50/80% thresholds, role="progressbar" + aria-valuenow/aria-valuemax accessibility
  - `<DashboardPage />` mounted at /dashboard (and as the index route)
  - Sidebar Dashboard nav entry now points at /dashboard
  - Platform-aware copy on `<RateLimitBanner />` (warn) and `<RateLimitBlockError />` (block 409): twitter / linkedin / facebook each get distinct title + body
affects: [08-07-integration-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TanStack Query select() to unwrap envelope-style API responses ({ profiles: [...] }) into flat data shapes that match consumer/test contracts — avoids leaking the wrapper key into every consumer."
    - "Color-band DOM contract: data-band={green|yellow|red} + aria-label={Usage band: green|yellow|red} co-located on the dot element, so tests can find the band via either attribute query or accessible name."
    - "Platform discriminator switch on UI copy: discriminated union narrows on data.platform / error.code to render the matching copy from a single component — no per-platform component duplication for the banner / block error."

key-files:
  created:
    - packages/web/src/components/profiles/RateLimitChip.tsx
    - packages/web/src/pages/dashboard/DashboardPage.tsx
  modified:
    - packages/web/src/hooks/use-rate-limit.ts
    - packages/web/src/hooks/useAllProfilesRateLimits.ts
    - packages/web/src/components/profiles/ProfileCard.tsx
    - packages/web/src/components/dashboard/RateLimitsCard.tsx
    - packages/web/src/components/posts/RateLimitBanner.tsx
    - packages/web/src/components/posts/RateLimitBlockError.tsx
    - packages/web/src/components/layout/Sidebar.tsx
    - packages/web/src/App.tsx
    - packages/web/src/lib/api-client.ts

key-decisions:
  - "Routed apiClient.getRateLimit to the new platform-aware /api/rate-limit/:profileId endpoint (Plan 03) instead of the legacy Twitter-only /api/profiles/:id/rate-limit. This keeps every existing test that mocks `vi.spyOn(apiClient, 'getRateLimit')` working without churn while delivering the discriminated RateLimitState shape every Phase 8 component now narrows on."
  - "Used TanStack Query select() to unwrap the API's `{ profiles: RateLimitState[] }` envelope into a flat `RateLimitState[]`. The Plan 01 RED test mock returns an array directly, so select() lets a single component contract serve both the real API and the test mock."
  - "Letter-badge platform fallback in RateLimitsCard (matches Plan 05a's ProfilePicker decision). lucide-react 1.7 doesn't ship Twitter / Linkedin / Facebook brand icons; mirroring Plan 05a's pattern keeps the visual cue consistent across the app."
  - "Empty-state CTA uses a plain `<a>` instead of `<Link>` so the component renders without a Router context. The Plan 01 RED test renders only under QueryClientProvider — wrapping the test in a router would have changed the test contract."
  - "Moved the band-color dot into the Usage cell next to the progressbar (not the Profile cell). The Plan 01 test query is `bar.parentElement.querySelector('[data-band=\"green\"]')`, which only resolves if the dot is a sibling of the bar in its immediate parent flex container."

patterns-established:
  - "Per-platform UI copy via discriminator switch: a single map keyed by data.platform / error.code drives the title + body copy. Adding a new platform means adding one map entry, not creating a new component."
  - "Test-aligned hooks: when the Wave-0 RED test mock-shape diverges from the real API envelope, prefer query-layer adapters (select()) over per-consumer reshaping. Components consume the canonical shape; the hook handles the envelope."

requirements-completed:
  - LIMIT-08

# Metrics
duration: 7min
completed: 2026-04-26
---

# Phase 08 Plan 05b: Dashboard and Rate-Limit Chip Summary

**LIMIT-08 dashboard widget delivered. `<RateLimitsCard />` renders every connected profile in a shadcn Table with green/yellow/red usage bands at 50/80% thresholds, full WCAG progressbar a11y, and platform-aware reset-time copy. `<RateLimitChip />` slots into ProfileCard for LinkedIn/Facebook with the matching color logic and "Resets in {Nh}" copy. `<RateLimitBanner />` and `<RateLimitBlockError />` now switch on the platform discriminator to render Twitter / LinkedIn / Facebook copy distinctly. Plan 01's `RateLimitsCard.test.tsx` (7 tests) flips GREEN.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-26T15:14:29Z
- **Completed:** 2026-04-26T15:21:15Z
- **Tasks:** 3
- **Files modified:** 11 (2 new, 9 modified)

## Accomplishments

- Plan 01 RED test `RateLimitsCard.test.tsx` is GREEN (7/7 — empty, loading, error, green band 30%, yellow band 75%, red band 95%, progressbar a11y).
- `pnpm --filter @sms/web build` exits 0.
- `pnpm --filter @sms/web exec vitest run` reports 18/18 test files passing — 119 tests passed + 13 todo. No regressions in the existing RateLimitSettingsDialog suite (5 tests that mock `apiClient.getRateLimit` continue to pass after the endpoint switch).
- LIMIT-08 acceptance criteria all satisfied: dashboard widget, color bands, role="progressbar" + aria-valuenow/aria-valuemax, sidebar nav, /dashboard route, RateLimitChip on ProfileCard for non-Twitter profiles, platform-aware banner + block error.
- Plan 05a's stubs (`RateLimitsCard.tsx`, `useAllProfilesRateLimits.ts`) replaced with real implementations.

## Task Commits

1. **Task 1: Platform-aware rate-limit hooks + RateLimitChip on ProfileCard** — `fcdc915` (feat)
2. **Task 2: RateLimitsCard widget + DashboardPage at /dashboard** — `dcb7293` (feat)
3. **Task 3: Platform-aware copy on RateLimitBanner + RateLimitBlockError** — `4fa142d` (feat)

## Files Created/Modified

### Web package — new files
- `packages/web/src/components/profiles/RateLimitChip.tsx` — LIMIT-08 / D-13 / D-14 compact chip with color-banded dot, numeric, and platform-aware "Resets in {Nh}" / "Resets {Mon DD}" copy. Slotted into ProfileCard for LI/FB profiles.
- `packages/web/src/pages/dashboard/DashboardPage.tsx` — `/dashboard` route entry. `<main>` landmark, page heading, mounts `<RateLimitsCard />`.

### Web package — modified files
- `packages/web/src/hooks/use-rate-limit.ts` — added `useAllProfilesRateLimits` collection hook with `select()` to flatten `{ profiles: [...] }` envelope. `useRateLimit` updated to use the platform-aware endpoint (via apiClient).
- `packages/web/src/hooks/useAllProfilesRateLimits.ts` — replaced the Plan 05a stub with a re-export of the real hook from `use-rate-limit.ts`. The Plan 01 test mocks this exact module path.
- `packages/web/src/components/profiles/ProfileCard.tsx` — slot `RateLimitChip` directly below `TokenHealthBadge` for `profile.platform !== 'twitter'`. Twitter still uses the page-supplied `rateLimitIndicator` slot (unchanged).
- `packages/web/src/components/dashboard/RateLimitsCard.tsx` — replaced the Plan 05a stub with the full LIMIT-08 widget. Reads a flat `RateLimitState[]` from the hook, renders a shadcn Table with platform-letter badge, color-banded usage progressbar (`role="progressbar"` + `aria-valuenow`/`aria-valuemax`/`aria-label`), and reset-time copy. Empty state uses plain `<a>` (no Router context required for tests). Skeleton rows expose `role="status"` + `aria-label="Loading rate limits"`.
- `packages/web/src/components/posts/RateLimitBanner.tsx` — title + body copy now switch on `data.platform`. Twitter / LinkedIn / Facebook each get distinct copy per UI-SPEC §Rate-limit banner. Edit-budget CTA stays Twitter-only.
- `packages/web/src/components/posts/RateLimitBlockError.tsx` — `error` prop is now a discriminated union over `code` (twitter_budget_exceeded / linkedin_rate_limit_exceeded / facebook_rate_limit_exceeded). Title + body switch on the code; LI/FB carry `windowResetAt` and render the formatted reset time.
- `packages/web/src/components/layout/Sidebar.tsx` — Dashboard nav entry now points at `/dashboard` (was `/`).
- `packages/web/src/App.tsx` — added `/dashboard` route mapping to `DashboardPage`. Index route also mounts `DashboardPage` for backward compat. Removed the inline `DashboardPlaceholder`.
- `packages/web/src/lib/api-client.ts` — `getRateLimit` now routes to `/api/rate-limit/:profileId` (Plan 03 platform-aware endpoint). PATCH endpoint stays on the legacy `/api/profiles/:id/rate-limit` path because the budget config still lives under the profile resource.

## Decisions Made

- **Route `apiClient.getRateLimit` to the new endpoint (not duplicate it).** Adding a new `getPlatformRateLimit` method would have left the legacy method unchanged and required updating every consumer. Instead, the existing method now points at the platform-aware route — every consumer (and every test that mocks the method) gets the new behavior for free, with no surface change.
- **Use `select()` to flatten the API envelope.** The API returns `{ profiles: [...] }` (sensible for an API contract — wrappers leave room for pagination metadata later). The Plan 01 RED test mock returns a flat array. TanStack Query's `select()` is the right place to bridge — consumers see a flat array, the network shape stays explicit.
- **Plain `<a>` in the empty state.** The Plan 01 test renders the component under `QueryClientProvider` only — adding a Router would change the binding test contract. The empty-state CTA navigates to `/profiles` either way; a plain anchor with `href="/profiles"` is a full page reload but the empty-state path is rare enough that the trade-off is acceptable.
- **Letter-badge platform fallback.** Plan 05a established the pattern when lucide-react 1.7 turned out to lack brand icons. Using the same pattern in RateLimitsCard keeps the visual language consistent.
- **Move the band-dot into the Usage cell.** The Plan 01 test query `bar.parentElement.querySelector('[data-band="green"]')` mandates the dot be a sibling of the progressbar. Putting it in the Profile cell (semantically reasonable but in a different `<td>`) would have failed the test. Placing it next to the bar in the same flex container also reads better visually — the band color is about the bar's value, not the profile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 01 test contract diverges from the plan's reference implementation**
- **Found during:** Task 2 verification.
- **Issue:** The plan's `useAllProfilesRateLimits` reference implementation returned `{ data: { profiles: [...] }, isLoading, error }` and the plan's `RateLimitsCard` reference reads `data.profiles`. The Plan 01 RED test mock returns `{ data: [...], isLoading, isError }` (flat array) and the test reads `data` directly. Implementing the plan literally would have left `RateLimitsCard.test.tsx` RED.
- **Fix:** Used TanStack Query `select()` in the hook to flatten the envelope. The hook returns a flat `RateLimitState[]` to consumers. The component reads `data` (array) and `isError` (boolean) — matches the test contract, matches the real API.
- **Files modified:** `packages/web/src/hooks/use-rate-limit.ts`, `packages/web/src/components/dashboard/RateLimitsCard.tsx`
- **Committed in:** `dcb7293`

**2. [Rule 3 - Blocking] lucide-react 1.7 has no brand icons**
- **Found during:** Task 2 build verification.
- **Issue:** `import { Twitter, Linkedin, Facebook } from 'lucide-react'` failed with TS2305 — same lucide version pinned in workspace as Plan 05a hit. The plan's reference implementation used these icons.
- **Fix:** Letter-badge fallback (`PlatformBadge` component): rounded `bg-secondary` square with platform letter (X / in / f). Same pattern Plan 05a used in ProfilePicker.
- **Files modified:** `packages/web/src/components/dashboard/RateLimitsCard.tsx`
- **Committed in:** `dcb7293`

**3. [Rule 3 - Blocking] Empty state requires a Router context for `<Link>`**
- **Found during:** Task 2 test run (TypeError: Cannot destructure property 'basename' of 'React.useContext(...)').
- **Issue:** The plan's reference implementation used `<Link to="/profiles">`. The Plan 01 RED test renders the component under `QueryClientProvider` only — no Router. `<Link>` reads the Router context at render and crashes.
- **Fix:** Replaced `<Link>` with a plain `<a href="/profiles">`. The empty state is the only path that needs navigation, and it's a low-frequency UX (no profiles connected) where a full page reload is acceptable.
- **Files modified:** `packages/web/src/components/dashboard/RateLimitsCard.tsx`
- **Committed in:** `dcb7293`

**4. [Rule 3 - Blocking] Band-dot placement diverged from test query**
- **Found during:** Task 2 test run (`expected null not to be null` on `bar.parentElement?.querySelector('[data-band="green"]')`).
- **Issue:** The plan's reference implementation put the color-band dot inside the progressbar; the test query looks for `[data-band="..."]` as a sibling of the bar in the bar's parent.
- **Fix:** Moved the dot into the same flex container as the progressbar. Now `bar.parentElement` is the flex `div` and the dot is a sibling that matches `[data-band="green"]`.
- **Files modified:** `packages/web/src/components/dashboard/RateLimitsCard.tsx`
- **Committed in:** `dcb7293`

**5. [Rule 1 - Bug] Switching `useRateLimit` to call `apiClient.get` directly broke 5 RateLimitSettingsDialog tests**
- **Found during:** Task 3 verification (`pnpm test` showed RateLimitSettingsDialog suite failing — `Unable to find an element with the text: Used this month: 120 of 500 (24%)`).
- **Issue:** Initial Task 1 implementation called `apiClient.get('/api/rate-limit/...')` directly. Existing tests `vi.spyOn(apiClient, 'getRateLimit')` to mock the network call — bypassing `apiClient.getRateLimit` left those spies inert and the dialog never received its query data.
- **Fix:** Updated `apiClient.getRateLimit` to route to the new platform-aware endpoint, and reverted `useRateLimit` to call `apiClient.getRateLimit`. Same network behavior, but every test that spies on the method gets the right shape.
- **Files modified:** `packages/web/src/lib/api-client.ts`, `packages/web/src/hooks/use-rate-limit.ts`
- **Verification:** Full web test suite 119/119 GREEN + 13 todo.
- **Committed in:** `4fa142d`

---

**Total deviations:** 5 auto-fixed (4 test-contract alignment + 1 regression bug from initial Task 1 design). No architectural escalations.

## Issues Encountered

- None blocking. Web `vitest --run` exit code is non-zero only when there are failures; under this plan all 18 test files pass.

## User Setup Required

None. All changes are client-side; no external configuration or new credentials required.

## Verification Snapshot

| Acceptance criterion | Threshold | Actual |
|---|---|---|
| `useAllProfilesRateLimits` matches in `hooks/use-rate-limit.ts` | >= 1 | 1 |
| `RateLimitChip` matches in `components/profiles/RateLimitChip.tsx` | >= 1 | 3 |
| `RateLimitChip` matches in `components/profiles/ProfileCard.tsx` | >= 1 | 3 |
| `RateLimitsCard` matches in `components/dashboard/RateLimitsCard.tsx` | >= 1 | 2 |
| `role="progressbar"` matches in `components/dashboard/RateLimitsCard.tsx` | >= 1 | 2 |
| `DashboardPage` matches in `App.tsx` | >= 1 | 3 |
| `/dashboard` matches in `Sidebar.tsx` | >= 1 | 1 |
| `linkedin_rate_limit_exceeded` / `facebook_rate_limit_exceeded` in RateLimitBlockError.tsx | >= 2 | 6 |
| `Twitter:` / `LinkedIn:` / `Facebook:` in RateLimitBanner.tsx | >= 3 | 4 |
| `pnpm --filter @sms/web build` exit | 0 | 0 |
| `pnpm --filter @sms/web exec vitest run RateLimitsCard` exit | 0 | 0 (7/7 GREEN) |
| Full @sms/web suite | all GREEN | 18 files passed, 119 tests + 13 todo |

## TDD Gate Compliance

This plan is `type: execute` with `tdd="true"` on Tasks 1-3. The RED tests come from Plan 01. Plan 05b ships the implementations that drive the dashboard subset GREEN.

- **RED gate:** Plan 01 commit `daca0a1` covers `RateLimitsCard.test.tsx` (Task 2's binding contract). Tasks 1 and 3 don't have dedicated Plan 01 RED tests — their `tdd="true"` flag was about following test-aligned implementation, not turning a specific RED test GREEN.
- **GREEN gate:** Plan 05b commits `fcdc915` (Task 1) + `dcb7293` (Task 2) + `4fa142d` (Task 3) ship the production code. The Plan 01 `RateLimitsCard.test.tsx` is now GREEN (7/7).
- **REFACTOR:** None required — the test contract was the binding constraint, and the implementation aligned to it directly.

## Next Plan Readiness

- **Plan 07 (Integration verification):** Has the full LIMIT-08 stack available end-to-end — `/dashboard` route, RateLimitsCard widget, RateLimitChip on profile cards, platform-aware banner + block error. The integration verification can exercise all three platforms' rate-limit flows from the new dashboard view.

No blockers.

## Self-Check

- [x] All 2 created files exist on disk (`packages/web/src/components/profiles/RateLimitChip.tsx`, `packages/web/src/pages/dashboard/DashboardPage.tsx` — verified via `ls`).
- [x] All 3 task commits exist on the current branch (`fcdc915`, `dcb7293`, `4fa142d`) — verified via `git log --oneline -6`.
- [x] Plan 01 `RateLimitsCard.test.tsx` is GREEN (7/7).
- [x] `pnpm --filter @sms/web build` exits 0.
- [x] Full `pnpm --filter @sms/web exec vitest run` is 18/18 test files passing (119 tests + 13 todo).
- [x] LIMIT-08 success criterion delivered: dashboard widget with color bands, RateLimitChip on ProfileCard, platform-aware banner + block error, /dashboard route + Sidebar nav.
- [x] Plan 05a's stubs replaced with real implementations (RateLimitsCard.tsx, useAllProfilesRateLimits.ts).
- [x] No `as any` casts in the new files (only the `RateLimitsCard` hook return uses `as { data: RateLimitRow[] | undefined; ... }` to express the post-`select()` shape — narrows the inferred type without weakening it).
- [x] WCAG a11y on the dashboard widget: `role="progressbar"` + `aria-valuenow` + `aria-valuemax` + `aria-label` on every usage bar; band dots carry `aria-label="Usage band: {color}"` for assistive tech.

## Self-Check: PASSED

---
*Phase: 08-linkedin-facebook-post-creation*
*Completed: 2026-04-26*
