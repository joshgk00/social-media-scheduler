# Phase 11: Snippets, Search, Calendar — Specification

**Created:** 2026-05-01
**Ambiguity score:** 0.14 (gate: ≤ 0.20)
**Requirements:** 11 locked

## Goal

Deliver three productivity subsystems — saved text snippets with insert support across all post forms and CSV uploads, PostgreSQL full-text search on Scheduled/Queue/Calendar lists with `tsvector` + GIN + `ts_headline` highlighting, and a react-big-calendar M/W/D view of scheduled and queued posts with conflict highlighting — plus the SEC-07 OpenAI-key-handling policy (docs + log redaction + tests, no AI endpoint).

The phase title in ROADMAP.md says "& Polish"; that has been dropped from scope. Phase 11 delivers exactly the 11 requirements listed below.

## Background

Current state from the codebase:

- **Snippets:** No `snippets` table exists in `packages/db/src/schema/`. Zero references to "snippet" anywhere in `packages/api` or `packages/web`. No CRUD, no insert-button on any post form. The post forms that need an Insert Snippet button: `packages/web/src/pages/posts/NewPostPage.tsx`, `EditPostPage.tsx`, and the shared `packages/web/src/components/posts/SharedPostFields.tsx`. CSV bulk upload runs through `packages/web/src/pages/posts/BulkImportPage.tsx` → backend bulk-ops route; no `{{snippet:name}}` substitution today.
- **Search:** `postQuerySchema` in `packages/shared/src/schemas/posts.ts` already accepts a `search` field, and `getPosts` in `packages/api/src/services/post.service.ts` implements it as naive `ilike(posts.text, ...)`. There is no `tsvector` column, no GIN index, and no `ts_headline` highlighting. Search is wired on the Posts list UI but not on the Queue Posts list, and there is no calendar view to attach it to yet.
- **Calendar:** No calendar library in `packages/web/package.json`. Scheduled posts are shown only in a TanStack Table at `packages/web/src/pages/posts/PostsPage.tsx`. The ±5-minute conflict check needed for CAL-04 already exists as `checkConflicts()` in `packages/api/src/services/post.service.ts` and is reusable from a calendar query.
- **SEC-07:** No AI integration exists. `.env.example` has no `OPENAI_API_KEY` and no AI feature ships in this phase. SEC-07 is policy + log-redaction guardrails only; the actual AI endpoint is Phase 12 work.

The gap: build snippets end-to-end (table + service + routes + UI + CSV substitution), upgrade search from `ilike` to `tsvector` GIN + ranked highlighting, ship a calendar with windowed queries reusing the existing conflict checker, and lay the SEC-07 policy rails so Phase 12 has nothing to debate.

## Requirements

1. **SNIP-01 — Snippet CRUD**: User can create, edit, and delete named text snippets categorized as Hashtag Set or Text Snippet.
   - Current: No `snippets` table; no service, routes, or UI exist.
   - Target: New `snippets` table with columns `{ id, userId, name, category, body, createdAt, updatedAt }` where `category` is an enum `('hashtag_set','text')`; both kinds share a single `body` text field with identical insert behavior. `name` is unique per user (case-insensitive). Authenticated REST endpoints `GET/POST/PATCH/DELETE /api/snippets` enforce ownership. A Snippets management page lists, creates, edits, and deletes snippets.
   - Acceptance: Creating a snippet, editing its body, listing all user snippets, and deleting it all succeed end-to-end through the UI; cross-user access returns 404; duplicate-name (case-insensitive) returns 409.

2. **SNIP-02 / POST-CMN-08 — Insert Snippet button**: An "Insert Snippet" button appears on all post creation/edit forms and inserts the chosen snippet's body at the cursor position in the focused post text input.
   - Current: No insert button exists on any post form.
   - Target: Insert Snippet control wired into `SharedPostFields.tsx` so it inherits to NewPost/EditPost across Twitter, LinkedIn, and Facebook. Clicking opens a typeahead picker over the current user's snippets; selecting a snippet inserts `body` at the textarea cursor (no replacement of existing text outside the cursor) and re-focuses the input.
   - Acceptance: On every post form (Twitter/LinkedIn/Facebook × New/Edit), the button is present, the picker shows the user's snippets, selecting a snippet inserts at cursor without overwriting unrelated text, and a Vitest component test asserts cursor-position insertion for at least one form.

