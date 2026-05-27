# Social Media Scheduler — Screenshot Index

**Captured:** 2026-05-21
**App:** Vite + React frontend, Node.js + Express API, Docker Compose stack
**Auth:** logged in as `codex-local@example.com` (dev fixture)
**Viewport:** 1440 × 900 (typical desktop)
**Theme:** dark (only theme implemented)

## Layout

```
01-public/         — login, recover, setup (unauthenticated)
02-dashboard/      — landing page after auth
03-posts/          — Posts list, composer, edit, import, bulk-actions, snippet picker
04-queues/         — Queues list, creation form (both interval-type variants), detail, edit, posts, actions menu
05-calendar/       — Calendar in Month / Week / Day views
06-profiles/       — Profiles list, Connect-Profile modal, kebab menu, delete confirmation
07-notifications/  — Notifications page, bell flyout
08-settings/       — Settings tabs (Profile / Preferences / Security / Notifications / Storage), Snippets, Email logs
09-admin/          — "Admin queues" redirect *to* Bull Board
09-admin/bull-board/ — Bull Board itself (the actual operator backend for BullMQ — different design system, light theme)
```

## Notable empty states / data states

- `04-queues/01-queues-list.png` — only one queue defined; minimal data
- `05-calendar/01-calendar.png` and `05-calendar/05-calendar-month-full.png` — **the calendar grid renders the week-header bar with no day cells underneath**. Bug or empty-state edge case worth flagging.
- `06-profiles/01-profiles-list.png` — 5 Twitter profiles connected; no LinkedIn or Facebook profiles exist, so LinkedIn/Facebook-specific composer states could not be captured.
- `07-notifications/01-notifications.png` — long error-heavy history, useful for understanding what failure messages look like.

## Captures that exercise platform behavior I couldn't get past

- **LinkedIn / Facebook composer specifics** — no connected profile of those platforms in the dev DB, so the "Tweet text"-style relabeling for other platforms isn't represented.
- **Login → 2FA challenge** — TOTP is disabled on the dev account (visible in `08-settings/01b-settings-security.png`), so the 2FA challenge screen is not captured.
- **First-time-setup wizard** — `01-public/03-setup.png` is the page itself, but the post-account-creation onboarding (if any) isn't visible because the SetupGuard redirects authenticated users away.

See `UI-UX-BRIEF.md` for the analysis to hand to Claude Design alongside these.
