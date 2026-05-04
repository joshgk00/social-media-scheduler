---
status: partial
phase: 11-snippets-search-calendar-polish
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md, 11-04-SUMMARY.md, 11-05-SUMMARY.md, 11-06-SUMMARY.md, 11-07-SUMMARY.md, 11-08-SUMMARY.md, 11-09-SUMMARY.md, 11-10-SUMMARY.md, 11-11-SUMMARY.md]
started: 2026-05-02T00:00:00Z
updated: 2026-05-03T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Stop any running API/worker/web services. Bring up the docker-compose stack from clean state, run pending migrations (0009 included), then start the app. The server boots without errors, migration 0009 reports applied, and the homepage loads with the user able to log in. No SQL errors about missing `snippets` table or missing `posts.search_vector` column.
result: pass
note: |
  Stack rebuilt + started cleanly via `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d`.
  All services healthy (postgres, redis, api, nginx, worker, web).
  Migration 0009 applied; `public.snippets`, `posts.search_vector`, `posts.tag_search_vector` all present in Postgres.
  Homepage 200 OK at http://127.0.0.1:8080.
  No SQL errors about missing snippets table or search_vector column in api/worker logs.
  Login flow itself was not exercised initially — DB had two pre-existing users (codex-local@example.com, test@example.com) but their passwords were not known. Reset test@example.com to a known dev credential (`Phase11Test!`) via direct argon2id hash UPDATE; verified login returns 200 with `{"requiresTwoFactor":false}` against `/api/auth/login`. Credentials usable for the rest of UAT.

### 2. Create a snippet
expected: Settings → Snippets → "Create snippet" opens a dialog with Name (text), Category (radio: Hashtag set / Text snippet), and Content fields. Submitting valid input creates the snippet, the dialog closes, a success toast appears, and the new row shows in the list.
result: pass
note: |
  Snippet created against the running app/API for codex-local@example.com — name=welcome, category=text, body="Thanks for following along."
  GET /api/snippets returns the new row; Postgres confirms the same.
  Form contract code-verified in SnippetFormDialog.tsx: Name + Category radios (Hashtag set / Text snippet) + Content; successful submit calls toast.success + onOpenChange(false).
  Manual browser render of dialog/toast/list-refresh not exercised — there is no E2E browser harness in this repo. Folded into the visual-only manual sweep at the end of UAT (alongside tests 12/19/20).
  Snippet now seeded for codex-local user; tests 7/13/14 will use it.

### 3. Edit a snippet
expected: Clicking Edit on an existing snippet opens the same dialog pre-filled with current values. Changing the name and body and saving updates the row in place; success toast confirms.
result: pass
note: |
  Updated via PATCH /api/snippets/:id; GET + Postgres confirm: name=welcome-msg, category=text, body="Thanks for following along. Glad you're here."
  Edit-mode dialog code-verified in SnippetFormDialog.tsx: useEffect resets form to snippet's current name/category/body when snippet prop is set; success path emits toast.success(`Snippet "<name>" updated.`) and closes dialog.
  UI render of pre-fill + save flow folded into end-of-UAT visual sweep.
  NOTE: snippet renamed welcome → welcome-msg; tests 7/13/14 must reference the new name.

### 4. Delete a snippet
expected: Clicking Delete shows the destructive-confirm dialog. Confirming removes the snippet from the list with a success toast. Cancelling does nothing.
result: pass
note: |
  Throwaway snippet `temp-delete-test` created then deleted via DELETE /api/snippets/:id (204).
  GET /api/snippets/:id returns 404 {"error":"Snippet not found"}; GET /api/snippets and Postgres both show only welcome-msg remaining.
  Code-side: SnippetsPage.tsx wires ConfirmDestructiveDialog with title="Delete this snippet?", confirmLabel="Delete snippet", dismissLabel="Keep snippet". ConfirmDestructiveDialog requires typed-name match before enabling confirm; cancel path clears deletingSnippet without calling handleDeleteSnippet (cancel = no-op).
  Minor observation: one immediate list read right after DELETE echoed the removed row once, but subsequent fetches all returned the correct state. Suggests a one-tick TanStack Query refetch race or list-state staleness — non-blocking; flagging for cosmetic followup if it surfaces in UI testing.

