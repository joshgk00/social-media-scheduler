# Implementation Plan

Sequenced milestones for building the redesign in the existing Vite + React codebase. Each milestone has a **Goal**, a **Scope** (what to ship), and a **Definition of done (DoD)**. Don't skip ahead — later milestones depend on the foundation laid in earlier ones.

Total estimated effort: ~3 weeks for a senior engineer, ~5 weeks for a mid-level. Adjust based on what's already in the codebase.

---

## Milestone 0 — Foundations (1–2 days)

**Goal** — Get the token system + global app shell wired so subsequent screens compose cleanly.

**Scope**
- Translate `README.md → Design Tokens` into the codebase's theme system. Colors, type, spacing, radii, shadows, density (optional).
- Pull Inter Tight + JetBrains Mono from Google Fonts (or vendor them through the codebase's existing font setup).
- Replace whatever the old app shell looks like with the new Sidebar + Topbar + Content layout described in `README.md → App Shell`.
- Wire the routing map (`README.md → Routing map`). Don't build the screens yet — stub each route with a page-title placeholder.
- Bell badge: connect to the unread-count endpoint (see `API_CONTRACT.md`).
- User avatar menu in topbar (Profile, Sign out).

**DoD**
- Tokens accessible everywhere (no hardcoded hex in components).
- Sidebar nav visually matches `screenshots/01-dashboard.png` (left rail).
- All routes resolve to a placeholder page; no console errors.
- Dark theme is the default. Light theme renders without crashing (visual polish not required).

---

## Milestone 1 — Component library (2–3 days)

**Goal** — Build the reusable primitives once, in spec. Every screen consumes these.

**Scope** — Build each of the components in `README.md → Components`, with full variant + state coverage:

- `Button` — default / primary / accent / ghost / outline / danger × sm / default / lg, leading + trailing icon support, loading state, disabled state
- `IconButton` — single icon, 28px square
- `Icon` — Lucide wrapper, default 16px
- `Avatar` — sm/md/lg, initials, optional `platform` glyph badge
- `PlatformGlyph` — monogram chip (twitter/linkedin/facebook), tinted
- `Pill` / `StatusPill` — all 6 tones + dot/icon variants; StatusPill maps status string → preset
- `Input` / `Textarea` / `Select` — label, hint, error, optional icon prefix
- `Switch` / `Checkbox` / `Radio` — controlled, accessible
- `Segmented` — 2–5 options, active state
- `Menu` / `MenuItem` — popover with click-outside dismiss, sections + dividers + danger items
- `Card` — header (title + action slot) + body
- `PageHeader` — breadcrumb + title + subtitle + right action slot
- `EmptyState` — icon + title + body + action
- `Banner` — info/warning/danger tones, optional title + action
- `Modal` — backdrop blur, max-width, header (title+subtitle+close), body, footer
- `Kbd` — keyboard hint chip

**DoD**
- Each component renders in isolation in a Storybook-style page (or whatever the codebase uses for component dev).
- All variants visually match the prototype's component renders.
- All form controls keyboard-accessible (Tab order, focus rings, Escape dismisses menus/modals).
- Focus ring uses `box-shadow: 0 0 0 3px rgba(237,71,74,0.25)`.

---

## Milestone 2 — Public/auth screens (1 day)

**Goal** — Land users from sign-in to a working dashboard.

**Scope**
- Login (`/login`) — screenshot `32-login.png`
- Recover (`/recover`) — 3-step flow, screenshots `33-recover-step-1.png` + `34-recover-step-3.png`
- Setup (`/setup`) — first-run admin creation, screenshot `35-setup.png`
- 2FA challenge (no screenshot — see `README.md → Login → States`; build it to spec)

**DoD**
- Auth screens posted-to / fetch from existing auth endpoints (no API changes).
- Recover flow's 3-step progress indicator updates correctly.
- "Forgot password" link visible and reachable from login (issue 22 in brief).
- Setup screen redirects authenticated users to `/dashboard` (existing SetupGuard).

---

## Milestone 3 — Dashboard (1–2 days)

**Goal** — The landing page that gives operators useful signal.

**Scope** — `README.md → Dashboard`, screenshot `01-dashboard.png`
- 4-card status strip (Scheduled 24h / Active queues / Errors 7d / Rate headroom)
- 24-hour timeline visualization with NOW marker
- Up next list (4 rows under the timeline)
- Active queues card
- Rate limits card

**DoD**
- All four stat cards reflect real data from the API.
- Timeline blocks show correct hour scheduling, including a NOW marker positioned at current time.
- Clicking an active queue navigates to `/queues/:id`.
- Clicking the Errors stat card navigates to `/notifications`.
- Single-line "Resets" footer on Rate limits (issue 16 — not per-profile).

---

## Milestone 4 — Posts: list + composer (3–4 days)

**Goal** — The most-used workflow in the app, end-to-end.

**Scope**

### 4a. Posts list (`/posts`) — `02-posts-list.png`, `03-posts-bulk-actions.png`, `04-posts-failed-expanded.png`
- Status filter Segmented (All / Scheduled / Queued / Drafts / Failed) with counts
- Profile + Tags filters
- Search input
- Table with checkbox select + per-row expand chevron (failed only) + kebab menu
- Bulk-action bar appears on selection; menu groups Publishing / Edit / Export / Danger
- Failed-row inline expand reveals **the verbatim error reason** and a Retry button (issue 13)

### 4b. Composer (`/posts/new`, `/posts/:id/edit`) — `05`, `06`, `07`, `08`
- Profile picker (chips with avatar + handle + selection state)
- Platform-conditional labels ("Tweet text" vs "Post text", char limit, media hint) — issue 4
- Spinnable text toggle with **live 3-variant preview** (issue 19)
- Auto-destruct toggle
- Right rail: Preview + Schedule (with quick-chip shortcuts) + Tags + Internal notes
- Snippet picker modal — search + tap-to-insert

### 4c. Import CSV (`/posts/import`) — `09-import-csv.png`
- 3-step numbered wizard
- Target choice: Scheduled vs Append to queue
- File dropzone with validation feedback ("N rows valid")
- Template download buttons
- Footer "← Back to posts" — never "Don't Import" (issue 14)

**DoD**
- Posts list selection survives within filter changes but clears on route exit.
- Bulk-action menu correctly anchors under its trigger.
- Composer's character counter turns red over limit and disables the Schedule button.
- Spinnable preview renders 3 deterministic variants (1st, 2nd, 3rd round-robin through options).
- Import succeeds via existing CSV-import endpoint; preview row count matches server validation.

---

## Milestone 5 — Queues (2–3 days)

**Goal** — Recurring-publish setup that's actually understandable. **This is where the brief's biggest IA fix lives.**

**Scope**

### 5a. Queues list (`/queues`) — `10-queues-list.png`
- Table: queue name, profile, cadence summary, post count, status, next run, kebab
- Filter Segmented (All / Active / Paused)
- Kebab menu: View posts, Edit, Copy configuration, Pause/Resume, Delete

### 5b. Queue create / edit (`/queues/new`, `/queues/:id/edit`) — `11`, `12`, `13`
- **The big one — issue 8.** Three explicit schedule modes:
  - **Specific times** (recommended) — pick days + exact times. E.g., Mon–Fri at 8am, noon, 3pm.
  - **Fixed interval** — clock-aligned slots, every N hours, with day picker + hour windows.
  - **Variable interval** — N hours after each publish, with day picker + hour windows.
- Day picker with "Weekdays" shortcut
- Hour windows (24-cell grid with select-all/clear)
- Right-rail **live preview** showing the next 5 publish times based on current settings — updates reactively as the user toggles inputs

### 5c. Queue detail (`/queues/:id`) — `14-queue-detail.png`
- Hero: queue name + status pill + Pause/Edit/Add Post actions
- 4-stat row: cadence, post count, next run, profile
- Schedule summary card (one-line mono description)
- Posts-in-queue preview (4 rows + View all link)

### 5d. Queue posts (`/queues/:id/posts`) — `15-queue-posts.png`
- Full ordered listing with drag-reorder (or up/down arrows as fallback)
- Same status pills as the main Posts table

**DoD**
- Live preview is real — implement the algorithm described in `README.md → Queue create → Live preview algorithm`.
- Specific-times mode validation: must have ≥1 day AND ≥1 time selected.
- Hour windows + day picker UI is accessible (keyboard toggles).
- Edit mode prefills the form from the queue's current schedule.

---

## Milestone 6 — Calendar (2 days)

**Goal** — A working calendar with empty-state correctness (issue 3).

**Scope** — `README.md → Calendar`, screenshots `16-calendar-month.png`, `17-calendar-week.png`, `18-calendar-day.png`
- Month view — 7×6 grid, today highlighted, event chips per day, prev/next nav
- Week view — time gutter + 7 day columns with hour rows
- Day view — single day, 24 hour rows
- Toolbar: Today/prev/next, **labeled Show filter** + **labeled View switcher** (issue 24)
- Empty state: the grid **always renders** the 6-week structure even with zero events (the original bug — issue 3)

**DoD**
- All three views render correctly with no events, partial events, and full days.
- "Today" button returns to the current date.
- Event chips truncate long text gracefully.
- Filter and view-switcher Segmented controls are visually distinct and labeled.

---

## Milestone 7 — Profiles (1–2 days)

**Goal** — Connected accounts with consistent display and platform-aware Connect flow.

**Scope** — `README.md → Profiles`, screenshots `19`, `20`, `21`
- Profiles list — responsive card grid with the **4-row card hierarchy** (issue 17): identity / status / rate / history
- Platform tabs filter (All / Twitter / LinkedIn / Facebook with counts)
- Kebab menu: Edit, Reconnect, Edit rate limit, Delete
- **Connect Profile modal** (issue 7) — tabbed by platform inside the modal:
  - LinkedIn/Facebook tabs → one-click OAuth banner only
  - Twitter tab → 4 reveal-toggle credential inputs (consumer key/secret + access token/secret)

**DoD**
- Twitter credentials inputs ONLY appear on the Twitter tab.
- Platform glyph (no logo) appears consistently on the card avatar badge AND elsewhere the profile is referenced.
- Deprecated profiles show "Deprecated" pill in the status row (issue 5).
- Rate limit row hidden for platforms without per-account caps (LinkedIn/Facebook), replaced with explanatory copy.

---

## Milestone 8 — Notifications (1 day)

**Goal** — Inbox that doesn't shout (issue 12).

**Scope** — `README.md → Notifications`, screenshots `22-notifications.png`, `23-bell-flyout.png`
- Notifications page with status filter Segmented (All / Unread / Read) + type filter
- Each row encodes severity with **a single colored dot** — no icon, no row tint, no status pill
- Per-row contextual action: View post (errors), Reconnect (warnings), Dismiss (info)
- Top-right actions: Mark all read, Clear read
- Bell flyout in topbar — 4 most recent + Mark all read + View all link

**DoD**
- Unread badge on the topbar bell updates in near-real-time (poll or websocket).
- Mark-all-read disables when 0 unread.
- "Clear read" doesn't touch unread items.
- Read notifications auto-prune after 90 days (server-side cron — confirm exists or add).

---

## Milestone 9 — Settings (2–3 days)

**Goal** — All seven settings tabs + the Snippets reunion (issue 9).

**Scope** — `README.md → Settings`, screenshots `24` through `30`

### 9a. Tab strip
- Unified tabs: Profile · Preferences · Security · Notifications · Snippets · Storage · Advanced (each with a leading icon, active border-bottom in `brand-accent`)

### 9b. Profile tab (`24-settings-profile.png`)
- Avatar upload + first/last/username/email inputs

### 9c. Preferences tab (`25-settings-preferences.png`)
- Timezone, date format, entries per page, default landing page

### 9d. Security tab (`26-settings-security.png`)
- Password, 2FA, Security questions, Active sessions ("1 active, N stale auto-pruned" — issue 2), Last login

### 9e. Notifications tab (`27-settings-notifications.png`)
- SMTP-not-configured warning banner (when applicable)
- Event preference table: per-event in-app/email switches; mark some events as Required

### 9f. Snippets tab (`28-settings-snippets.png`)
- Search + New snippet + table (name/category/preview/updated/kebab)
- Edit modal (separate, not shown in screenshots — build to spec)

### 9g. Storage tab (`29-settings-storage.png`)
- Usage hero + media browser grid (currently empty state)

### 9h. Advanced tab (`30-settings-advanced.png`)
- Worker queue inspector card → link to Bull Board (Milestone 10)
- System info card (version, DB, worker, redis, smtp, uptime)
- Danger zone (export all data, reset application)

**DoD**
- All seven tabs accessible via direct URL (`/settings/security` etc.).
- Saving any tab persists to existing settings endpoints.
- Required notification events (Re-auth, Token revoked) cannot be disabled in-app.

---

## Milestone 10 — Bull Board wrapper (½ day)

**Goal** — Frame the operator tool cleanly without restyling it (issue 26).

**Scope** — `README.md → Worker queue inspector`, screenshot `31-admin-bull-board.png`
- Wrapper page at `/settings/advanced/bull-board` with breadcrumb + explanation banner
- 3-card queue health summary (`publish`, `notification`, `bulk-ops`)
- Embedded Bull Board iframe with a header strip explaining the theme shift

**DoD**
- Wrapper page loads Bull Board in an iframe via the existing Bull Board mount URL.
- "Open in new tab" link works.
- Breadcrumb path: Settings → Advanced → Worker queue inspector.

---

## Milestone 11 — Polish, a11y, perf (2 days)

**Goal** — Production-ready.

**Scope**
- Run through `README.md → Accessibility checklist` — fix every gap
- Tab order, focus traps in modals, Escape dismisses everything
- Lighthouse audit; address P0/P1 perf issues
- Empty states for every list (posts, queues, profiles, snippets, notifications, calendar)
- Loading states for every async screen (Card skeleton placeholders are already in `tokens.css`)
- Error toasts/banners for failed mutations
- Responsive review at 1280, 1440, 1920 — the design targets 1440

**DoD**
- Keyboard-only flow from sign-in → compose → schedule → publish.
- No console errors or warnings on a clean session.
- Lighthouse a11y ≥ 95.
- Empty states everywhere — no blank pages.

---

## Milestone 12 — Bring-down of the old UI (½ day)

**Goal** — Remove the old screens and their CSS.

**Scope**
- Delete old screens / route stubs that the new design replaces.
- Remove unused dependencies (old icon libraries, etc.).
- Update README in the codebase root with screenshots from `screenshots/` and a "Design system" link.

**DoD**
- No dead routes or orphan components.
- Bundle size reduced vs. pre-redesign.

---

## Estimation summary

| Milestone | Days |
|---|---|
| 0 — Foundations | 1–2 |
| 1 — Component library | 2–3 |
| 2 — Auth screens | 1 |
| 3 — Dashboard | 1–2 |
| 4 — Posts (list + composer + import) | 3–4 |
| 5 — Queues | 2–3 |
| 6 — Calendar | 2 |
| 7 — Profiles | 1–2 |
| 8 — Notifications | 1 |
| 9 — Settings (×7 tabs) | 2–3 |
| 10 — Bull Board wrapper | 0.5 |
| 11 — Polish + a11y | 2 |
| 12 — Old-UI removal | 0.5 |
| **Total** | **19–26** |

---

## Risk register

| Risk | Mitigation |
|---|---|
| Queue create live preview math is wrong | Use the algorithm in `README.md`; add unit tests for each mode. |
| Calendar empty-state regresses | Snapshot test the month grid with `events=[]`. |
| Posts table perf with thousands of rows | Server-side pagination. Virtualize only if rows-per-page > 200. |
| Theme tokens leak to specific components | Lint rule banning hardcoded hex in `.tsx` files. |
| Bull Board iframe breaks behind cookie/auth changes | Keep its mount URL same as today; the wrapper just embeds. |
