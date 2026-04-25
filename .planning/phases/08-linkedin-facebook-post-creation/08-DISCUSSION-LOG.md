# Phase 8: LinkedIn & Facebook Post Creation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 08-linkedin-facebook-post-creation
**Areas discussed:** Form architecture, Rate-limit enforcement, Preview fidelity, Usage widget placement

---

## Form architecture

### Q1: How should the post-creation UI be structured across platforms?

| Option | Description | Selected |
|--------|-------------|----------|
| One shared form, platform-aware | Existing `NewPostPage` gains a profile-driven platform selector and conditionally renders fields. Less duplication, one routing path. | ✓ |
| Separate page per platform | Routes `/posts/new/twitter`, `/posts/new/linkedin`, `/posts/new/facebook` with their own page components. | |
| Shared shell + platform tabs | Single `/posts/new` page with a tab strip across the top. Lets users compare platforms but adds tab-switch state-management headaches. | |

**User's choice:** One shared form, platform-aware
**Notes:** Recommended option accepted.

### Q2: How should the post payload schema be modeled?

| Option | Description | Selected |
|--------|-------------|----------|
| Discriminated union per platform | `z.discriminatedUnion('platform', [twitter, linkedin, facebook])`. Each variant locks its own char limit, fields, media constraints. | ✓ |
| Extend the current schema with optional fields | Add visibility, linkUrl, raise mediaIds count and text max with platform-specific `.refine()` guards. | |
| Three separate schemas, no union | `createTwitterPostSchema`, `createLinkedInPostSchema`, `createFacebookPostSchema` exported independently. | |

**User's choice:** Discriminated union per platform
**Notes:** Recommended option accepted.

### Q3: What's the entry flow into the post form — how does the user pick the target?

| Option | Description | Selected |
|--------|-------------|----------|
| Profile picker drives platform | Single 'New Post' button. Form opens with profile picker; choosing a profile sets platform and reveals platform-specific fields. | ✓ |
| Per-platform 'New Post' buttons | Three buttons in the nav: 'New Tweet', 'New LinkedIn Post', 'New Facebook Post'. | |
| Platform picker then profile | Click 'New Post' → modal asking 'Which platform?' → form opens scoped to chosen platform. | |

**User's choice:** Profile picker drives platform
**Notes:** Recommended option accepted.

### Q4: When the user switches profile mid-compose to a different platform, what happens to the draft?

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve text, drop incompatible fields, warn | Text content carries over (truncated if needed); platform-specific fields drop with an inline toast. | ✓ |
| Confirm before switching, then reset | Confirmation dialog; on confirm, all fields clear except profile picker. | |
| Block cross-platform switches in-form | Profile picker only shows profiles on the current platform. | |

**User's choice:** Preserve text, drop incompatible fields, warn
**Notes:** Recommended option accepted.

---

## Rate-limit enforcement

### Q1: How aggressive should rate-limit enforcement be for LinkedIn and Facebook?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard block at limit, warn at 90% | Pre-flight check refuses to publish at >= limit. Banner at >= 90%. Mirrors Twitter. | ✓ |
| Soft warn, never block | Banner at 90% but publish proceeds; rely on platform to throttle with retry. | |
| Hybrid — hard block on Twitter, soft warn on LI/FB | Keep Twitter's hard block, LI/FB get warn-only. | |

**User's choice:** Hard block at limit, warn at 90%
**Notes:** Recommended option accepted. Consistent UX across all three platforms.

### Q2: How should rate-limit windows be tracked and reset for LI/FB?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-platform window in `social_profiles`, reset by query | Columns `linkedin_daily_count`, `linkedin_window_start_utc`, `facebook_hourly_count`, `facebook_window_start_utc`. Reset on read. No scheduler job. | ✓ |
| Scheduled BullMQ resetter | Repeatable job runs hourly (FB) and at midnight UTC (LI) to reset counts. | |
| Sliding window via `post_attempts` query | No counters; query attempt log for `COUNT(*)` within window. True sliding window. | |

**User's choice:** Per-platform window in `social_profiles`, reset by query
**Notes:** Recommended option accepted.

### Q3: When a publish is blocked by rate limit, how should the worker treat the post?

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful abort, post stays scheduled, retry next window | Mirrors `token_unhealthy` abort: no retry consumed, post auto-publishes when window rolls over. | ✓ |
| Move to failed, require manual retry | Post moves to 'failed', user clicks Retry. | |
| Backoff with full retry budget | Treat rate-limit as transient — 4 retries with exponential backoff. | |

**User's choice:** Graceful abort, post stays scheduled, retry next window
**Notes:** Recommended option accepted.

### Q4: Should the dashboard rate-limit widget include a manual reset / override for power-user debugging?

| Option | Description | Selected |
|--------|-------------|----------|
| No override | Widget is read-only. Counters reset organically. | ✓ |
| Reset button per profile, behind confirm dialog | Admin-only 'Reset window' button to recover from drift. | |
| Edit-window-start override | Power user can edit `window_start_utc` directly. Maximum flexibility, maximum footgun. | |

