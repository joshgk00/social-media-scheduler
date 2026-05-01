# Phase 11: Snippets, Search, Calendar - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Three productivity subsystems plus the SEC-07 policy guardrails:

1. **Snippets** — `snippets` table (id, userId, name, category, body, timestamps), CRUD service + REST routes, management page, "Insert Snippet" picker on every post form, CSV `{{snippet:name}}` substitution at upload-time.
2. **Full-text search** — `tsvector` + GIN on `posts`, `ts_rank` ordering, `ts_headline` highlighting; scope-by-view (Scheduled, Queue Posts, Calendar each search their own corpus).
3. **Calendar** — `react-big-calendar` M/W/D views with windowed query, color-coding by platform, click-to-edit / empty-slot-click-to-create, filters (platform/profile/tags/scheduled-vs-queued), conflict highlight reusing `checkConflicts()`.
4. **SEC-07** — policy doc + extended pino redact paths + Vitest contract test on BullMQ job schemas. **No AI endpoint, no `OPENAI_API_KEY` env wiring** — that is Phase 12.

Boundaries, requirements, and acceptance criteria are locked by SPEC.md. This document captures HOW to implement what's there.

</domain>

<spec_lock>
## Locked by SPEC.md

`.planning/phases/11-snippets-search-calendar-polish/11-SPEC.md` — 11 requirements, ambiguity 0.14. Researcher and planner MUST read SPEC.md before doing anything else; the requirements, boundaries, constraints, and acceptance criteria are not up for re-discussion.

Key locked decisions from SPEC.md (do not re-litigate):
- Snippet `category` is a label only (`'hashtag_set' | 'text'`), single shared body field
- CSV `{{snippet:name}}` resolves at upload-time; missing-name fails the row into the bulk-op error report
- Search corpus is scoped by view; published and destroyed posts excluded from Phase 11 search
- Calendar shows materialized queued posts only — no cron projection ghost slots
- Calendar entries are read-only + click-to-edit; no drag-to-reschedule
- Calendar query is windowed by `from`/`to`; no full-table loads
- SEC-07 ships policy + pino redact + tests; no AI route, no AI service, no AI UI

</spec_lock>

<decisions>
## Implementation Decisions

### Snippet picker UX (SNIP-02 / POST-CMN-08)

- **D-01:** "Insert Snippet" is a button rendered next to the post text input (within `SharedPostFields.tsx`) that opens a Radix Popover containing a search-as-you-type combobox over the user's snippets.
- **D-02:** Selecting a snippet inserts `body` at the textarea cursor (`selectionStart`/`selectionEnd`) and re-focuses the textarea, restoring caret to the position immediately after the inserted text. No replacement of text outside the cursor selection.
- **D-03:** No slash-command trigger inside the textarea — explicit-button only. (Slash-command rejected: caret-position math, conflict with literal `/` in post bodies, mobile virtual-keyboard friction.)
- **D-04:** Picker is keyboard-accessible: arrow keys navigate, Enter inserts, Escape closes. Search filters by snippet `name` (case-insensitive substring); no fuzzy match in Phase 11.
- **D-05:** A Vitest component test asserts cursor-position insertion for at least one form (the SharedPostFields-mounted variant satisfies all platforms).

### tsvector + tag-name strategy (SEARCH-02)

- **D-06:** Two columns on `posts`:
  - `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', text || ' ' || COALESCE(notes,''))) STORED` — STORED generated column. Postgres maintains it automatically on every INSERT/UPDATE of `text` or `notes`. No application logic involved.
  - `tag_search_vector tsvector` — plain column maintained by AFTER INSERT/DELETE triggers on the `postTags` join table that recompute as `to_tsvector('english', string_agg(tag_name, ' '))` for the affected `post_id`.
- **D-07:** Single combined GIN index: `CREATE INDEX posts_fts_idx ON posts USING gin (search_vector || tag_search_vector)`. Search queries use `(search_vector || tag_search_vector) @@ plainto_tsquery(...)` so the index is hit.
- **D-08:** Migration is forward-only; on initial deploy the trigger backfill recomputes `tag_search_vector` for every existing post in one pass (`UPDATE posts SET tag_search_vector = ...`).
- **D-09:** Application-level recompute (option C) is rejected — every code path touching `posts` or `postTags` would have to remember to refresh, and out-of-band SQL bypasses the cache. DB-managed maintenance is the safer default.

### Calendar IA + nav placement (CAL-01..04)

- **D-10:** New top-level sidebar entry `{ to: '/calendar', icon: Calendar, label: 'Calendar' }` inserted between `Queues` and `New Post` in the `navItems` array of `packages/web/src/components/layout/Sidebar.tsx`. Calendar icon comes from `lucide-react` (already a dependency).
- **D-11:** Posts list view (`/posts`) remains the default for the posts section. Calendar is a separate destination; tabs/segments under `/posts` are explicitly rejected (would require Posts-page refactor and duplicate filter UIs).
- **D-12:** Custom toolbar built with shadcn/ui `Button` + `Tabs` for the M/W/D switcher and prev/next/today controls, replacing react-big-calendar's default toolbar via the `components.toolbar` prop. Reason: visual consistency with the rest of the app; default toolbar styling clashes with the Tailwind/shadcn design system.
- **D-13:** Conflict indicator is rendered at entry-level (per react-big-calendar event), not as a banner. Conflicting entries get a distinct left-border color + tooltip listing the conflicting entry's text preview. Backend windowed query annotates each entry with `hasConflict: boolean` so the frontend doesn't recompute.

