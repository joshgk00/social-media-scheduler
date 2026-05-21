# Handoff: Social Media Scheduler — Full UI Redesign

## Overview

This bundle is a developer handoff for a complete redesign of the **Clicks & Mortar Social Media Scheduler** — a self-hosted (Vite + React frontend, Node/Express API, Docker stack) tool for scheduling posts to Twitter/X, LinkedIn, and Facebook.

The redesign addresses **27 documented UI/UX issues** spanning every section of the app and rebrands the product to Clicks & Mortar Websites' visual identity. See `UI-UX-BRIEF.md` (included in this bundle) for the original issue list — every issue is addressed below in the **Issue → Resolution Map** section.

## How to use this bundle

For Claude Code (recommended) — open the target codebase, drop this folder in, and start with:

> "Read `design_handoff_sms_redesign/CLAUDE.md`, then `IMPLEMENTATION_PLAN.md`. We're rebuilding our scheduler UI to match this design — work through the milestones in order, in our existing Vite + React codebase."

The most important files:

| File | Read when |
|---|---|
| **`CLAUDE.md`** | First — sets operating rules for the rebuild |
| **`IMPLEMENTATION_PLAN.md`** | After CLAUDE.md — 12 sequenced milestones with DoD |
| **`README.md`** (this file) | Per-screen spec lookup — design tokens, layouts, components |
| **`API_CONTRACT.md`** | When wiring data — endpoint shapes the UI expects |
| **`screenshots/INDEX.md`** | Map screen names → screenshot files |
| **`screenshots/*.png`** | Visual tiebreaker for every screen and state |
| **`design_files/Social Media Scheduler.html`** | Open in a browser to interact with the prototype |
| **`reference/UI-UX-BRIEF.md`** | Background — the original audit |
| **`brand-guidelines.md` + `brand-colors.md`** | Brand reference

---

## About the Design Files

The files in this bundle are **design references created in HTML/React** — high-fidelity prototypes showing intended look, layout, copy, and behavior. They are **not production code to copy directly**.

The codebase already exists (`Vite + React + Express + Postgres + Redis + BullMQ`). The task is to **recreate these designs inside that codebase** using the project's established patterns: same React/TypeScript conventions, same routing, same state-management approach. Do not bring in the demo's CSS files, fixture data, or single-file prototype scripts as-is — they are illustrative.

A few things to lift verbatim:
- **Design tokens** (`design_files/styles/tokens.css`) — colors, spacing, radii, type scale. Translate these to whatever the codebase uses (CSS vars, Tailwind config, styled-system theme).
- **Copy** — every visible string is intentional. Replicate it.
- **Information architecture** — order of sections, what's a tab vs page, modal vs inline, etc.

---

## Fidelity

**High-fidelity.** Colors are final (with brand hex codes), typography is final (Inter Tight + JetBrains Mono), spacing is consistent across screens. Interactions are demonstrated but the underlying behaviour (real API calls, real validation rules, real rate-limit math, etc.) is the developer's job — the mocks show the **shape** of the experience, not the wiring.

Where the prototype handwaves something (e.g. the in-memory router, the fixture array of posts), the codebase's real version applies.

---

## Stack & Conventions

