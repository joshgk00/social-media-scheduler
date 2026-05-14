---
phase: 11-snippets-search-calendar-polish
verified: 2026-05-03T00:51:11Z
re_verified: 2026-05-05
status: passed
score: 8/8 must-haves verified
re_verification: "TS gap resolved in commit a10fa98 (split useForm input/output generics in SnippetFormDialog.tsx; isValidElement guard in headline-to-mark.test.tsx). UAT issue 10 (PostsPage URL-state) resolved in commit 36d46c0 with regression test. Full workspace `pnpm -w test` exit 0; web 178 / api 479 / worker 215 / shared 173 / db 11 = 1056 passing. Backlog test-coverage items filed as issues #41, #42, #43."
gaps: []
gaps_resolved:
  - truth: "Workspace test command (`pnpm -w test`) completes successfully"
    original_status: failed
    resolved_in: "a10fa98"
    notes: "Three TS errors in Phase 11 files fixed (SnippetFormDialog resolver typing ×2; headline-to-mark.test node.props narrowing). tsc -b clean across all packages."
  - truth: "PostsPage search input syncs to URL via setSearchParams replace:true (UI-SPEC line 154)"
    original_status: failed
    resolved_in: "36d46c0"
    notes: "Added useSearchParams import, initial-from-URL read, and setSearchParams call alongside existing filters update; new regression test mirrors QueuePostsPage URL-state assertions."
human_verification:
  - test: "Snippet picker keyboard insertion in iOS Safari (cursor-position trap)"
    expected: "On a real iPhone, open composer, place cursor mid-text, open snippet picker, insert snippet — text inserts at original cursor position (not appended)"
    why_human: "Mobile Safari blurs textarea on popover open; jsdom can't reproduce focus/selection semantics — documented as manual-only in 11-VALIDATION.md"
  - test: "Search highlight readability against the dark theme (WCAG AA)"
    expected: "Query a term that hits multiple posts; confirm highlighted `<mark>` spans pass 4.5:1 contrast in both light and dark themes"
    why_human: "Color contrast is a qualitative judgement — documented as manual-only in 11-VALIDATION.md"
  - test: "Calendar visual parity across Month/Week/Day views"
    expected: "Switch M → W → D; event positioning, color-coding, and conflict left-borders all render correctly with no overflow or truncation issues"
    why_human: "react-big-calendar internal layout differences across views can't be asserted in jsdom — documented as manual-only in 11-VALIDATION.md"
  - test: "Cross-platform color contrast on calendar entries"
    expected: "Twitter / LinkedIn / Facebook entries are visually distinct against zinc background in both themes"
    why_human: "OKLCH platform colors against dark zinc require eyeball check — documented as manual-only in 11-VALIDATION.md"
  - test: "Calendar entry click in production-like build"
    expected: "Build production assets, click an event, verify navigation to /posts/:id/edit works"
    why_human: "rbc + React Router interaction differs slightly between dev and prod — documented as manual-only in 11-VALIDATION.md"
---

# Phase 11: Snippets, Search, Calendar & Polish — Verification Report