### SEC-07 redact placement + enforcement

- **D-14:** Extend the existing pino `redact.paths` config (lives inline in the API logger setup; see `packages/api/src/__tests__/logger.test.ts` lines 17–26 for current pattern) with these additional paths covering common naming variants:
  - `req.body.openai_api_key`
  - `req.body.openaiApiKey`
  - `req.body.OPENAI_API_KEY`
  - `*.openai_api_key`, `*.openaiApiKey`, `*.OPENAI_API_KEY` (wildcard for nested objects)
  - Existing `Authorization` rule continues to cover the request header
- **D-15:** Vitest contract test at `packages/api/src/__tests__/sec-07-job-schema.test.ts` (or similar) imports every BullMQ job-data Zod schema — at minimum: `publish`, `media-transcode`, `token-refresh`, `auto-destruct`, `notifications` — and asserts that none of them define a field whose name matches `/openai|api[_-]?key/i`. Fails CI if Phase 12 accidentally adds an AI key to a job payload.
- **D-16:** Wildcard-only redact + runtime job scrubber middleware (option B) is rejected — too easy to mask legitimate fields and harder to reason about than explicit paths + a static test.
- **D-17:** Policy section added to `SECURITY.md` (or `docs/SECURITY.md`; planner picks based on existing project convention) stating: OpenAI API key is provided per-request only, never persisted, never written to job payloads, Redis, or logs.
- **D-18:** SEC-07 deliverables ship in this phase even though no AI endpoint exists. Requirement closure criteria: (a) policy doc merged, (b) redact paths in source, (c) contract test passing, (d) `grep -r "openai" packages/api/src` finds only the redact config + test, no production AI code.

### Claude's Discretion