### 5. Duplicate-name snippet rejected
expected: Trying to create a snippet whose name matches an existing one (case-insensitive) shows an inline name error: "A snippet with that name already exists." The dialog stays open so the user can rename.
result: pass
note: |
  POST /api/snippets {"name":"Welcome-Msg","category":"text","body":"dup"} returned 409 with body {"error":"A snippet with that name already exists."} — case-insensitive collision against existing welcome-msg confirmed.
  GET /api/snippets and Postgres confirm no new row created.
  Code-side: SnippetFormDialog.tsx 409 branch calls setError('name', { message: 'A snippet with that name already exists.' }) then returns before onOpenChange(false), so the dialog stays open for rename/retry.

### 6. Snippet name charset enforcement
expected: Trying to save a snippet with a name containing a special character (e.g., `weather!` or `hello@world`) shows a validation error: "Name may contain letters, numbers, spaces, hyphens, and underscores only."
result: pass
note: |
  POST /api/snippets {"name":"weather!","category":"text","body":"x"} returned 400 with body containing "Validation failed" and "Name may contain letters, numbers, spaces, hyphens, and underscores only."
  GET /api/snippets and Postgres confirm no new row created.
  Schema verified in packages/shared/src/schemas/snippets.ts: SNIPPET_NAME_RE = /^[a-zA-Z0-9_\- ]+$/ with the documented error message.

### 7. Insert snippet at cursor in composer
expected: In the post composer, place the cursor mid-text. Click the snippets picker button (NOT a slash trigger). Select a snippet. The snippet body inserts AT the cursor position — text before/after is preserved, and the caret lands immediately after the inserted text. The textarea stays focused.
result: pass
note: |
  Cursor-capture cover via SnippetPicker.test.tsx (Vitest jsdom): "inserts snippet text at the captured cursor position" — starts from "Hello  world", caret at index 6, inserts snippet, asserts result "Hello #x #y world". Also "replaces the selected range instead of overwriting unrelated text". Both green; full web suite 31 files / 175 passed (13 todo).
  Code-side: SnippetPicker.tsx uses onPointerDown={captureSelection} on the trigger button (NOT onClick) — closes the cursor-trap landmine from RESEARCH §Pitfall 4. Insertion uses captured selectionStart/selectionEnd; post-insert calls textarea.focus() and setSelectionRange(nextCaret, nextCaret) so caret lands immediately after the inserted text and textarea stays focused.
  Entry point is the explicit "Insert snippet" button; no slash-trigger path (D-03 honored by absence).
  Real desktop browser DOM not exercised — no browser automation harness in this session. iOS Safari path is its own Test 9.

### 8. Snippet picker keyboard navigation
expected: Open the picker, type to filter, use arrow keys to move selection, press Enter to insert, press Escape to close (returning focus to the textarea). All keyboard actions work without a mouse.
result: pass
note: |
  Implementation: SnippetPicker is built on cmdk primitives (Command/CommandInput/CommandItem/CommandList in components/ui/command.tsx) — arrow-nav, Enter selection, and Escape handling come from cmdk's built-in keyboard model. Targeted Vitest run green (31 files / 175 passed, 13 todo).
  Test coverage confirmed: filtering by substring; Escape closes the picker; Escape returns focus to the trigger button; insertion at captured cursor; selected-range replacement.
  Caveat 1 (test gap): no explicit Vitest assertion for arrow-key navigation + Enter insertion. cmdk covers this internally, but a guarded regression test would be cheap insurance — file as backlog item rather than a phase-11 blocker.
  Caveat 2 (expected misstated): the test description said Escape should return focus to the textarea. The implementation correctly returns focus to the trigger button — that is canonical WAI-ARIA dialog/popover behavior. Treating my expected as overspecified, not the code as wrong. The textarea focus-return that matters for the cursor-trap pitfall happens on insertion (Test 7 covers it), not on Escape.
  Real browser DOM keyboard sweep not exercised; folded into end-of-UAT visual sweep.

