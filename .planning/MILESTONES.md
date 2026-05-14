# Milestone Log: Social Media Scheduler

A cumulative record of shipped milestones. Each entry captures what shipped, what was deferred, and where the archived state lives.

---

## v1.0 — MVP

**Status:** Pending PR merge
**Closed (pre-merge):** 2026-05-05
**Span:** 2026-04-07 → 2026-05-05 (~28 days)

### Phases included

- Phase 1: Infrastructure & Foundation
- Phase 2: Authentication & User Account
- Phase 3: Twitter Profile & Post Creation
- Phase 4: Publish Worker & Scheduled Posts
- Phase 5: Queue Engine
- Phase 6: Media Handling (+ 6.1 Production Deployment Wiring, 6.2 Test & Build Stabilization, 6.3 Queue Engine Bug Fixes, 6.4 Wire Media-Post Association, 6.5 Nginx Proxy Completion, 6.6 Twitter Publish Path Completion)
- Phase 7: Multi-Platform Profiles & Token Lifecycle (+ 7.1 Profile UX Polish)
- Phase 8: LinkedIn & Facebook Post Creation (+ 8.1 Rate Limit Dashboard Widget)
- Phase 9: Notifications & Settings (+ 9.1 Polish, 9.2 Tech Debt Sweep)
- Phase 10: Bulk Operations
- Phase 11: Snippets, Search, Calendar & Polish

Total: 21 phase entries (incl. minor sub-phases) covering 11 substantive feature areas.

### Headline outcomes

- Self-hosted Docker Compose stack (api, worker, web, nginx, postgres, redis) with health-checked services and TLS termination
- Argon2id auth with sessions, 2FA via TOTP, password recovery
- Three platform integrations live: Twitter (OAuth 1.0a, full tweet/thread/media), LinkedIn (Posts API), Facebook (Page posting via Meta SDK)
- Encrypted-at-rest OAuth token storage with token-health badges and auto-refresh
- BullMQ-backed publish pipeline with retry, rate-limit pre-flight, dead-letter, post recycling, queue engine, auto-destruct
- Media handling: image thumbnails (sharp), video transcoding (ffmpeg), local + S3-compatible storage
- CSV bulk import/export, queue copy/dedupe/modify/purge/randomize, bulk pause/resume/delete
- Notifications (in-app bell + SMTP) with per-event preferences and email log
- Snippets (templated text, `{{snippet:name}}` substitution in CSV imports), Postgres FTS search across posts/queues with `ts_headline` highlighting, react-big-calendar M/W/D views with conflict indicators
- SEC-07 OpenAI key handling policy + pino redact + BullMQ schema enumeration test (pre-emptive — no AI endpoint exists yet)

### Requirements

- **117 / 138 v1 requirements satisfied** at close (84.8%)
- 21 open items at close — see Known Gaps below

### Known gaps at close

Documented partials from earlier shipped phases that the team chose to ship:

- **PROFILE-05/06/07:** Profile list missing next-scheduled-run column, no platform-filter UI, markdown notes field absent
- **TOKEN-05:** Expired-token exclusion logging not fully wired
- **POST-TW-02..05:** Twitter media + thread composition UI present; worker rejects multi-media and threads at the publish path (`twitter-publish.service.ts:54-58`)
- **STATE-02:** Posts in `publishing` state — schema enforces, API 409 guard missing on POST/PATCH/DELETE /api/posts/:id
- **LIMIT-08:** Per-profile rate-limit chip exists; aggregated dashboard widget missing
- **BULK-01..11:** Implementation merged with Phase 10; checkbox state in REQUIREMENTS.md still shows pending due to delayed bookkeeping

### Phase 11 manual verification deferred to post-ship sweep

Documented in `.planning/phases/11-snippets-search-calendar-polish/11-UAT.md`:

- Test 9 — iOS Safari snippet picker cursor (real device unavailable; cursor-capture-on-pointerdown is the iOS-specific defense, regression tested in jsdom)
- Test 12 — search highlight WCAG AA contrast in light theme (dark theme verified against real built DOM)
- Test 20 — calendar entry click → `/posts/:id/edit` (route works in production-like build; pointer translation failed in in-app browser surface)

Backlog test-coverage items filed as GitHub issues:

- #41 — SnippetPicker arrow-nav + Enter regression test
- #42 — Calendar today-cell highlighting regression test
- #43 — Calendar conflict tooltip interaction regression test

### Archive

- ROADMAP snapshot: `.planning/milestones/v1.0-ROADMAP.md`
- REQUIREMENTS snapshot: `.planning/milestones/v1.0-REQUIREMENTS.md`
- Phase artifacts: `.planning/phases/01-*` through `.planning/phases/11-*`

### Pending post-merge tasks

These run AFTER the Phase 11 PR merges to main:

- Tag `v1.0` on the merge commit on `main`
- Rewrite `ROADMAP.md` in place with milestone grouping (preserve Backlog section) per the canonical complete-milestone workflow
- `git rm REQUIREMENTS.md` so v1.1 starts with a fresh requirements scope (snapshot already preserved at `.planning/milestones/v1.0-REQUIREMENTS.md`)
- PROJECT.md evolution review — capture how the project's understanding of itself evolved through v1.0