**User's choice:** No override
**Notes:** Recommended option accepted. Drift recovery deferred — see deferred ideas.

---

## Preview fidelity

### Q1: How close should the LinkedIn / Facebook live preview look to the real platform?

| Option | Description | Selected |
|--------|-------------|----------|
| Medium fidelity — structured layout, no brand polish | Card with avatar placeholder, profile name, faint visibility/timestamp, post text, media in platform's grid order. Generic neutral styling. | ✓ |
| Low fidelity — text-only with character count | Just the rendered text in a monospace box plus the char-count ring. Media as filename chips. | |
| High fidelity — platform-styled mock | CSS approximating real LinkedIn/Facebook UI with brand fonts, link styling, action buttons. | |

**User's choice:** Medium fidelity — structured layout, no brand polish
**Notes:** Recommended option accepted.

### Q2: Should the preview fetch the live URL to render a real link unfurl card?

| Option | Description | Selected |
|--------|-------------|----------|
| No — show URL as plain text in preview | Preview just shows the URL as it'll appear in the post. | ✓ |
| Yes — debounced og:image fetch, render unfurl card | Server-side opengraph fetch with debounce. | |
| Yes for Facebook only | FB has explicit URL field (POST-FB-04); skip for LI. Mixed approach. | |

**User's choice:** No — show URL as plain text in preview
**Notes:** Recommended option accepted. Avoids SSRF and keystroke-fetch cost. Deferred for future polish.

### Q3: Should the preview be pinned beside the form or placed below it?

| Option | Description | Selected |
|--------|-------------|----------|
| Two-column on desktop, stacked on mobile | Form left, sticky preview right >= 1024px. Below 1024px, preview moves under the form. Matches existing `TweetPreview`. | ✓ |
| Always stacked (preview below form) | Simpler responsive behavior. Loses side-by-side compare-as-you-type feel. | |
| Collapsible accordion above the form | Preview hidden by default, click to expand. | |

**User's choice:** Two-column on desktop, stacked on mobile
**Notes:** Recommended option accepted.

### Q4: How should spinnable text `{a|b|c}` render in the LI/FB preview?

| Option | Description | Selected |
|--------|-------------|----------|
| Show all variants highlighted | Render `{a|b|c}` as a subtle inline highlight matching existing Twitter preview. | ✓ |
| Render one rolled variant per render | Each keystroke re-rolls the variant in the preview. | |
| Plain text — strip the syntax | Preview shows the text with `{a|b|c}` removed. | |

**User's choice:** Show all variants highlighted
**Notes:** Recommended option accepted. `SpinnableVariantsDialog` handles the per-variant view.

---

## Usage widget placement

### Q1: Where does the rate-limit usage widget live?

| Option | Description | Selected |
|--------|-------------|----------|
| Both — dashboard summary + per-profile chip | `/dashboard` "Rate Limits" card with all profiles + compact chip on each `ProfileCard`. Shared component, two layouts. | ✓ |
| Dashboard widget only | Single widget on `/dashboard`. | |
| `ProfileCard` chip only, no separate dashboard widget | Skip the dashboard widget entirely. Pushes back on LIMIT-08 wording. | |

**User's choice:** Both — dashboard summary + per-profile chip
**Notes:** Recommended option accepted. Note: `/dashboard` route does not currently exist and will be introduced in Phase 8.

### Q2: Does the rate-limit widget show the upcoming window reset time?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, formatted relative + absolute | "Resets in 47m (3:00 PM ET)". Respects user's configured timezone and date format. | ✓ |
| Yes, but only when at >= 80% usage | Hidden in green zone, appears once usage crosses threshold. | |
| No reset display — just current/limit | Widget shows just "47/200 calls today". | |

**User's choice:** Yes, formatted relative + absolute
**Notes:** Recommended option accepted.

### Q3: Should the dashboard expose a recent-publish-activity sparkline / chart, or stay numeric-only?

| Option | Description | Selected |
|--------|-------------|----------|
| Numeric-only for v1 | Just current/limit + color bar + reset time. Charts deferred. | ✓ |
| 7-day publish-count sparkline per platform | Tiny inline sparkline beside each profile row showing daily counts for the last 7 days. | |
| Full activity timeline view as a separate page | `/dashboard/activity` with full per-platform timeline. | |

**User's choice:** Numeric-only for v1
**Notes:** Recommended option accepted. Activity charts moved to deferred ideas.

---

## Claude's Discretion

- Specific column names for the new `social_profiles` rate-limit columns (snake_case convention).
- Exact wording of inline toasts and banner messages (matching Phase 7's platform-specific copy patterns).
- Whether to fold the rate-limit widget into `packages/web/src/components/posts/` or a new `dashboard/` folder.
- Drizzle migration filename and number (next available, currently `0006`).

## Deferred Ideas

- Activity-over-time charts on the dashboard (sparklines, full timeline page) — future polish phase.
- Manual rate-limit window reset / override for admin debugging — backlog if drift becomes a real problem.
- High-fidelity (screenshot-style) post preview — revisit if medium fidelity proves insufficient.
- Live link-unfurl fetching with og:image preview — needs SSRF mitigations; defer until we hit a real pain point.