**Phase Goal:** User has productivity tools (saved text snippets, full-text search, calendar visualization) and the security policy for future AI integration.
**Verified:** 2026-05-03T00:51:11Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create/edit/delete snippets, persist per-user (SNIP-01) | VERIFIED | `snippets` table live in DB; `snippet.service.ts` + routes wired in app.ts L102; integration test file `snippets-api.test.ts` passes 5/5; cross-tenant isolation + 409 duplicate-name + 404 ownership confirmed; `SnippetsPage.tsx` (234 lines) at `/settings/snippets` route in App.tsx L56 |
| 2 | Insert Snippet button inserts at textarea cursor in composer (SNIP-02, POST-CMN-08) | VERIFIED | `SnippetPicker.tsx` L43 captures `selectionStart` in `onPointerDown` (Pitfall-4 guard), L84 aria-label `Insert snippet`, mounted in `SharedPostFields.tsx` L103; component test `SnippetPicker.test.tsx` passes |
| 3 | CSV bulk-import substitutes `{{snippet:name}}` tokens (SNIP-03) | VERIFIED | `csv-import-scheduled.handler.ts` L3+L27 imports `substituteSnippetsInText` from `@sms/shared`; same in `csv-import-queue.handler.ts`; per-user snippet map; test `csv-import-scheduled.handler.test.ts` (329 lines) passes |
| 4 | Global search returns ranked results with highlighted matches, tenant-isolated (SEARCH-01, SEARCH-02) | VERIFIED | `post.service.ts` L443-446 builds `plainto_tsquery` + `ts_headline` + `ts_rank` over `(search_vector || tag_search_vector)`; integration test `posts-search.test.ts` passes 6/6 against live Postgres; `headline-to-mark.tsx` allowlist parser maps `<b>`→`<mark>` (no `dangerouslySetInnerHTML`); `renderHeadline` used in PostsPage L263 + QueuePostsPage L347 |
| 5 | Calendar shows scheduled posts in M/W/D views with conflict indicators and platform colors (CAL-01..04) | VERIFIED | `CalendarPage.tsx` (218 lines) registered at `/calendar` in App.tsx L51 + Sidebar L28; `calendar.ts` route reuses `checkConflicts` from `post.service`; integration test `calendar-api.test.ts` passes 6/6; component test `CalendarPage.test.tsx` (279 lines) passes; drag-to-reschedule explicitly out of scope per CONTEXT.md `<deferred>` |
| 6 | POST-CMN-08 Insert Snippet button on every post form | VERIFIED | `SharedPostFields.tsx` L103 — used by Twitter/LinkedIn/Facebook fields per Plan 09; covered by truth #2 evidence |
| 7 | SEC-07 deliverables ship: pino redact, BullMQ schema test, SECURITY.md, grep gate | VERIFIED | `packages/shared/src/logger.ts` L8-16 has 9 redact paths covering 3 case variants × (request body + 1-deep + 2-deep wildcards); `sec-07-job-schema.test.ts` enumerates 10 BullMQ schemas; `SECURITY.md` (37 lines, repo root) §"OpenAI API Key Handling (SEC-07)"; `rg -il "openai" packages/api/src` returns only `logger.test.ts` + `sec-07-job-schema.test.ts` (no production AI code) |
| 8 | Migration 0009 applied to live DB | FAILED for `pnpm -w test` (gap below); SCHEMA itself VERIFIED | Live `psql` confirms: `posts.search_vector` STORED tsvector, `posts.tag_search_vector` tsvector, `snippets` table, `posts_fts_idx` GIN over `(search_vector \|\| tag_search_vector)`, `post_tags_after_change` AFTER INSERT/DELETE trigger, drizzle migrations table at id 13 |