- **Search input debounce:** 250ms is the planning default unless the planner discovers prior art in this codebase prescribing otherwise.
- **Search URL state:** `setSearchParams(...)` with `replace: true` so typing doesn't push every keystroke into history; back-button returns to the page before the search.
- **`ts_headline` rendering:** sanitize the returned HTML (containing `<b>…</b>` markup) via a small allowlist parser that maps `<b>` → React `<mark>` elements rather than `dangerouslySetInnerHTML`. Avoids XSS surface entirely.
- **Calendar window buffer:** month view loads `[firstDayOfMonth − 7d, lastDayOfMonth + 7d]` to cover week-boundary cells; week and day views load exactly the visible range. Planner can adjust if perf testing argues otherwise.
- **Snippet management page route:** `/snippets` (top-level) vs `/settings/snippets` — planner picks based on whether Settings already nests sub-pages; either is acceptable since a sidebar entry is not required (CRUD is reachable via the picker's "Manage snippets" link).
- **Trigger language for `tag_search_vector`:** plpgsql vs sql — planner's call.

</decisions>

<specifics>
## Specific Ideas

- "Insert Snippet" picker should feel like the existing Radix-based dialogs in `packages/web/src/components/profiles/` (e.g., `ConnectProfileDialog.tsx`) — visual parity.
- Calendar custom toolbar should use the same `Tabs` styling as the existing tabbed UIs already in the app.
- The conflict-highlight tooltip on the calendar should reuse the message format from the existing `ScheduleConflictBanner.tsx` so users see consistent wording.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 11 spec (locked)
- `.planning/phases/11-snippets-search-calendar-polish/11-SPEC.md` — 11 locked requirements, boundaries, constraints, acceptance criteria. **Read first.**

### Project requirements
- `.planning/REQUIREMENTS.md` §SEC (line 41 — SEC-07), §POST-CMN (line 98 — POST-CMN-08), §SNIP (lines 198–200), §SEARCH (lines 204–205), §CAL (lines 209–212)
- `.planning/ROADMAP.md` lines 396–414 (Phase 11 entry)
- `.planning/PROJECT.md` — project-level constraints, tech-stack pins
- `.planning/STATE.md` — current decisions accumulator (Phase 8 / 9 / 10 entries inform existing patterns)

### Tech stack (from CLAUDE.md)
- `CLAUDE.md` §"Recommended Stack" — confirms `pg` driver flavor (`postgres` not `pg`), Drizzle ORM versions, Zod versions
- `packages/web/CLAUDE.md` — web package standards (semantic HTML, accessibility, naming, TanStack Query/Zustand/RHF roles)
- `packages/api/CLAUDE.md` — API package standards (middleware order, pino redact pattern, naming, security)

### Existing code referenced by these decisions
- `packages/web/src/components/layout/Sidebar.tsx` — `navItems` array; D-10 inserts here
- `packages/web/src/components/posts/SharedPostFields.tsx` — D-01 mounts the Insert Snippet button here
- `packages/api/src/services/post.service.ts` — `checkConflicts()` reused by D-13
- `packages/web/src/components/posts/ScheduleConflictBanner.tsx` — message format reused by calendar tooltip
- `packages/api/src/__tests__/logger.test.ts` — current pino redact pattern; D-14 extends this
- `packages/db/src/schema/posts.ts` — schema migration target for D-06/D-07
- `packages/shared/src/schemas/posts.ts` — `postQuerySchema` extended for tsvector search

### External library docs (researcher should consult)
- `react-big-calendar` README + `components.toolbar` API — for D-12 custom toolbar
- Postgres `tsvector` + GIN docs — index strategy for D-07
- Postgres `ts_headline` HTML escaping behavior — informs Claude's-discretion XSS strategy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`checkConflicts()` in `packages/api/src/services/post.service.ts`** — ±5min, same-profile conflict logic. CAL-04 calls this in a batch over the windowed range; no duplicate logic.
- **`ScheduleConflictBanner.tsx`** — wording/format for conflict messages; calendar tooltip reuses it.
- **`postQuerySchema` in `packages/shared/src/schemas/posts.ts`** — already has a `search` field; SEARCH-01/02 extend the backend handler instead of rewriting the schema.
- **Existing pino + pino-http redact config** — D-14 extends `redact.paths`; setup pattern is in `packages/api/src/__tests__/logger.test.ts`.
- **Sidebar `navItems` array** — D-10 inserts a new entry; pattern is well-established.
- **Radix UI primitives** in `packages/web/src/components/ui/` — Popover and Combobox primitives for the snippet picker.
- **shadcn/ui `Tabs` and `Button`** — for the calendar custom toolbar (D-12).
- **`@tanstack/react-table`** — used on `PostsPage.tsx` and `QueuePostsPage.tsx`; the search input pattern is reusable for the new Queue Posts search.
- **Drizzle migrations directory** `packages/db/drizzle/` — latest is `0008_phase-10-bulk-operations.sql`; Phase 11 adds `0009_phase-11-...` migrations for snippets table + tsvector columns/triggers.

### Established Patterns
- **Filter URL state** in `PostsPage.tsx` uses `setSearchParams(...)` — search inputs follow the same pattern (planner default: `replace: true`).
- **Zod schemas in `packages/shared/src/schemas/`** — request/response validation. Snippet schemas live here.
- **Service-layer functions in `packages/api/src/services/`** — pattern: `getX`, `createX`, `updateX`, `deleteX`. Snippet service follows this.
- **Bulk-op error report** (Phase 10) — D-03 (CSV substitution failures) plugs into the existing error-row reporting; no new error infrastructure.
- **TanStack Query hooks in `packages/web/src/hooks/`** — `usePosts`, `useCheckConflicts`, etc. New: `useSnippets`, `useCalendarPosts`.
- **`pino` redact paths** — already-merged `req.headers.authorization`, `req.headers.cookie` rules; D-14 adds OpenAI key field names.

### Integration Points
- **Snippets management UI** mounts behind a "Manage snippets" link inside the picker popover — keeps top-of-app surface area minimal while remaining discoverable.
- **Calendar windowed API** — new endpoint (planner's call: `GET /api/calendar` or extend `GET /api/posts` with `from/to/view`). `hasConflict` is computed server-side per entry.
- **Search highlighting** — `ts_headline` returns HTML; the API returns the headline string; web sanitizes via allowlist parser (D-Discretion) before render.
- **CSV substitution** — runs in the bulk-import processing path inside the API; resolves token names to bodies pre-INSERT. Stored post text contains literals only.
- **BullMQ job schemas** — D-15 contract test imports each schema module. Planner identifies the schema files (likely under `packages/worker/src/jobs/` or `packages/shared/src/schemas/jobs/`).

</code_context>

<deferred>
## Deferred Ideas

- Drag-to-reschedule on calendar entries — explicitly out of scope for Phase 11 (locked by SPEC.md). Future phase if user demand surfaces.
- Cron-projection ghost slots on the calendar (showing future queue firings without materialized posts) — explicitly out of scope.
- Searching published or destroyed posts (archive search) — out of scope for Phase 11 search; would be its own phase.
- Snippet sharing across users, snippet folders, snippet versioning — single-user flat list only in Phase 11.
- Slash-command snippet trigger (`/`-typeahead in textarea) — rejected during discussion. If desired later, build on top of D-01's button picker.
- Visual "polish" sweep (dark-mode pass, animation polish, empty-state redesign) — "& Polish" was dropped from the phase title in SPEC.md.
- Any AI feature, AI endpoint, AI UI, or `OPENAI_API_KEY` env wiring — Phase 12 (AI Post Generation) territory.

</deferred>

---

*Phase: 11-snippets-search-calendar-polish*
*Context gathered: 2026-05-01*
*Next step: /gsd-plan-phase 11 — research + plan generation grounded in SPEC.md + this CONTEXT.md*