3. **SNIP-03 — CSV `{{snippet:name}}` substitution**: CSV bulk uploads resolve `{{snippet:name}}` tokens at upload-time; rows referencing an unknown snippet name fail with a row-level error in the bulk-op error report.
   - Current: CSV bulk upload exists but performs no substitution; tokens would be inserted literally into post text.
   - Target: During CSV row processing in the API, `{{snippet:name}}` patterns in the post text column are replaced with the named snippet's `body` (case-insensitive name match, owned by the uploading user) before the post is inserted. Stored post text contains no template tokens. Rows whose token references a non-existent snippet are added to the existing bulk-op error report and skipped; other rows continue.
   - Acceptance: Uploading a CSV with three rows — one valid token, one missing-snippet token, one no token — produces 2 inserted posts with substituted text, 0 inserted posts containing `{{` or `}}`, and 1 error row in the bulk-op report identifying the missing snippet name.

4. **SEARCH-01 — Search input on three views**: A search input appears in the filter bar of the Scheduled Posts list, Queue Posts list, and Calendar view.
   - Current: PostsPage already renders a search input wired to a `search` query param. QueuePostsPage has no search input. Calendar does not exist yet.
   - Target: All three views have a search input in their filter bar; query parameter is plumbed through TanStack Query to the API; debounced (≥250ms) so typing does not flood the server.
   - Acceptance: Typing into the search input on each of the three views updates the URL/query state and refetches results within one debounced cycle; clearing the input restores unfiltered results.

5. **SEARCH-02 — `tsvector` + GIN + ranked highlighting**: Search uses a `tsvector` column on `posts` indexed by GIN, ranks results with `ts_rank`, and returns matching terms wrapped in `ts_headline` markup.
   - Current: Naive `ilike(posts.text, ...)` only; no `tsvector` column, no GIN index, no highlighting, no rank ordering.
   - Target: New migration adds a stored generated `tsvector` column on `posts` derived from `text`, `notes`, and a denormalized concatenation of associated tag names (refreshed via trigger or recomputed on tag-change), plus a GIN index on that column. Results are ordered by `ts_rank` desc and the API returns a `headline` field with `ts_headline` markup for each row. Search is **scope-by-view**: Scheduled list searches `status IN ('draft','scheduled','failed')`, Queue Posts list searches `status='queued'` for the active queue, Calendar searches anything with a non-null `scheduledAt`. Published and destroyed posts are not included by Phase 11 search.
   - Acceptance: A query against a seeded dataset (≥50 posts across statuses) returns rows ordered by `ts_rank`, each row has a `headline` field containing `<b>…</b>` markup around matching tokens, the GIN index is hit (verified by `EXPLAIN`), and a search on the Scheduled list does not return queued or published posts.

6. **CAL-01 — M/W/D calendar views**: Monthly, weekly, and daily calendar views render scheduled posts and queued posts using react-big-calendar.
   - Current: No calendar library, no calendar route. Scheduled and queued posts are visible only in tables.
   - Target: `react-big-calendar` added to `@sms/web` deps; new route (e.g. `/calendar`) renders the three views with a view-switcher control. Backend exposes a windowed query (e.g. `GET /api/calendar?from&to&...`) that returns scheduled posts (`scheduledAt` in window, status one of `scheduled|publishing|queued`) plus queued posts that have a materialized publish slot in the window. Queue cron projections (ghost slots without a real post) are NOT shown.
   - Acceptance: Navigating to `/calendar` shows the current month with all in-window posts as entries; switching to week/day re-queries with the new window; entries outside the window are not loaded.

7. **CAL-02 — Color coding + click behavior**: Entries are color-coded by platform; clicking an entry opens edit, clicking an empty time slot opens new-post creation pre-filled with that datetime.
   - Current: No calendar exists.
   - Target: Each calendar entry styled by `platform` (Twitter/LinkedIn/Facebook) using the existing platform color tokens. Click on entry → navigate to `/posts/:id/edit`. Click on empty slot → navigate to new-post page with `scheduledAt` pre-filled to the clicked datetime in the user's IANA timezone.
   - Acceptance: Entries for three platforms render in three distinct colors; clicking a Twitter entry lands on the Twitter edit page for that post id; clicking an empty cell at 2026-06-01 14:30 lands on `/posts/new?scheduledAt=2026-06-01T14:30:00…`.

8. **CAL-03 — Calendar filters**: Calendar is filterable by platform, profile, and tags; user can toggle between queue-scheduled and one-time scheduled posts.
   - Current: No calendar; existing filter UI lives only on PostsPage.
   - Target: Filter bar above the calendar with multi-select for platform, profile, tags; toggle for "scheduled / queued / both". All filters propagate to the windowed calendar API query.
   - Acceptance: Toggling each filter narrows the visible entries; "queued only" hides every entry whose backing post has `status != 'queued'`.