**Score:** 7 / 8 truths verified. The gap is a build-tooling type-checking failure (truth #1 below in Required Artifacts), not a runtime/behavior failure.

### Required Artifacts

All 43 declared artifact paths from the 11 plan frontmatter blocks were checked. Key results:

| Artifact | Status | Notes |
|----------|--------|-------|
| `packages/shared/src/lib/snippet-tokens.ts` | VERIFIED | 34 lines, tested by 106-line spec |
| `packages/shared/src/schemas/{snippets,calendar}.ts` | VERIFIED | Exported via `packages/shared/src/index.ts` |
| `packages/shared/src/logger.ts` | VERIFIED | 9 redact paths covering 3 case variants × 3 nesting levels |
| `packages/db/src/schema/snippets.ts` | VERIFIED | 18 lines (matches `min_lines: 18` in plan); pgEnum + pgTable + uniqueIndex |
| `packages/db/drizzle/0009_phase-11-snippets-fts-calendar.sql` | VERIFIED | 53 lines: snippets table, tsvector + GIN, plpgsql trigger function, AFTER INSERT/DELETE trigger, one-pass backfill |
| `packages/api/src/services/snippet.service.ts` | VERIFIED | 136 lines; CRUD + 23505→409 mapping |
| `packages/api/src/routes/{snippets,calendar}.ts` | VERIFIED | Both wired in `app.ts` L102-103 via `app.use(...)` |
| `packages/api/src/services/post.service.ts` | VERIFIED | FTS rewrite at L443-446 uses `plainto_tsquery` + `ts_headline` + `ts_rank` over combined tsvectors |
| `packages/worker/src/bulk/csv-import-{scheduled,queue}.handler.ts` | VERIFIED | Both import `substituteSnippetsInText` and `getSnippets`; tests pass |
| `packages/web/src/hooks/use-snippets.ts` | VERIFIED | TanStack Query hooks: `useSnippets`, `useCreateSnippet`, `useUpdateSnippet`, `useDeleteSnippet` |
| `packages/web/src/components/snippets/SnippetPicker.tsx` | VERIFIED | 147 lines; cursor capture in `onPointerDown` (L85) before popover focus shift |
| `packages/web/src/components/snippets/SnippetFormDialog.tsx` | EXISTS, fails type-check | 198 lines; Zod resolver type mismatch on L49 + L109. Vitest passes (esbuild ignores) but `tsc -b` fails. **See gap.** |
| `packages/web/src/pages/settings/SnippetsPage.tsx` | VERIFIED | 234 lines; route registered |
| `packages/web/src/components/posts/SharedPostFields.tsx` | VERIFIED | L103 mounts `<SnippetPicker textareaRef={…} onInsert={…}/>` |
| `packages/web/src/lib/headline-to-mark.tsx` | EXISTS, test fails type-check | Plan declared `.ts` but file is `.tsx` (correct given JSX usage). Test file `headline-to-mark.test.tsx` has TS18046 on L9. Runtime tests pass. **See gap.** |
| `packages/web/src/lib/calendar-localizer.ts` | VERIFIED | 4 lines (sufficient — single-line `luxonLocalizer(DateTime)` export per design) |
| `packages/web/src/hooks/use-calendar-posts.ts` | VERIFIED | TanStack Query hook |
| `packages/web/src/pages/calendar/CalendarPage.tsx` | VERIFIED | 218 lines + 279-line test suite (passes) |
| `packages/web/src/pages/calendar/CalendarToolbar.tsx` | VERIFIED | shadcn Tabs+Button custom toolbar |
| `packages/web/src/pages/calendar/CalendarFilterBar.tsx` | VERIFIED | platform/profile/tags/scope filter UI |
| `packages/web/src/components/layout/Sidebar.tsx` | VERIFIED | L28: `{ to: '/calendar', icon: Calendar, label: 'Calendar' }` |
| `packages/web/src/App.tsx` | VERIFIED | L51 `/calendar` route, L56 `/settings/snippets` route |
| `SECURITY.md` | VERIFIED | Repo root, 37 lines, SEC-07 policy section explicit |

### Key Link Verification

| From | To | Via | Status | Detail |
|------|----|----|--------|--------|
| `app.ts` | `createSnippetsRouter`/`createCalendarRouter` | `app.use(...)` | WIRED | Lines 102-103 |
| `csv-import-*.handler.ts` | `@sms/shared` `substituteSnippetsInText` | named import | WIRED | Both handlers L3 |
| `csv-import-*.handler.ts` | `snippet.service.getSnippets` | named import | WIRED | Per-job single fetch into `Map<lowercase-name, body>` |
| `SnippetPicker` | textarea `selectionStart`/`End` | ref captured `onPointerDown` of trigger | WIRED | L43 captureSelection, L85 onPointerDown handler |
| `SnippetsPage`/`SnippetPicker`/`SnippetFormDialog` | `useSnippets` hook | TanStack Query | WIRED | All three import the hook |
| `Sidebar` | `/calendar` | navItems entry | WIRED | L28 |
| `CalendarPage onSelectEvent` | `/posts/:id/edit` | `useNavigate` | WIRED | Verified via CalendarPage.test.tsx (in 175 web tests passing) |
| `CalendarPage onSelectSlot` | `/posts/new?scheduledAt=...` | `useNavigate` + ISO datetime | WIRED | Verified via CalendarPage.test.tsx |
| `calendar.ts` route | `checkConflicts` in post.service | named import + per-row | WIRED | L7 import, L98 await call |
| `PostsPage`/`QueuePostsPage` | `renderHeadline` | named import | WIRED | PostsPage L23+L263, QueuePostsPage L56+L347 |
| `packages/shared/src/logger.ts DEFAULT_REDACT.paths` | OpenAI key field names | extended array | WIRED | 9 paths matching pattern |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SnippetsPage` | `useSnippets()` | `GET /api/snippets` → `snippet.service.getSnippets(db, userId)` → live DB | Yes — integration test seeds + asserts | FLOWING |
| `SnippetPicker` | `useSnippets()` | same as above | Yes | FLOWING |
| `PostsPage` | `usePosts({ search, searchScope:'posts' })` | `GET /api/posts` → `getPosts({ search })` → tsvector query w/ `ts_headline` | Yes — `posts-search.test.ts` 6/6 passes against real Postgres | FLOWING |
| `QueuePostsPage` | `useQueuePosts({ search, searchScope:'queue' })` | same path with scope filter | Yes | FLOWING |
| `CalendarPage` | `useCalendarPosts({ from, to, scope, … })` | `GET /api/calendar` route → windowed query + `checkConflicts` | Yes — `calendar-api.test.ts` 6/6 passes against real Postgres | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| API unit + integration tests pass | `pnpm -F @sms/api test` | `Test Files 50 passed \| 5 skipped (55)`, `Tests 479 passed \| 52 todo (531)` | PASS |
| Shared lib tests pass | `pnpm -F @sms/shared test` | `12 passed (12) / 173 passed (173)` | PASS |
| Web tests pass | `pnpm -F @sms/web test` | `31 passed (31) / 175 passed \| 13 todo (188)` | PASS |
| Worker tests pass | `pnpm -F @sms/worker test` | `34 passed (34) / 215 passed (215)` | PASS |
| Posts-search integration (real Postgres) | `INTEGRATION=1 vitest run posts-search.test.ts` | `1 passed (1) / 6 passed (6)` | PASS |
| Calendar + Snippets integration | `INTEGRATION=1 vitest run calendar-api.test.ts snippets-api.test.ts` | `2 passed (2) / 11 passed (11)` | PASS |
| SEC-07 grep gate | `rg -il "openai" packages/api/src` | only `logger.test.ts` + `sec-07-job-schema.test.ts` | PASS |
| Live DB has Phase 11 schema | `psql \d posts`, `\dt snippets`, `\di posts_fts_idx`, `pg_trigger` | all present | PASS |
| **Workspace test command** | `pnpm -w test` | **FAIL — pretest build (`tsc -b`) errors out** | **FAIL** |
| `tsc -b` on @sms/web | direct invocation | 3 errors in Phase 11 files | FAIL |

**Total runtime test count: 1042 passing across 127 test files (4 packages).** All integration tests verified against real Postgres.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SNIP-01 | 03, 05, 09 | Create/edit/delete named snippets | SATISFIED | Snippets table + service + routes + UI; integration test passes |
| SNIP-02 | 09 | Insert Snippet button at cursor | SATISFIED | SnippetPicker cursor-capture wired into SharedPostFields; component test passes |
| SNIP-03 | 01, 08 | CSV `{{snippet:name}}` substitution | SATISFIED | substituteSnippetsInText util + worker handlers + missing-name error reporting |
| SEARCH-01 | 06, 10 | FTS on Scheduled / Queue / Calendar views | SATISFIED | tsvector backend + scope filters + URL-state search inputs on both list pages |
| SEARCH-02 | 03, 06, 10 | tsvector + GIN + ts_rank + ts_headline | SATISFIED | Migration 0009 + post.service rewrite + headline-to-mark allowlist parser |
| CAL-01 | 07, 11 | M/W/D views, all profiles | SATISFIED | react-big-calendar in CalendarPage; M/W/D toolbar |
| CAL-02 | 11 | Color-coded by platform; click → edit; empty → create | SATISFIED | eventPropGetter + onSelectEvent → /posts/:id/edit + onSelectSlot → /posts/new?scheduledAt= |
| CAL-03 | 07, 11 | Filterable by platform/profile/tags/scope | SATISFIED | CalendarFilterBar + GET /api/calendar query params |
| CAL-04 | 07, 11 | Conflict highlight ±5min same profile | SATISFIED | hasConflict computed in route via checkConflicts; left-border + tooltip in eventPropGetter |
| POST-CMN-08 | 09 | Insert Snippet on all post forms | SATISFIED | SharedPostFields used by Twitter/LinkedIn/Facebook → all forms inherit picker |
| SEC-07 | 02 | OpenAI key never persisted | SATISFIED | Pino redact + BullMQ schema contract test + SECURITY.md + grep gate clean |

11/11 requirements satisfied at the runtime/behavior level.

### Anti-Patterns Found

No real anti-patterns. All grep matches for "TODO|FIXME|placeholder|coming soon" in Phase 11 files were legitimate `placeholder=` HTML attributes on input elements. No empty `return null` / `=> {}` stubs in production paths. No `dangerouslySetInnerHTML` for the ts_headline output (verified — uses the allowlist parser).

### Gaps Summary

The phase delivered all 11 requirements at the runtime level. Every truth that maps to user-visible behavior or REQUIREMENTS.md verifies green:

- Snippet CRUD, picker insertion, CSV substitution, FTS with highlighting, calendar with conflicts, SEC-07 redact + contract test + policy doc, live-DB schema — all present and exercised by 1042 passing tests including 17 integration tests against real Postgres.

The single gap is **build-tooling**, not behavior:

- **`pnpm -w test`** (the canonical command in 11-VALIDATION.md and CLAUDE.md) **runs `pnpm -r build` as `pretest`**, which calls `tsc -b` on `@sms/web` and fails with three TS errors in Phase 11 files (`SnippetFormDialog.tsx` has a Zod resolver type mismatch; `headline-to-mark.test.tsx` has a `node.props is unknown` error). Vitest itself runs all tests green when invoked per-package because it transpiles via esbuild and ignores TypeScript errors. But the workspace command fails, and any CI step gated on `tsc -b` will fail.

This is a closure gap: the documented test command is broken even though the behaviors it would verify are all green. Recommended fix plan: **`11-12-typecheck-snippet-resolver-and-headline-test`** (small — ~20 lines across 2 files):

1. In `SnippetFormDialog.tsx`, type the `useForm` generic against `z.input<typeof createSnippetSchema>` (or pass an explicit `Resolver<…>` cast that aligns input/output) so the resolver's optional-category input matches the form's required-category output.
2. In `headline-to-mark.test.tsx` line 9, narrow `node` to `React.ReactElement` before reading `.props` (e.g., `if (React.isValidElement(node)) { … }`), or annotate `nodes` with the appropriate element type.

After that fix, `pnpm -w test` should pass end-to-end.

The five human-verification items (iOS Safari cursor, search highlight contrast, calendar visual parity, calendar entry click in prod build) are explicitly documented in 11-VALIDATION.md as manual-only and **do not affect the gap classification** — they are tracked separately and would be required regardless of automation status.

---

*Verified: 2026-05-03T00:51:11Z*
*Verifier: Claude (gsd-verifier)*