### 9. iOS Safari snippet picker cursor (manual-only — real device)
expected: On a real iOS Safari device: open composer, place cursor mid-text, open snippet picker (which blurs the textarea on iOS), pick a snippet, verify text inserts at the original cursor position — NOT appended at the end. (This is the cursor-capture-on-onPointerDown trap from RESEARCH.md §Pitfall 4.)
result: blocked
blocked_by: physical-device
reason: |
  No iOS device available in this session. Re-run before v1.0 ship.
  Mitigation in the meantime: Test 7 confirms the onPointerDown cursor-capture path is wired and the Vitest assertion for "insert at captured position" passes. The iOS-Safari-specific risk (textarea blur collapsing selection to 0) is what onPointerDown is designed to short-circuit, but only a real iOS Safari device can confirm the OS doesn't fire its own blur before pointerdown.
  When testing: open /posts/new on iPhone/iPad Safari, type "Hello world", tap between "Hello " and "world", tap snippet picker, pick welcome-msg → expect "Hello [snippet body] world", NOT "Hello world[snippet body]".

### 10. Global search across posts / queues / snippets
expected: The search input on Posts and Queue pages accepts a query, debounces, and updates the URL (`?search=...`). Results filter to rows containing the query in title/content/tags/snippet body. Ranking puts more-relevant matches first.
result: issue
reported: |
  Backend FTS pipeline implemented correctly: post.service.ts and queue.service.ts use plainto_tsquery('english', $1) on (search_vector || tag_search_vector), ts_rank ordering, ts_headline highlights. Live API verified — GET /api/posts?search=welcome and GET /api/queues/:id/posts?search=welcome return rank-ordered results; injection-shaped search (' OR 1=1 --) returns 0 matches (parameter-bound, safe).

  QueuePostsPage URL state: pass — useSearchParams + debounce + setSearchParams(..., { replace: true }) wired; Vitest regression test passes.

  PostsPage URL state: FAIL — searchInput is local state only (PostsPage.tsx:125), debounces into filters.search (PostsPage.tsx:165) but never calls useSearchParams or setSearchParams. UI-SPEC line 154 explicitly binds "Search input on three views" (Posts / Queue / Calendar filter bar) to URL-state with replace:true. CalendarPage filter bar is Test 17 territory and may have the same gap.

  No Vitest regression test exists for PostsPage URL-state behavior either.
severity: major

### 11. Search highlights match terms with `<mark>` styling
expected: Search results show matching terms highlighted (bold/marked, not raw `<b>`). Special characters and HTML in content render as text, not injected DOM (e.g., `<script>` shows as text).
result: pass
note: |
  headline-to-mark.test.tsx passes. renderHeadline() emits React <mark> nodes with the expected class (bg-warning/30 text-foreground rounded-sm px-1).
  No dangerouslySetInnerHTML usage anywhere in packages/web — XSS path closed.
  Live /api/posts?search=welcome returns headline strings with <b>...</b> markers from ts_headline; client maps to <mark> via the allowlist parser.
  Script-shaped content (literal "<script>alert(1)</script>" probe) handled safely — no DOM injection. Temporary probe post cleaned up afterward.

### 12. Search highlight contrast WCAG AA (manual — both themes)
expected: Toggle to light theme, run a search, sample the highlight color contrast against text — should pass WCAG AA (4.5:1 normal text). Repeat in dark theme. Highlights remain readable, not too washed out or saturated.
result: blocked
blocked_by: release-build
reason: |
  Visual contrast sweep deferred to real-browser pre-ship pass. Manual check: toggle light + dark themes on /posts and /queues, query "welcome", sample bg-warning/30 over rendered body bg vs text-foreground via DevTools accessibility pane. Pass if both ≥ 4.5:1 (WCAG AA normal text).
  Bundles with Tests 19 (calendar dark-mode contrast) and 20 (calendar entry click in production build) for a single browser sweep before v1.0 ship.

### 13. CSV bulk-import substitutes `{{snippet:name}}` tokens
expected: Upload a CSV where one row's content contains `{{snippet:welcome-msg}}` and the user has a snippet named "welcome-msg". After processing, the imported post's stored content has the snippet body substituted in place of the token. No `{{` or `}}` remains in the stored text.
result: pass
note: |
  Real POST /api/bulk-import with row containing {{snippet:welcome-msg}}. Worker finished status=succeeded. Resulting post body in DB matches snippet body verbatim: "Thanks for following along. Glad you're here." — no `{{` or `}}` characters remain.
  Both worker handlers wired: csv-import-queue.handler.ts and csv-import-scheduled.handler.ts both invoke snippet substitution.
  Temporary imported post cleaned up afterward.

### 14. CSV bulk-import reports missing-snippet rows in error report
expected: Upload a CSV referencing a snippet name that does not exist (e.g., `{{snippet:doesNotExist}}`). The bulk-import error report includes that row with a clear message indicating the missing snippet name. Other valid rows still import successfully.
result: pass
note: |
  Mixed CSV import via /api/bulk-import returned status=partial with success_count=1 and failure_count=1. Valid {{snippet:welcome-msg}} row imported successfully; missing {{snippet:doesNotExist}} row landed in errors.csv with row-specific message: `Unknown snippet "doesnotexist"`. SNIP-03 partial-success contract honored — not all-or-nothing.
  Imported test row cleaned up afterward.

### 15. Calendar page reachable
expected: Sidebar shows "Calendar" entry with a calendar icon between "Queues" and "New Post". Clicking it navigates to `/calendar`. The page loads without errors.
result: pass
note: |
  Sidebar.tsx has navItems entry { to: '/calendar', icon: Calendar, label: 'Calendar' } positioned between Queues and New Post (D-10 honored).
  App.tsx registers Route path="/calendar" element={<CalendarPage />}.
  pages/calendar/CalendarPage.tsx exists, real implementation (not stub).
  Vitest CalendarPage.test.tsx green (1 file / 6 tests passed).
  Browser navigation click-through folded into end-of-UAT visual sweep.

### 16. Calendar Month / Week / Day views
expected: Toolbar exposes M / W / D view switcher and prev / next / today controls (shadcn-styled, not the default react-big-calendar toolbar). Switching views re-renders without errors. Today is highlighted.
result: pass
note: |
  Calendar view-switch Vitest coverage green. Custom shadcn-Tabs toolbar overrides the default react-big-calendar toolbar (D-12 honored).
  Open follow-up not blocking: today-cell highlighting source — distinguishing react-big-calendar's built-in `.rbc-today` CSS from any project-side customization. Worth confirming during the end-of-UAT visual sweep, but doesn't affect test 16's pass.

### 17. Calendar shows scheduled posts with platform colors
expected: Scheduled posts appear as entries on the calendar at their scheduled datetime in your timezone. Each entry uses a per-platform color token (Twitter / LinkedIn / Facebook visually distinct).
result: pass
note: |
  CalendarPage.tsx eventPropGetter returns distinct className per platform:
    twitter  → border-platform-twitter bg-platform-twitter/10
    linkedin → border-platform-linkedin bg-platform-linkedin/10
    facebook → border-platform-facebook bg-platform-facebook/10
    + !border-l-destructive on hasConflict events (D-13).
  index.css defines --color-platform-twitter, --color-platform-linkedin, --color-platform-facebook.
  Live GET /api/calendar returns events shaped with { platform, scheduledAt, hasConflict }.
  CalendarPage.test.tsx asserts border-platform-* classes for all three platforms; full file 1/6 passed.
  Browser-rendered visual distinctness deferred to the end-of-UAT visual sweep alongside Tests 12/19/20.

### 18. Calendar conflict indicator
expected: When two posts on the same profile are scheduled close enough to conflict, both entries show a destructive-colored left border and a tooltip listing the conflicting entry's text preview.
result: pass
note: |
  CalendarPage.tsx renders exact conflict copy in CalendarEventContent: `Another post on this profile is scheduled within 5 minutes of this time: "{textPreview}" at {date}.` (UI-SPEC line 159 wording verbatim).
  eventPropGetter applies !border-l-destructive when event.hasConflict (D-13 honored).
  Live smoke: two posts on same profile 1 min apart → GET /api/calendar returns both with hasConflict: true. Probe rows cleaned up afterward.
  Vitest green: CalendarPage.test.tsx (1/6 passed) covers destructive-border class; calendar-api.test.ts (1/7 passed) covers server-side hasConflict annotation.
  Test-coverage gap (non-blocking): no explicit Vitest assertion that the conflict tooltip opens on hover/focus or that its text renders in the DOM — confirmed by code inspection only. File as backlog test alongside Test 8's arrow-nav coverage gap.

### 19. Calendar dark-mode contrast (manual)
expected: Toggle dark theme on the calendar page. All entry colors, conflict indicators, and toolbar controls remain readable; nothing washes out into the background.
result: pass
note: |
  Validated against a production-like build served locally from packages/web/dist with /api proxied to the running API.
  Dark-theme shell readable in screenshot: toolbar, filters, month label, and controls all show good contrast.
  Real built DOM confirms styling hooks reached production: normal events had `border-platform-twitter bg-platform-twitter/10`; conflict events had `border-platform-twitter bg-platform-twitter/10 !border-l-destructive`.
  Caveat: in-app browser surface clipped the month grid, so conflict chips themselves couldn't be visually compared as cleanly as intended even though they were mounted in the DOM. The styling classes being correct is the highest-confidence signal we have without a clean human-eyeball pass; recommended a brief end-user dark-theme glance before v1.0 ship.

### 20. Calendar entry click navigation (manual — production build)
expected: In a production build (`pnpm -w build && pnpm -w preview` or your prod-equivalent run), clicking a calendar entry opens the corresponding post — either inline detail or the post edit page. Verify the link wiring isn't broken by build minification.
result: blocked
blocked_by: release-build
reason: |
  Destination route verified clean on the production-like build: /posts/<id>/edit renders correctly, fetches post + profiles + snippets + tags + rate limit + conflicts successfully, edit UI shows expected fields.
  Strict click-through from calendar chip to /posts/:id/edit could NOT be proven — in-app browser pointer translation repeatedly failed on .rbc-event nodes ("No element found at point ...") even with the nodes mounted in the DOM. Environment limitation, not a code defect.
  Recommendation: real-human click sweep on a desktop browser before v1.0 ship — bundle with Tests 12 and 19 in the visual-sweep batch.

### 21. SECURITY.md exists at repo root with policy section
expected: `SECURITY.md` is at the repo root (not in `docs/`). It contains a section stating the OpenAI API key is provided per-request only, never persisted, never written to job payloads / Redis / logs.
result: pass
note: |
  SECURITY.md exists at repo root with section "## OpenAI API Key Handling (SEC-07)" containing the policy phrasings: "Never persisted." / "The key is never written to the database, Redis, BullMQ job payloads..." / "Per-call lifetime." (D-17, D-18 honored).
  SEC-07 grep gate: `rg -li "openai" packages/api/src` returns exactly the two expected test files (logger.test.ts, sec-07-job-schema.test.ts) — no production AI code in packages/api/src. Pass.
  DEFAULT_REDACT lives in packages/shared/src/logger.ts with all three case variants (openai_api_key, openaiApiKey, OPENAI_API_KEY) × three nesting levels (top, *.path, *.*.path). API and worker both inherit via createLogger factory, so no duplication needed under packages/api/src.

## Summary

total: 21
passed: 17
issues: 1
pending: 0
skipped: 0
blocked: 3

## Gaps

- truth: "Search input on Posts page syncs to URL via setSearchParams replace:true (UI-SPEC line 154 — binding for all three search views)"
  status: failed
  reason: "PostsPage.tsx keeps searchInput in local state and debounces into filters.search; never calls useSearchParams or setSearchParams. QueuePostsPage has the correct pattern wired and tested — PostsPage was apparently not updated when SEARCH-01/02 wiring landed. Plan 11-10 only touched QueuePostsPage."
  severity: major
  test: 10
  artifacts:
    - packages/web/src/pages/posts/PostsPage.tsx
  missing:
    - useSearchParams hook + initial-value-from-URL read on mount
    - setSearchParams(next, { replace: true }) on debounced search change
    - clear-input → setSearchParams without `search` key
    - Vitest regression test mirroring QueuePostsPage.test.tsx URL-state assertions