| Concern | Use what's already in the codebase |
|---|---|
| Routing | The existing router (React Router, Tanstack Router — whatever's there). The demo uses an in-memory `route` state. |
| Data fetching | Existing pattern (React Query, SWR, fetch wrappers). The demo uses static fixtures from `data.jsx`. |
| Forms | Existing form library if any. Validation rules below. |
| Icons | Lucide React (matches the demo's outline style). Demo inlines SVGs in `data.jsx → Icon`. |
| Date/time | Existing date lib (date-fns, dayjs, etc.) |
| Backend | No backend changes assumed unless explicitly called out below. |

---

## Design Tokens

Translate these into whatever the codebase uses (Tailwind theme, CSS variables, styled-components theme — the existing pattern wins).

### Brand colors

| Token | Hex | Role |
|---|---|---|
| `brand-primary` | `#640f0d` | Sidebar selected nav, brand surfaces, primary buttons |
| `brand-primary-hover` | `#7a1612` | Primary hover |
| `brand-primary-soft` | `#640f0d33` (20% alpha) | Subtle primary backgrounds (bulk-action bar, modal headers if needed) |
| `brand-accent` | `#ed474a` | CTAs, danger, selection focus, error indicators, accent everywhere |
| `brand-accent-hover` | `#f15e60` | Accent hover |
| `brand-accent-soft` | `#ed474a26` (15% alpha) | Soft accent backgrounds (status pills, soft selection states) |
| `charcoal` | `#231f20` | Source of dark-surface family |

### Surfaces (dark theme — default)

| Token | Hex | Use |
|---|---|---|
| `bg-canvas` | `#141112` | Main content background |
| `bg-base` | `#1a1718` | Cards' parent, sidebar, topbar |
| `bg-surface` | `#221e1f` | Card background |
| `bg-elevated` | `#2a2627` | Button bg, input chip bg |
| `bg-hover` | `#332f30` | Hover row, hover button |
| `bg-active` | `#3c3839` | Pressed, selected segmented |

### Borders

| Token | Hex | Use |
|---|---|---|
| `border-subtle` | `#2c2829` | Default card/divider |
| `border-default` | `#383435` 12% | Subtle outlines |
| `border-strong` | `#4a4546` | Input borders, dashed dropzones |
| `border-focus` | `#ed474a` | Focused-input border |

### Text

| Token | Hex | Use |
|---|---|---|
| `text-primary` | `#f5f1ee` | Body |
| `text-secondary` | `#b8b1ad` | Labels |
| `text-muted` | `#847d79` | Hints, captions |
| `text-dim` | `#5d5754` | Disabled, placeholders |
| `text-on-brand` | `#ffffff` | Text on `brand-primary` / `brand-accent` |

### Status

| Token | Hex | Soft (20%) | Use |
|---|---|---|---|
| `status-success` | `#34c785` | `#34c78520` | Active, published, healthy |
| `status-warning` | `#f59e0b` | `#f59e0b20` | Paused, expiring tokens, watch |
| `status-danger` | `#ed474a` | `#ed474a20` | Failed, errored, rate-limited (==brand-accent intentionally — danger and brand merge) |
| `status-info` | `#5b9bff` | `#5b9bff20` | Scheduled, informational |
| `status-neutral` | `#847d79` | `#847d7920` | Draft, queued, neutral |

### Platform tints (no logos — letter chips only)

| Platform | Letter | Color | Bg |
|---|---|---|---|
| `twitter` | `𝕏` | `#d4d4d4` | `#332f30` |
| `linkedin` | `in` | `#5b9bff` | `#5b9bff20` |
| `facebook` | `f` | `#7c93f0` | `#7c93f020` |

Logos of these platforms are intentionally avoided — we ship monochrome letter chips. The letter chip is rounded-rect, 16px default, font-weight 700, font-family mono.

### Light theme (one-flip away — implement but not the default)

| Token | Hex |
|---|---|
| `bg-canvas` | `#f5f3f1` |
| `bg-base` | `#ffffff` |
| `bg-surface` | `#fafaf8` |
| `bg-elevated` | `#f0eeec` |
| `bg-hover` | `#e8e5e2` |
| `bg-active` | `#ddd9d5` |
| `border-subtle` | `#ebe7e4` |
| `border-default` | `#d2d3d8` |
| `border-strong` | `#b8b4b0` |
| `text-primary` | `#231f20` |
| `text-secondary` | `#4a4546` |
| `text-muted` | `#706a67` |
| `text-dim` | `#9a9491` |

Brand, accent, status, and platform tokens are **theme-invariant** — they don't change between dark and light.

### Type

- **Sans**: `Inter Tight` (400, 500, 600, 700) — via Google Fonts
- **Mono**: `JetBrains Mono` (400, 500, 600) — handles, hashes, IDs, numbers, code snippets

Sizes (use the existing typography scale if there is one; otherwise pin these):

| Token | px | line-height |
|---|---|---|
| `xs` | 11 | 1.45 |
| `sm` | 12 | 1.5 |
| `base` | 13 | 1.5 |
| `md` | 14 | 1.5 |
| `lg` | 16 | 1.5 |
| `xl` | 20 | 1.3 |
| `2xl` | 24 | 1.25 (letter-spacing -0.01em) |
| `3xl` | 32 | 1.15 (letter-spacing -0.02em, weight 600) |

Body default: 13px / 1.5 / weight 400.
Tabular-nums on all numeric mono uses.
Mono uses font-feature `"zero" "ss01"`.

### Spacing & radii

- Base unit: 4px. Use 4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 32px.
- Border radii: `xs 4` · `sm 6` · `md 8` · `lg 12` · `xl 16` · `full 999`.

### Shadows (subtle on dark)

- `sm`: `0 1px 2px rgba(0,0,0,0.4)`
- `md`: `0 4px 12px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.5)`
- `lg`: `0 12px 32px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.4)`
- `focus`: `0 0 0 3px rgba(237,71,74,0.25)`

### Density

The design supports 3 densities (Compact / Regular / Roomy). Regular is default. Density changes `row-h`, `pad-y/x`, `gap-base`, `font-base`. See `tokens.css` for exact values. Implementing density is **optional** for v1 — Regular is sufficient. If it's done, the user setting belongs in **Settings → Preferences**.

---

## App Shell

### Layout

```
┌────────────────────────────────────────────────────────┐
│ 224px wide │ topbar 52px tall                          │
│  Sidebar   ├─────────────────────────────────────────  │
│            │                                            │
│            │      Content (overflow-y: auto)            │
│            │      padding: 24px 28px                    │
│            │                                            │
└────────────┴────────────────────────────────────────────┘
```

- Sidebar collapsed width: 56px (icon-only, tooltip on hover)
- Topbar height: 52px
- Content area: full viewport height minus topbar; vertical scroll only

### Sidebar

Sections, separated by 1px hairline dividers:

1. **Brand block** — Brandmark (26px rounded square, `brand-primary` bg, "C&M" text) + "Clicks & Mortar" / "Scheduler v2.4" mono caption. Collapse button (panel-left icon) on the right.
2. **Primary nav** — Dashboard, Posts (with badge count if any failed/draft), Queues, Calendar
3. **Actions** — New post (use a subtly different style — leading icon `edit`), Import CSV
4. **Account** — Profiles, Notifications, Settings

Nav item:
- Padding `7px 10px`, gap 10, radius `sm`, font 13/500
- Default: `text-secondary`
- Hover: bg `bg-hover`, color `text-primary`
- Active: bg `brand-primary`, color `text-on-brand`. **Important**: active state must match the actual route (issue 1 in the brief). `compose` and `import` activate the **Posts** parent; `queue-*` routes activate **Queues**; `settings-advanced` and `admin-queues` activate **Settings**.

Sidebar footer (when expanded): user avatar (sm) + name + email-truncated, no chevron, no menu. Sign-out lives in the user menu in the topbar, not here.

### Topbar

- Left: global search input (icon=`search`, placeholder `"Search posts, queues, profiles… ⌘ K"`, max width 480)
- Middle: flex spacer
- Right: `New post` ghost button → opens composer · Bell button with red badge if unread > 0 → opens flyout · User avatar (sm) → opens user menu (Profile, Sign out)

### Routing map

| URL pattern | Component |
|---|---|
| `/` → redirect | `/dashboard` |
| `/dashboard` | `Dashboard` |
| `/posts` | `PostsList` |
| `/posts/new` | `Composer` |
| `/posts/:id/edit` | `Composer` (editing mode) |
| `/posts/import` | `ImportCsv` |
| `/queues` | `QueuesList` |
| `/queues/new` | `QueueCreate` |
| `/queues/:id` | `QueueDetail` |
| `/queues/:id/edit` | `QueueCreate` (editing mode) |
| `/queues/:id/posts` | `QueuePosts` |
| `/calendar` | `Calendar` |
| `/profiles` | `Profiles` |
| `/notifications` | `Notifications` |
| `/settings/:tab` | `Settings` (tabs: profile, preferences, security, notifications, snippets, storage, advanced) |
| `/settings/advanced/bull-board` | `AdminQueues` (Bull Board embed) |
| `/login`, `/recover`, `/setup` | Public auth screens |

---

## Screens

Each screen is described as: **Purpose · Layout · Components · States · Interactions**.

### 1. Login (`/login`)

**Purpose** — Sign in to a self-hosted instance.

**Layout** — Single-column centered on `bg-canvas`. 380px wide. Brandmark (56px) + product name + caption on top. Card with email + password fields. Below card: footer link "Recover account →".

**Components**
- Brandmark — rounded square 56px, `brand-primary` background with an inner darker gradient
- Inputs — labeled, icon-prefixed (`users` for email, `shield` for password)
- Primary button — full-width, height 36
- Footer link — small, accent color, opens `/recover`

**States**
- Loading: button shows spinner, disable both inputs
- Auth error: red banner above button — "Email or password didn't match. Try again."
- 2FA required: after primary submit, hide the form and replace with a TOTP entry view (6-digit code, "Use a recovery code instead" link)

**Validation** — Email must be valid email; password non-empty. Server is the source of truth — show server errors verbatim.

---

### 2. Recover (`/recover`) — three-step flow

**Purpose** — Reset password via security questions.

**Layout** — Same centered shell. 420px wide. Card with:
- 3-segment step indicator at top (filled segments = `brand-accent`, unfilled = `bg-active`)
- "STEP N OF 3" label (mono, muted, 11px)
- Step title (lg, 600)
- Step subtitle (muted)
- Step-specific fields
- Footer: Back ghost / Continue primary

**Steps**
1. Email
2. Two security questions (out of 3 they configured)
3. New password + confirm

**Behavior** — `Back` on step 1 returns to login. `Continue` advances. Final submit POSTs new password, then redirects to login with a green toast "Password updated. Sign in with your new credentials."

---

### 3. Setup (`/setup`) — first-run wizard

**Purpose** — One-time admin creation on a brand-new instance.

**Layout** — Centered 460px card. Title "Welcome aboard" / "One-time setup. You own this deployment — no SaaS layer."

**Fields** — Email, Password (12-char min hint), Confirm, Timezone select.

**Behavior** — Submit creates the admin account, signs in, redirects to `/dashboard`. SetupGuard server-side should redirect already-authenticated users to `/dashboard`.

---

### 4. Dashboard (`/dashboard`)

**Purpose** — Operator landing page. Answer: what's about to publish, what's broken, what's healthy?

**Layout**
```
PageHeader (title + actions: Open calendar, New post)
4-col stat strip (12px gap)
2-col grid: 2fr (Next 24 hours card) | 1fr (Active queues + Rate limits stack)
```

**Stat strip** — 4 cards, each:
- Label (xs, uppercase, muted, letter-spacing 0.05em, weight 500)
- Value (2xl, 600, tabular-nums)
- Sub (xs, muted)
- Optional trend (xs, success/danger colored)
- Icon top-right (14px, tinted by tone)

The 4 stats:
1. **Scheduled (24h)** — count, "across N profiles", info tone, trend "+3 vs yesterday"
2. **Active queues** — "N of M total · X paused", success
3. **Errors (7d)** — count, "needs attention", danger, click → `/notifications`
4. **Rate headroom** — % across active profiles, success

**Next 24 hours card**
- Header: title + Segmented `24h / 7d / 30d`
- 24-bar timeline: 24 columns of 1px gap, height 80. Each column = an hour. Past hours render at 40% opacity. Scheduled hours fill with `brand-accent` (90% opacity). Failed hours overlay a 45° striped pattern in `brand-accent`. **Now marker**: a 2px vertical line at the right position with a small "NOW · HH:MM" label above.
- Hour axis: 8 labels at 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 in mono / xs / muted
- Legend: Scheduled · Failed · Past
- Below the visual: "Up next" subhead + 4-row dense list (time | platform-glyph + truncated text | status pill)

**Active queues card** — list 3, each row:
- Top: platform-glyph + queue name (medium weight) + status pill (right)
- Bottom: muted xs row "N posts" / "Next: ..." right-aligned
- Click row → `/queues/:id`
- Footer link "All queues →" to `/queues`

**Rate limits card** — list 3 most-used profiles, each:
- Header: platform-glyph + name (left), "used/max" mono tabular (right)
- 4px progress bar, fill colored by % (≤60 success, ≤80 warning, >80 danger)
- Footer: "All reset Jun 1 (10 days)" — a **single line** rather than per-profile (issue 16).

**Interactions** — All stat cards with `onClick` are keyboard-focusable. Timeline blocks tooltip on hover with hour-summary ("3 posts scheduled, 1 failed retry").

---

### 5. Posts list (`/posts`)

**Purpose** — Browse, filter, edit, retry, and bulk-act on all posts.

**Layout**
```
PageHeader (title + actions: Import CSV outline, New post primary)
Filter bar: Segmented (All/Scheduled/Queued/Drafts/Failed counts) | search input | Profile filter | Tags filter
Conditional bulk bar (only when ≥1 row selected)
Table card (full width)
```

**Filter Segmented** — Each option shows a count parenthetically. Failed gets the `(1)` count too.

**Bulk bar** — Appears when selection ≠ 0:
- Background `brand-primary-soft`, border `brand-primary`, radius `md`, padding `8px 12px`
- Left: "N selected" + "Clear" link (resets selection)
- Right: "Bulk actions" outline button with chevron-down → opens menu

**Bulk-actions menu** (anchored under trigger, right-aligned, ≥220px):
- Section "Publishing" — Pause publishing · Resume publishing
- Section "Edit" — Modify tags… · Reschedule…
- Section "Export" — Export as CSV
- Section "Danger zone" (red) — Delete N posts (red item)
Sections separated by `menu-divider`, labels in 10px uppercase muted bold (issue 15).

**Table columns**
1. Checkbox (32px) — header has select-all
2. Expand chevron (28px) — only present for failed rows
3. Post text (auto) — single-line truncate. Failed rows: red `error` icon before text. Tags row below: small mono `#tag` muted chips, 4px gap. Click row body → `/posts/:id/edit`
4. Profile (180px) — platform-glyph + name (medium) above + mono handle below + "deprecated" pill if `profile.deprecated`
5. Status pill (110px) — see Status Pills spec below
6. When (140px) — text like "in 2h 14m", "tomorrow 9:00am", "via Daily tips", "6 days ago", muted xs
7. Kebab `more` icon (40px)

**Selected row** — bg `brand-primary-soft`.

**Failed row, expanded** (issue 13)
- Spans all columns, bg `bg-surface`, padding `12px 16px`
- "FULL TEXT" label + full text
- Danger banner with the **failure reason verbatim** + a "Retry now" outline button on the right
- Muted xs "Publish history: No attempts logged yet. Last failure 6 days ago."
- The "error column" approach is removed; the brief flagged it.

**Empty state** — `EmptyState` with `posts` icon, "No posts here yet", body, primary "New post" button.

---

### 6. Composer (`/posts/new`, `/posts/:id/edit`)

**Purpose** — Create or edit a post.

**Layout — two-column grid `minmax(0,1fr) 320px`, 20px gap**

**Left column (v-stack 16px gap)**:

1. **Posting to** card
   - Field label "Posting to"
   - Wrap of profile chips (one per active profile): chip is avatar + name + mono handle, padding `6px 10px 6px 6px`, border + radius `sm`. Selected: border `brand-accent`, bg `brand-accent-soft`. Unselected: border `border-default`, bg `bg-base`. (Issue 17)
   - Below the wrap: muted xs `info` row "Posting as **{name}** on Twitter / X" — explicit text mentioning the platform name. **Used to drive label swaps below.**

2. **Text composer** card
   - Top row: label `{labels.textLabel}` + Switch "Thread mode" — Switch label suffixes `(Twitter only)` when platform ≠ twitter
   - Textarea, min-height 140, font 14 / 1.5
   - Footer row: ghost buttons `Add media`, `Insert snippet`, `AI rewrite` on the left; "N / limit" character counter mono tabular on the right (red when over limit)
   - **Labels swap by platform** (issue 4):
     - `twitter`: textLabel="Tweet text", previewLabel="Tweet preview", placeholder="What's happening?", limit 280
     - `linkedin`: textLabel="Post text", previewLabel="LinkedIn preview", placeholder="Share an update with your network…", limit 3000
     - `facebook`: textLabel="Post text", previewLabel="Facebook preview", placeholder="What's on your mind?", limit 63206
   - Empty profile selection: textLabel defaults to "Text", placeholder generic.

3. **Media dropzone** — 1.5px dashed `border-strong`, `bg-surface`, radius `md`, padding `24px 20px`, centered. `image` icon, hint "Drop images, GIFs, or video — or browse". Sub-hint changes by platform:
   - twitter: "Up to 4 images (5 MB each) or 1 video (15 MB)"
   - linkedin: "Up to 9 images (10 MB each) or 1 video (200 MB)"
   - facebook: "Images and video"

4. **Spinnable text** card (issue 19)
   - Title + hint mentioning `{option1|option2}` syntax (mono code chip), Switch on the right.
   - When ON, expand a "Preview — 3 random renderings:" block showing 3 expansion examples (separated by `border-subtle` dashed). The expansion algorithm: for `{a|b|c}`, render variant `i` (i=0..2) as `options[i % options.length]`.

5. **Auto-destruct** card — title/hint/switch, when ON show number input + unit select (hours/days/weeks).

**Right column (sticky right rail)**:

1. **Platform preview** card — labelled per `labels.previewLabel`. Inside: a small mock "tweet/post":
   - `bg-base`, border, padding 12, radius `md`
   - avatar (sm) + name (12 bold) + mono handle row
   - body text (or placeholder muted "Your tweet preview will appear here…")
2. **Schedule** card — input with `calendar` icon (default "Fri May 23, 9:00 AM" placeholder), then a 4-button quick-schedule row (xs chips): `In 1h`, `Tonight 8pm`, `Tomorrow 9am`, `Next Mon 9am`. Selected chip: `brand-accent-soft` bg, `brand-accent` text/border. Below: muted xs "Times in America/Detroit"
3. **Tags** card — input with `hash` icon + tag chips with × delete
4. **Internal notes** card — textarea, placeholder "Not published. Just for you."

**Header action row** (right side of PageHeader) — Cancel ghost · Save draft outline · Schedule primary with chevron (clicking the chevron opens a small menu: "Schedule now", "Save as draft", "Schedule and queue another"). When a quick-schedule chip is picked, the primary button label updates to "Schedule (Tomorrow 9am)" — feedback that the schedule is set.

**Snippet picker modal** — Triggered by `Insert snippet` in the composer:
- Title "Insert snippet" / subtitle "Reusable text and link blocks."
- Search input
- List of snippets — each row: bold name (mono) + Pill {category} on right, body preview in muted xs below. Hover → bg-hover. Click → append snippet body to text + close modal.

**Empty profile selection** — Composer is usable with no profile selected, but the Schedule primary button is disabled until a profile + text exist.

---

### 7. Import CSV (`/posts/import`)

**Purpose** — Bulk-create scheduled posts from a CSV.

**Layout** — Max-width 760, vertical stack of 4 numbered step cards + footer.

**Step 1: Where should imported posts go?**
- Two `ChoiceCard`s side-by-side (1fr 1fr): "Scheduled posts" / "Append to a queue"
- ChoiceCard is a button with a left-aligned radio + title + hint, border + bg flips on selected (`brand-accent` border, `brand-accent-soft` bg)

**Step 2: Which profile/queue?**
- Single Select dropdown. Options change based on step 1 choice.

**Step 3: Upload your CSV**
- Large dashed dropzone. When file picked: collapse padding, show file icon + filename mono + "N rows valid" success pill + × clear button.

**Templates card**
- Title "Need a template?" + 2 outline download buttons "Scheduled template", "Queue template"
- Muted note: "Tags are semicolon-separated. Spinnable text uses {a|b|c} syntax verbatim."

**Footer row** — "← Back to posts" ghost (issue 14 — never "Don't Import") on left, "Import N posts" primary on right. Primary disabled until file + target both selected.

---

### 8. Queues list (`/queues`)

**Purpose** — Manage recurring publishing schedules.

**Layout** — PageHeader + filter row + table card.

**Filter row** — Search input (max-width 360) + Segmented (All / Active / Paused).

**Table columns**
1. Queue — name (medium weight) + muted xs "Last run X" below
2. Profile — platform-glyph + name + handle (as in Posts)
3. Cadence — formatted per mode:
   - specific-times: mono small "08:00 · 12:00 · 15:00" + muted xs day summary ("Weekdays" or "Mon, Wed")
   - fixed: "Every 4h"
   - variable: "12h after last publish"
4. Posts — mono tabular count
5. Status pill
6. Next run — muted xs ("in 2h", "Fri 12pm")
7. Kebab → menu: View posts · Edit queue · Copy configuration · Pause/Resume queue · ─ · Delete queue (danger)

**Empty state** — `queues` icon, "No queues yet", body explains what queues do, primary "Create your first queue".

---

### 9. Queue create / edit (`/queues/new`, `/queues/:id/edit`)

**This is the heaviest information-architecture change in the redesign (issue 8 in the brief).**

**Layout** — Two-column grid `minmax(0,1fr) 340px`, 20px gap. Right column is **sticky live preview**.

**Left column**

1. **Basics card**: Queue name input + profile select
2. **Schedule card** — the big one:
   - Heading: "When should this queue publish?"
   - Subhead label "Schedule mode" (xs uppercase muted bold)
   - 3 `ModeCard`s in a 3-col grid:
     - **Specific times** (`clock` icon) — `RECOMMENDED` (small accent badge top-right). Hint: "Pick days and exact times. E.g. Mon–Fri at 8am, noon, 3pm."
     - **Fixed interval** (`grid`) — "Clock-aligned slots: every 4h fires at 0/4/8/12/16/20."
     - **Variable interval** (`refresh`) — "N hours after the last publish, regardless of clock."
   - Below the modes, the mode-specific config:
     - **Specific times**:
       - "Publish times" — wrap of time chips. Each chip is a styled `<input type=time>` with × delete. Plus an `+ Add time` dashed button at end.
       - `DayPicker` — 7 day buttons (40×32 each) + "Weekdays" toggle that fills Mon–Fri or clears them.
     - **Fixed interval**: "Every [N] [hours|minutes]" + DayPicker + `HourWindows`.
     - **Variable interval**: "Wait [N] [hours|minutes|days] after each publish" + DayPicker + HourWindows.
   - **HourWindows**: 24-cell grid (12 cols × 2 rows), each cell labeled "12a / 1a … 11p", selected fills accent. "Select all" / "Clear" links right-aligned. Hint "Only fire during the hours you check (your timezone)."
3. **Advanced card**: Start date input · Switch "Recycle posts" with hint "When the queue runs out, start over from the first post." · Internal notes textarea.

**Right column — Live preview card** (sticky)
- Header: lightning icon + "Live preview"
- Hint: "Next 5 publish times based on your current settings."
- 5 rows, each:
  - Numbered badge (1–5, soft accent circle)
  - Day name + date (medium 13) above + mono xs muted time + "America/Detroit" below
  - Right: "in 2h" / "in 1d" mono xs muted
- Footer line summarizing the cadence: "5 weekdays × 3 times = ~15 posts/week"
- If no times/days selected → centered muted "Nothing scheduled — pick at least one day and one time."

**Live preview algorithm**
```
Inputs: mode, times[], days[], every, unit, hourWindows[]
Cursor: "now" (real now for production; for the demo it's Thu May 21 11:00am)
Walk forward up to 14 days, collecting valid publish slots:
  - specific-times: for each enabled day, yield each `times[]` candidate after cursor
  - fixed: for each enabled day, yield h in 0..23 where h % every == 0 AND hourWindows.includes(h) AND candidate > cursor
  - variable: for each enabled day, yield h in hourWindows where candidate > cursor (treat as "earliest opportunity within window after gap"; UI does not need true wait-from-last math)
Stop at 5.
Render times relative to cursor (in Nh / in Nd).
```

**Header actions** — Cancel ghost, Save/Create primary.

**Edit mode** — Same form, prefilled from queue. PageHeader title becomes `Edit {name}`.

---

### 10. Queue detail (`/queues/:id`)

**Purpose** — Quick overview of a queue: cadence summary, status, recent posts.

**Layout**
- PageHeader: title is queue name + status pill inline · actions: Pause/Resume outline · Edit queue outline · Add post primary
- 4-col stat row: Cadence (e.g. "3×" / "weekdays") · Posts in queue · Next run · Profile
- "Schedule" card showing the cadence as a single sentence in `bg-base` mono pill (e.g. `Mon, Tue, Wed, Thu, Fri at 08:00, 12:00, 15:00`)
- Section heading "Posts in queue" + "View all N →" outline button
- Card listing first 4 posts: `#N` mono · text (truncate) · status pill
- Empty state if no posts.

---

### 11. Queue posts (`/queues/:id/posts`)

**Purpose** — Full ordered listing of all posts in a queue, with drag-reorder.

**Columns** — `#` mono | Reorder (up + down icon buttons; in production: drag handle) | Post text | Status pill | Kebab.

---

### 12. Calendar (`/calendar`)

**Purpose** — Visualize scheduled + queued posts on a real calendar.

**Toolbar** (single row, flex-wrap)
- Left group: prev / Today / next buttons + visible-range label
- Right: two labeled `Segmented` controls (issue 24 — disambiguated):
  - "Show: Scheduled / Queued / Both"
  - Profile filter Select (width 160)
  - "View: Month / Week / Day"

**Month view**
- 7-col grid header (Sun…Sat, xs uppercase muted)
- 6-row grid of day cells, `minmax(96px, auto)` row height
- Each cell: day number top-left (today = filled accent circle), event count top-right; events stacked below — each chip shows platform-glyph + mono time + truncated text. Cells from prev/next month fade to 35% opacity.
- Cells from queues use `bg-elevated` chip color; scheduled (one-off) use `brand-accent-soft` chip color.
- Empty days have no chips — but **the grid must always render** even if zero events (this was the bug in issue 3 — `01-calendar.png` showed the day-of-week header but no cells beneath).

**Week view**
- 7-col grid + time gutter (60px). Time rows from 7am to 7pm (13 rows of 44px each).
- Day headers labeled "MON 22" style; today's column has `brand-accent-soft` bg.
- Events render as colored blocks in their hour cell.

**Day view**
- Single column, 24 rows (one per hour). 80px gutter for time labels.
- Active hours (8am–8pm) without events render a dashed-border empty 24px slot (click to create).
- Events render as full-width filled blocks.

---

### 13. Profiles (`/profiles`)

**Purpose** — Manage connected social accounts.

**Layout** — PageHeader + tabbed filter (All / Twitter (5) / LinkedIn (1) / Facebook (1)) + responsive card grid (`auto-fill, minmax(320px, 1fr)`, 12px gap).

**ProfileCard** — fixed columns: identity row · status row · rate row · history footer (4 distinct rows — issue 17)

1. **Identity row**: avatar lg with platform glyph badge in bottom-right corner · name 14/600 · handle mono xs muted · kebab more on the right (menu: Edit profile, Reconnect, Edit rate limit, Delete profile)
2. **Status row**: two pills side-by-side — Active/Inactive/Deprecated pill + platform name pill
3. **Rate limit row** — when `rateMax > 0`: "Rate limit" muted xs label / mono "used/max" tabular right-aligned + 4px progress bar tinted by % (≤60 success, ≤80 warning, >80 danger). For platforms with no per-account rate cap (LinkedIn/Facebook in this app): a single muted xs line "No rate cap on LinkedIn (org-level limits only)"
4. **History footer** — top border, 11px row, muted: "Last: 2h ago" left + "Next: tomorrow 9am" right. Show "No posts yet" / "Nothing scheduled" if null.

**Connect Profile modal** — (issue 7) Tabbed by platform inside the modal so secret-key UI doesn't appear unless you pick Twitter.
- Tab strip with platform-glyph + name (LinkedIn first, then Facebook, then Twitter)
- **LinkedIn/Facebook tabs**: simple info banner "You'll be redirected to {platform} to sign in. After signing in, pick {a Personal Profile or Company Page | which Page you want to post to}." Footer primary: "Sign in with LinkedIn" / "Sign in with Facebook".
- **Twitter tab**: warning banner "Developer App credentials required" + 4 password-style inputs (Consumer Key, Consumer Secret, Access Token, Access Token Secret) each with eye-toggle reveal. Mono helper text linking to setup guide. Footer primary: "Connect Twitter / X".
- Footer: Maybe later ghost + primary action (label depends on tab).

---

### 14. Notifications (`/notifications`)

**Purpose** — Inbox for app events: failures, token health, queue events.

**Issue 12** — severity must be encoded **once**, not 3x (icon + color + label). Use a single colored dot.

**Layout** — PageHeader (actions: Mark all read outline, Clear read outline) + filter row (Segmented All/Unread/Read + type Select All types/Errors/Warnings/Info) + list card.

**Row format** — 4-col grid `auto 1fr auto auto`:
- Col 1: 8px colored dot, vertically aligned top + 5px (severity = `error`→danger, `warning`→warning, `info`→info). **This is the only severity indicator.** No icon, no colored row bg, no status pill (issue 12).
- Col 2: title (13/600 if unread, 13/400 if read) + 6px accent dot if unread + body muted xs below
- Col 3: time string muted xs right-aligned
- Col 4: contextual action — Error → "View post" outline; Warning → "Reconnect" outline; Info → x dismiss icon button.

**Bulk** (issue 25) — "Mark all read" disabled if 0 unread; "Clear read" wipes only read items. No "delete all" — read items auto-prune after 90 days.

**Bell flyout (in topbar)** — 380px wide, anchored under bell. Header: title + Mark-all-read link. 4 most recent rows (same compact format, smaller). Footer: "View all →" → `/notifications`.

---

### 15. Settings (`/settings/:tab`)

**Purpose** — Account, preferences, security, snippets, advanced.

**Tabs are unified** — Snippets is a peer of the other settings tabs (issue 9). Order: **Profile · Preferences · Security · Notifications · Snippets · Storage · Advanced** (each labeled, with a 13px leading icon).

Tabs use bottom-border-active style: `border-bottom: 2px solid brand-accent` on the active tab.

#### 15a. Settings → Profile
- Avatar lg + "Upload avatar" outline button + supported-formats hint
- 2-col grid of inputs: First name, Last name, Username, Email
- "Save profile" primary, right-aligned

#### 15b. Settings → Preferences
- Vertical stack of selects: Timezone, Date format, Entries per page, Default landing page
- "Save preferences" primary

#### 15c. Settings → Security
Sections separated by `divider`:
- **Password** — "Last changed 3 months ago" sub · "Change password" outline button
- **Two-factor authentication** — pill "Off" or "On" · sub · "Set up 2FA" / "Manage 2FA" outline
- **Security questions** — sub · "Configure" outline
- **Active sessions** (issue 2) — **"1 active session (last 7 days). 3 stale sessions cleaned up automatically each night."** Below: one card showing the current session (location, last-active timestamp, browser/OS) with a "Current" pill. "Sign out everywhere else" outline button below the card. **Do not display the raw 3,470 session count** — show only meaningful sessions.
- **Last login** — single line, no card

#### 15d. Settings → Notifications
- **Warning banner** at top if SMTP isn't configured: "Email notifications are off — SMTP isn't configured. Add `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` env vars to enable."
- "Notification events" card with a 3-col table:
  - Event (name + hint + optional "Required — cannot be disabled" caption)
  - In-app switch
  - Email switch (faded to 40% opacity if SMTP not configured; clicks still toggle the persisted preference, but actual delivery is suppressed server-side)
- Events:
  - Publish failed
  - Token expiring soon
  - Re-authentication required *(required)*
  - Token revoked *(required)*
  - Rate limit reached
  - Queue finished
  - Bulk import complete

#### 15e. Settings → Snippets
- Page-style header: title + "New snippet" primary
- Search input above the list
- Table: Name (mono) · Category (pill) · Preview (muted) · Updated (xs) · Kebab
- Click row → opens edit modal (title, name, category, body textarea, save/cancel)

#### 15f. Settings → Storage
- Title card: huge value "0 MB" tabular + sub "of ∞ (self-hosted, your disk)" + storage icon
- Empty state below if no media: "No media uploaded yet" — when there IS media, this becomes a media-browser grid.

#### 15g. Settings → Advanced
Three cards stacked:
1. **Worker queue inspector** (issue 26) — info banner explaining Bull Board is a separate tool. Row with name/sub + outline button "Open in new tab" → navigates to `/settings/advanced/bull-board`. Sub line: "3 worker queues: `publish`, `notification`, `bulk-ops`".
2. **System** — 2-col grid of `Row`s (label muted + value mono on the right of each row, dashed bottom border):
   - Version · Database · Worker process (status pill) · Redis (status pill) · SMTP (status pill) · Uptime
3. **Danger zone** — "Export all data" outline + "Reset application" danger button

---

### 16. Worker queue inspector (`/settings/advanced/bull-board`)

**Purpose** — Embed Bull Board for ops debugging, but make it clear it's a third-party tool.

**Layout**
- Breadcrumb: Settings → Advanced → Worker queue inspector
- PageHeader: title + subtitle "Background-job admin powered by Bull Board (BullMQ)."
- Info banner "You're about to leave the Clicks & Mortar UI — Bull Board is a third-party operator dashboard with its own styling…"
- 3-col grid of BullCards (one per queue): `publish` watch / `notification` issue (alert sub-row) / `bulk-ops` healthy
- Card containing the iframe:
  - 14px header strip: `bg #f5f3f1` + dark text + info icon + "Embedded Bull Board — light theme, separate design language. Press Esc to return here." + "Open in new tab" outline right
  - iframe content area below (in real app, this is `<iframe src="/admin/bull-board" />` 360px+ tall)

---

## Components (reusable)

These map to whatever component library the codebase uses. Implement each as a real component, not inline JSX.

| Name | Notes |
|---|---|
| `Button` | variants: default, primary, accent, ghost, outline, danger; sizes: sm, default, lg; leading + trailing icons |
| `IconButton` | square 28px, ghost-style hover |
| `Icon` | wraps Lucide icons; default 16px |
| `Avatar` | sm/md/lg; initials computed from name; optional `platform` glyph badge in bottom-right |
| `PlatformGlyph` | rounded-rect monogram (𝕏 / in / f), tinted per platform; sizes 9/11/12/14/16 |
| `Pill` | tones: neutral, success, warning, danger, info, brand; optional dot, optional icon |
| `StatusPill` | wraps Pill — maps status strings to (tone, icon, label) |
| `Input` | label, hint, error, optional icon prefix |
| `Textarea` | label, hint, error |
| `Select` | label, hint, native select styled to match Input |
| `Switch` | track 32x18, optional label + hint stacked right |
| `Checkbox` | 16x16, brand-accent when checked |
| `Radio` | 16x16, brand-accent fill when checked |
| `Segmented` | inline group, active state has `bg-active` + shadow-sm |
| `Menu` | absolutely-positioned popover, click-outside dismiss; `MenuItem` with optional icon + danger styling; `menu-section-label` and `menu-divider` |
| `Card` | optional title + action; `padded` prop |
| `PageHeader` | breadcrumb + title + subtitle + right action slot |
| `EmptyState` | icon, title, body, action |
| `Banner` | info, warning, danger tones; optional title; right-aligned action slot |
| `Modal` | backdrop blur, max-width prop, header (title + subtitle + close), body, footer |
| `Kbd` | inline keyboard hint |

---

## Status pills — final spec

All status pills follow the same outline pattern (issue 18): soft-tinted background, no border, leading icon (when applicable), label. Sizes are 22px tall, 11px font, weight 500.

| status | tone | icon | label | dot |
|---|---|---|---|---|
| `scheduled` | info | clock | Scheduled | — |
| `queued` | neutral | queues | Queued | — |
| `draft` | neutral | edit | Draft | — |
| `published` | success | check | Published | — |
| `failed` | danger | error | Failed | — |
| `active` | success | — | Active | yes |
| `paused` | warning | pause | Paused | — |
| `deprecated` | neutral | — | Deprecated | yes |

---

## Issue → Resolution Map

Cross-reference with `UI-UX-BRIEF.md`:

| # | Issue | Resolution |
|---|---|---|
| 1 | Sidebar active state mismatch | Active nav resolved via route prefix (compose/import → Posts, queue-* → Queues, settings-* and admin-queues → Settings). |
| 2 | 3,470 active sessions | Show "1 active session, 3 stale auto-pruned nightly" — keep the raw number out of the UI. |
| 3 | Calendar empty grid | Month grid always renders 6 weeks of cells; empty days simply have no chips. |
| 4 | "Tweet text" on non-Twitter posts | Composer labels (textLabel, previewLabel, placeholder, media hint, char limit) swap by `platform`. |
| 5 | Inconsistent profile display | All profile displays use the same molecule (platform glyph + name + mono handle + deprecated pill). |
| 6 | Empty dashboard | Status strip + 24h timeline + Active queues + Rate limits — 4 widgets with real signal. |
| 7 | Twitter creds always visible | Connect modal is tabbed by platform; Twitter dev-app fields only shown on the Twitter tab. |
| 8 | Opaque queue create | New "Specific times" mode + live "next 5 publish times" preview sidebar. |
| 9 | Snippets not in Settings | Snippets is now a sibling Settings tab. |
| 10 | Date/time inputs | Composer schedule input + 4 quick chips (In 1h / Tonight 8pm / Tomorrow 9am / Next Mon 9am). |
| 11 | "x" delete-looking platform icons | Replaced with platform-glyph chips (letter monograms). |
| 12 | Notification severity over-encoded | Single colored 8px dot. No row-tint, no icon, no status pill on rows. |
| 13 | Failure reason | Expanded-row reveals full text + danger banner with the verbatim reason + Retry button + history. |
| 14 | Import "Don't Import" CTA | Footer ghost is "← Back to posts"; never destructive copy. |
| 15 | Bulk actions popover anchoring | `Menu` is absolute-positioned under its trigger with click-outside dismiss; sections grouped with labels. |
| 16 | "Resets" repetition on dashboard | Single footer "All reset Jun 1 (10 days)". |
| 17 | ProfileCard hierarchy | 4 fixed rows: identity, status, rate, history. |
| 18 | Status pills inconsistent | Single component for all statuses, outlined with soft tint + icon. |
| 19 | Spinnable text confusion | Switch reveals 3 live-rendering previews; mono code-syntax in hint. |
| 20 | Breadcrumbs | PageHeader's optional `breadcrumb` prop used on Composer, Import, Queue-* screens, Settings advanced. |
| 21 | Light/dark tokens | Tokens defined for both themes; toggle via Settings → Preferences (or Tweaks panel in the mock). |
| 22 | Forgot password discoverability | Dedicated footer link "Recover account →" inside the login card. |
| 23 | Recovery step-N feedback | 3-segment progress bar + "STEP N OF 3" label. |
| 24 | Calendar filter/view collision | Two labeled segmented controls ("Show:" / "View:") visually separated. |
| 25 | Notification bulk actions | "Mark all read" + "Clear read" in PageHeader; flyout has "Mark all read"; rows have contextual single-action button. |
| 26 | Bull Board jarring | Framed under Settings → Advanced as a third-party tool, with explanation banners and an intentional theme-switch header strip. |
| 27 | Brand identity | Clicks & Mortar palette (dark crimson, accent red, charcoal) drives the entire app. |

---

## Brand Guidelines

The company is **Clicks & Mortar Websites**. The two reference docs `brand-guidelines.md` and `brand-colors.md` are in this bundle.

Key visual identity rules used:
- Dark crimson `#640f0d` for primary brand surfaces; bright red `#ed474a` for interactive accents and danger. Charcoal `#231f20` for text + the dark-surface family.
- Logo (not used in this app yet — fall back to the Brandmark component or wait until a real logo file is in the codebase).
- Tagline: "Building websites without the upfront costs."

---

## State Management

Sketch only — fit to the codebase's actual patterns.

### Server data (React Query / SWR / whatever)
- `useProfiles()` — list of profiles
- `useProfile(id)` — single profile detail
- `usePosts({ status, profile, search, tags, cursor })` — paginated
- `usePost(id)` — single post
- `useQueues()` — list
- `useQueue(id)` — detail
- `useQueuePosts(id, { cursor })` — ordered list
- `useNotifications({ read, type, cursor })` + `useUnreadCount()` for the bell badge
- `useSettings()` for preferences/notifications-prefs/security
- `useStorageUsage()`
- `useRateLimits()` (poll every 60s for dashboard)

### Mutations
- `createPost`, `updatePost`, `deletePost(s)`, `retryPost(id)`
- `createQueue`, `updateQueue`, `deleteQueue`, `pauseQueue`, `resumeQueue`, `addPostToQueue`, `reorderQueuePosts`
- `connectProfile(platform, payload)`, `disconnectProfile(id)`, `reconnectProfile(id)`, `updateProfileRateLimit(id, max)`
- `markNotificationRead`, `markAllRead`, `clearReadNotifications`
- `updatePassword`, `updateProfile`, `updatePreferences`, `setup2FA`, `disable2FA`, `signOutAllOther`
- `createSnippet`, `updateSnippet`, `deleteSnippet`
- `exportAllData`, `resetApplication`

### Client state
- Theme + density (persisted in localStorage; defaults to dark/regular)
- Sidebar collapsed (localStorage)
- Bulk selection on Posts (component-local, cleared on filter change)
- Composer in-progress form (component-local; consider draft autosave server-side every N seconds)

### Validation rules to enforce client + server
- Post text: ≤ platform's character limit; >0 chars required to schedule
- Schedule time: must be in the future (server enforces)
- Queue name: 1–60 chars, unique per user
- Queue specific-times: ≥ 1 day AND ≥ 1 time selected
- Queue fixed: `every > 0`; `hourWindows.length > 0`
- Snippet name: 1–40 chars, lowercase-kebab, unique
- Password: ≥ 12 chars

---

## Assets

No image assets ship in this bundle. Things to provide:
- **Real Clicks & Mortar logo** — drop into `public/` and reference in `Brandmark` component. The demo's Brandmark is a placeholder rounded-square; replace with the SVG export of the official logo (or use the existing JPG from the brand-guidelines reference at small size). Until then, keep the placeholder.
- **Fonts** — Inter Tight and JetBrains Mono are loaded from Google Fonts in the demo. If self-hosting fonts is preferred, vendor them through the codebase's existing font-loading pattern.
- **Icons** — `lucide-react`. No SVG inlining required.

---

## Accessibility checklist

- All form fields have associated labels (via `<label for>`).
- Toggle switches expose `aria-pressed`; checkboxes/radios expose `aria-checked` + `role`.
- Focus rings: `0 0 0 3px rgba(237,71,74,0.25)` on focus-visible. Do NOT remove default outline without a visible replacement.
- Keyboard: all menus dismissible via Esc; arrow-key navigation within Menu and Segmented; Cmd/Ctrl-K opens topbar search.
- Color is never the only signal for status — every status pill has a text label (and most have an icon).
- Notifications page: each dot has an `aria-label` like "Error severity".
- Modal: focus traps inside; Esc closes; restores focus to trigger.
- Tables: `<th scope="col">` on headers; bulk-select checkbox has `aria-label`.
- Dark/light theme: respect `prefers-color-scheme: light` on first load unless the user explicitly chose a theme.

---

## Performance notes

- Calendar month view re-renders all 42 cells whenever filters change; memoize per-day event arrays.
- Posts table: paginate server-side; cursor-based, 50 rows/page by default (per Preferences setting).
- Bell badge unread count: lightweight `/notifications/unread-count` poll every 30s, or websocket if the codebase has one.
- Dashboard 24h timeline can be computed entirely client-side from `useUpcomingPosts({ window: 24h })`.
- Snippet picker modal: snippets are small; load all upfront and filter client-side.

---

## Files in this bundle

### `design_files/`
- `Social Media Scheduler.html` — entry HTML (loads all scripts)
- `styles/tokens.css` — design tokens + base component CSS
- `scripts/`
  - `tweaks-panel.jsx` — in-design tweak controls (NOT for production)
  - `data.jsx` — `Icon`, `PlatformGlyph`, fixture data (PROFILES, QUEUES, POSTS, NOTIFICATIONS, SNIPPETS) — **for reference only, use real data sources in prod**
  - `primitives.jsx` — Button, Pill, Input, Card, Modal, etc. — reference implementations
  - `screens-auth-dashboard.jsx` — Login, Recover, Setup, Dashboard, Brandmark
  - `screens-posts.jsx` — PostsList, Composer, Import
  - `screens-queues.jsx` — QueuesList, QueueCreate, QueueDetail, QueuePosts
  - `screens-rest.jsx` — Calendar, Profiles, Notifications, Settings, AdminQueues
  - `app.jsx` — sidebar, topbar, router, tweaks wiring (the in-memory router is a demo crutch — use the codebase's router in production)

### Reference docs
- `UI-UX-BRIEF.md` — the original audit
- `brand-guidelines.md`, `brand-colors.md` — Clicks & Mortar brand reference

---

## How to use this handoff with Claude Code

1. Open the target codebase in Claude Code.
2. Drop this handoff folder (or its zip) at the repo root, or somewhere Claude Code can read it.
3. Ask Claude Code something like:
   > "Read `design_handoff_sms_redesign/CLAUDE.md` and `IMPLEMENTATION_PLAN.md`. We're rebuilding our scheduler UI to match this design inside our existing Vite + React app. Work through the milestones in order. Don't lift the demo HTML wholesale — match our existing patterns in `src/`."

`CLAUDE.md` lays out the operating rules; `IMPLEMENTATION_PLAN.md` is a 12-milestone schedule; this README is the per-screen spec; `API_CONTRACT.md` is the data shape the UI consumes. `screenshots/INDEX.md` maps screen names to PNG references. Together they're self-contained — a developer who wasn't in our conversation can implement the design from these files alone.