9. **CAL-04 — Conflict highlight**: Entries on the same profile within ±5 minutes of each other carry a visual conflict indicator.
   - Current: Conflict check exists at the API (`checkConflicts` in `post.service.ts`) and is shown only on the post-creation form via `ScheduleConflictBanner`.
   - Target: Calendar window query annotates each returned entry with a boolean `hasConflict` computed against the same ±5-minute, same-profile rule. Calendar renders entries with `hasConflict=true` using a distinct visual indicator (e.g., red left-border and a tooltip listing the conflicting entry's text preview).
   - Acceptance: Two posts on the same profile scheduled 2 minutes apart both render with the conflict indicator; two posts on different profiles 2 minutes apart do not; one post in isolation does not.

10. **POST-CMN-08**: Covered by SNIP-02 above. The "Insert Snippet" button on all post forms is the same deliverable; this requirement is satisfied when SNIP-02 ships.
    - Current: No button exists.
    - Target: Same as SNIP-02.
    - Acceptance: Same as SNIP-02 plus an explicit traceability check that POST-CMN-08 is marked complete in `REQUIREMENTS.md` when SNIP-02's acceptance is met.

11. **SEC-07 — OpenAI key handling policy + redaction guardrails**: Document the policy and ship the log-redaction + payload-scrub tests now, even though no AI endpoint exists in this phase.
    - Current: No AI code, no OpenAI key in `.env.example`, no log redaction rules referencing AI key fields.
    - Target: (a) Policy section added to `SECURITY.md` (or equivalent project security doc) stating: OpenAI API key is provided per-request only, never persisted, never written to job payloads, Redis, or logs. (b) `pino` logger configured with `redact` paths covering `openai_api_key`, `openaiApiKey`, `Authorization`, and any nested copy of those keys in request bodies. (c) Regression tests asserting (i) the redaction rule masks the key when it appears in a logged object, (ii) BullMQ job-data Zod schemas reject any field name matching an OpenAI-key pattern. No AI route, no AI UI, no AI service shipped in Phase 11.
    - Acceptance: SECURITY.md update merged; `pino` redact config in source; both tests pass; `grep -r "openai" packages/api/src` finds only the redaction config and tests, no production AI code.

## Boundaries

**In scope:**
- New `snippets` table, service, routes, and management page (CRUD).
- "Insert Snippet" picker control wired into `SharedPostFields.tsx` for all post forms.
- CSV `{{snippet:name}}` substitution at upload-time with row-level error reporting.
- `tsvector` generated column + GIN index migration on `posts`.
- Search backend rewrite from `ilike` to `tsvector @@ to_tsquery` with `ts_rank` ordering and `ts_headline` highlighting; scope-by-view (Scheduled / Queue / Calendar each search their own corpus).
- `QueuePostsPage` filter bar gains a search input matching the existing PostsPage pattern.
- `react-big-calendar` dependency added; new `/calendar` route with M/W/D views.
- Windowed calendar API endpoint that returns posts inside a from/to range with `hasConflict` annotation per entry.
- Calendar filters (platform, profile, tags, scheduled/queued toggle) and click-to-edit / empty-slot-click-to-create navigation.
- SEC-07 policy doc, `pino` redact config for OpenAI key field names, and regression tests covering log redaction + job-payload schema rejection.

**Out of scope:**
- Visual "polish" sweeps (dark-mode pass, animation polish, empty-state redesigns) — explicitly dropped from the phase title; per-feature visuals only.
- Any AI feature, AI endpoint, AI service, AI UI, or `OPENAI_API_KEY` env wiring — that is Phase 12 (AI Post Generation).
- Drag-to-reschedule on calendar entries — read-only + click-to-edit only; drag deferred.
- Queue cron projection ghost slots on the calendar — only materialized queued posts are shown.
- Searching published or destroyed posts — Phase 11 search excludes those statuses; archive search is a separate future work item.
- Tag CRUD changes — only the tag-name denormalization needed for the `tsvector` is in scope; no new tag UI.
- Snippet sharing across users, snippet folders, snippet versioning — single-user, flat list only.
- Snippet substitution in the in-app composer — substitution applies only to the CSV upload path (SNIP-03); the composer uses Insert Snippet (SNIP-02) which inserts `body` directly.

## Constraints

- **Calendar library:** Must use `react-big-calendar` (decided in interview; alternatives rejected: FullCalendar bundle/license, custom build cost).
- **Search index:** Must be `tsvector` + GIN; LIKE/ILIKE search is removed for the in-scope views once the migration ships.
- **Snippet name uniqueness:** Per-user, case-insensitive — DB constraint, not just app-layer.
- **CSV substitution timing:** Must occur at upload-time; stored post text contains no `{{snippet:…}}` tokens. Defer-to-publish was rejected.
- **Calendar windowing:** API must accept `from`/`to` and return only posts in window; full-table loads are not acceptable.
- **SEC-07:** No AI feature code in this phase. Policy + redaction + tests only — confirmed during interview.
- **Logger:** All log redaction uses the existing `pino` setup (`packages/shared/src/logger/`); no new logging library.
- **Conflict reuse:** Calendar must reuse `checkConflicts` from `post.service.ts`; no duplicate ±5-minute logic.

## Acceptance Criteria

- [ ] `snippets` table exists with `(id, userId, name, category, body, timestamps)`; case-insensitive unique name per user enforced at DB level.
- [ ] `GET/POST/PATCH/DELETE /api/snippets` work end-to-end with ownership enforcement.
- [ ] Snippets management page in the web app supports list, create, edit, delete.
- [ ] Insert Snippet control appears on every post form (Twitter/LinkedIn/Facebook × New/Edit) and inserts at cursor without overwriting unrelated text.
- [ ] CSV upload with `{{snippet:name}}` tokens substitutes valid tokens, fails rows with unknown names into the existing bulk-op error report, and never writes a post containing `{{` or `}}`.
- [ ] `posts` has a `tsvector` column over `text + notes + tag-name concatenation` with a GIN index; `EXPLAIN` confirms the index is used.
- [ ] Search results on the Scheduled list, Queue Posts list, and Calendar are ranked by `ts_rank` and include `ts_headline` markup.
- [ ] Search is scope-by-view: Scheduled list does not return queued or published posts; Queue Posts list returns only `status='queued'` for the active queue; Calendar returns only posts with a non-null `scheduledAt`.
- [ ] `/calendar` route renders M/W/D views via `react-big-calendar` with view switcher.
- [ ] Calendar entries are color-coded by platform; clicking an entry navigates to its edit page; clicking an empty slot navigates to new-post pre-filled with that datetime in the user's timezone.
- [ ] Calendar filter bar narrows by platform, profile, tags, and a scheduled/queued toggle.
- [ ] Calendar window query annotates entries with `hasConflict`; conflicting entries render with a visible indicator and same-profile ±5-minute logic reuses `checkConflicts`.
- [ ] `SECURITY.md` (or equivalent) contains the SEC-07 policy section.
- [ ] `pino` redact config covers `openai_api_key`, `openaiApiKey`, and `Authorization` field names; redaction unit test passes.
- [ ] BullMQ job-data Zod schemas reject any field whose name matches an OpenAI-key pattern; schema test passes.
- [ ] No AI endpoint, AI route, AI service, or `OPENAI_API_KEY` env wiring is added to the codebase in Phase 11.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                       |
|--------------------|-------|------|--------|-------------------------------------------------------------|
| Goal Clarity       | 0.88  | 0.75 | ✓      | "& Polish" dropped; 11 explicit requirements.               |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | Explicit out-of-scope list incl. AI deferral, no drag, etc. |
| Constraint Clarity | 0.85  | 0.65 | ✓      | Library + index strategy + windowing locked.                |
| Acceptance Criteria| 0.82  | 0.70 | ✓      | 16 pass/fail checkboxes.                                    |
| **Ambiguity**      | 0.14  | ≤0.20| ✓      | Gate passed.                                                |

## Interview Log

| Round | Perspective       | Question summary                                              | Decision locked                                                              |
|-------|-------------------|---------------------------------------------------------------|------------------------------------------------------------------------------|
| 1     | Researcher        | What does "& Polish" mean in this phase?                      | Dropped — phase delivers exactly the 11 listed requirements.                 |
| 1     | Researcher        | What form does SEC-07 take with no AI code?                   | Policy doc + `pino` redact + regression tests; no AI endpoint.               |
| 1     | Researcher        | Calendar library choice?                                      | `react-big-calendar`. FullCalendar (bundle/license), custom (cost) rejected. |
| 2     | Simplifier        | Hashtag-set vs text snippet — distinct behavior?              | Single shared body, category is just a label.                                |
| 2     | Simplifier        | `{{snippet:name}}` resolution timing + missing-name behavior? | Resolve at upload-time; missing name fails the row.                          |
| 2     | Simplifier        | Search corpus per view?                                       | Scope-by-view; published/destroyed excluded from Phase 11 search.            |
| 3     | Boundary Keeper   | Calendar "queue runs" — what gets shown?                      | Only materialized queued posts; cron ghost slots out of scope.               |
| 3     | Boundary Keeper   | Drag-to-reschedule on calendar?                               | Read-only + click-to-edit; drag deferred.                                    |
| 3     | Boundary Keeper   | Calendar data window?                                         | Backend windows by `from`/`to`; refetch on view navigation.                  |

---

*Phase: 11-snippets-search-calendar-polish*
*Spec created: 2026-05-01*
*Next step: /gsd-discuss-phase 11 — implementation decisions (snippet picker UX, tsvector trigger vs generated column, calendar route structure, redact rule placement)*
