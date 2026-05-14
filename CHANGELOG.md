# Changelog

All notable changes to the Social Media Scheduler are recorded here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] — 2026-05-14

Hotfix for the first-deploy CSRF / session-cookie failure surfaced by
the v1.0.0 production deploy. Without this patch, ANY POST behind a
TLS-terminating reverse proxy returns `403 invalid csrf token` —
including `/api/auth/setup`, blocking initial account creation.

### Fixed

- **Trust-proxy + X-Forwarded-Proto passthrough** (#50) — `packages/api/src/app.ts`
  now calls `app.set('trust proxy', 1)` so Express honors `X-Forwarded-Proto`
  set by the immediately-upstream nginx; secure session and CSRF cookies
  now actually get set in production. `nginx/nginx.conf` no longer
  overwrites `X-Forwarded-Proto` with `$scheme` — it passes through what
  the external reverse proxy (Cloudflare Tunnel / Caddy / Traefik /
  external nginx) already forwarded, falling back to `$scheme` only when
  the upstream chain didn't send the header at all (direct LAN access).
  Regression tests in `packages/api/src/__tests__/middleware.test.ts`
  pin the configuration.

### Operator note for v1.0.0 → v1.0.1

External reverse proxies in front of the LXC should already be setting
`X-Forwarded-Proto: https` — Cloudflare Tunnel, Caddy, and Traefik do
this by default. Custom nginx LAN reverse proxies need:

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

To upgrade in place: `git pull && git checkout v1.0.1 && docker compose up -d --build`.

## [1.0.0] — 2026-05-14

First production release. Brings the self-hosted scheduler from empty
repo to a feature-complete SocialOomph replacement: compose, queue,
schedule, and publish posts to Twitter/X, LinkedIn, and Facebook from
your own Docker Compose stack on Proxmox.

### Added

#### Core platform (Phases 1–4)
- **Bootstrap & monorepo** — pnpm workspace with `@sms/api`, `@sms/worker`,
  `@sms/web`, `@sms/db`, `@sms/shared`. Docker Compose stack: PostgreSQL 17,
  Redis 7.4, nginx, multi-stage Dockerfile with non-root prod users and
  ffmpeg for media transcoding.
- **Authentication & user accounts** (#1) — argon2id password hashing,
  express-session + connect-redis, CSRF protection via `csrf-csrf`,
  TOTP 2FA via `otpauth`, recovery codes, password reset flow, session
  invalidation, login throttling, audit logging.
- **Twitter profile connection & post creation** (#2) — OAuth 1.0a flow
  for connecting personal Twitter Developer Apps, encrypted token storage
  (AES-256-GCM, keyed by env var only), Twitter character counting via
  `twitter-text`, post composer with media attachments, scheduled-time
  picker with IANA-timezone support.
- **Publish worker & scheduled posts** (#3) — BullMQ-backed publish queue,
  optimistic-version control, transactional Phase 1 lock → Phase 2 Twitter
  call → Phase 3 commit lifecycle. Post-attempt history per try, scheduled
  history modal, retry semantics with classified error mapping.
- **Queue engine & scheduling polish** (#4) — DST-safe scheduling, queue
  scanner re-enqueue, bull-board admin panel, monthly free-tier budget
  tracking, runtime budget pre-flight (D-26 / LIMIT-03).

#### Media (Phase 6)
- **Media handling end-to-end** (#5) — multer disk uploads, sharp
  thumbnails (300px), fluent-ffmpeg video transcoding in a dedicated
  BullMQ queue with 5-minute timeout, MEDIA-05 pending-media gate so
  posts wait on transcode completion, media-cleanup worker, storage
  abstraction over local filesystem with optional S3-compatible backend.

#### Multi-platform & token lifecycle (Phase 7)
- **Multi-platform profiles & token lifecycle** (#30) — LinkedIn and
  Facebook OAuth flows alongside Twitter, per-platform token health
  states (`active` / `expiring` / `needs_reauth` / `expired` / `revoked`),
  token-refresh scanner with proactive renewal, token-revocation
  detection, mismatched-account picker dialog, reconnect flow that
  preserves scheduled post associations, token health badges on profile
  cards.

#### Platform posting & limits (Phase 8)
- **LinkedIn & Facebook post creation + per-platform rate limiting** (#38)
  — LinkedIn Posts API integration (REST `/rest/posts`), Facebook Graph
  Page-post integration, per-platform rate-limit windows with atomic
  CASE-WHEN counter increments (T-API-02 / T-LIMITS-01), graceful skip
  with distinct `rate_limit_exhausted` outcome (separate from monthly
  Twitter budget exhaustion).

#### Notifications & settings (Phase 9)
- **Notifications & Settings** (#39) — email + in-app notification
  channels via nodemailer, structured templates, notification preferences
  per user, email_logs audit trail, settings UI for profile / security /
  notification / email preferences. Includes 9.1 polish pass and 9.2
  tech-debt sweep.

#### Bulk operations (Phase 10)
- **Bulk Operations** (#40) — CSV import/export via `csv-parse` /
  `csv-stringify`, streaming uploads for large files, bulk-edit and
  bulk-delete with audit trail, bulk-operations worker.

#### Polish & v1.0 close-out (Phase 11)
- **Snippets, Search, Calendar & Polish** (#44) — text snippet library
  with autocomplete in composer, full-text search across posts using
  PostgreSQL tsvector + GIN, react-big-calendar week/month/agenda views
  with drag-to-reschedule, accessibility polish, performance polish,
  documentation polish.

### Fixed

- **Twitter rate-limit window reset date** (#46, closes #35) — UI was
  showing stale "Resets Mar 31" past that date because the monthly
  window was computed from the row's stored `windowResetAt` instead of
  rolling forward from the current time. Reset date now derives from
  `Date.now()` whenever the stored value is in the past.
- **Per-platform character limit in composer** (#45, closes #33) — counter
  was hardcoded to Twitter's 280 chars on LinkedIn (3000) and Facebook
  (63206) too. Composer now selects the limit per active platform.
- **Duplicate-tweet risk on Phase 3 retry** (#47, closes #17) — if the
  Phase 3 transaction (success postAttempts row + transition to
  `published` + counter bump) rolled back AFTER a successful Twitter
  call, BullMQ would retry the job and re-tweet because
  `platform_post_id` was never persisted outside the failed transaction.
  Fixed by a standalone crash-safe pre-write of `platform_post_id`
  between Phase 2 and Phase 3; Phase 1 now distinguishes
  `status='published'` (true idempotent skip) from `status='publishing'`
  (recovery — resume Phase 3 with the stored marker, skip Twitter) so a
  retry mid-window can't strand the post.

### Infrastructure

- **Minimal ESLint flat config + per-package `typecheck` scripts** —
  added in #47 so `pnpm lint && pnpm typecheck && pnpm test` is usable
  as a single composable CI gate. ESLint config is intentionally
  permissive until the team picks a real ruleset.

### Known issues (tracked for 1.0.x)

The following are deferred to the `v1.0.x` GitHub milestone:

- #18 — Media cleanup deletes storage before DB row (race risk in cleanup
  worker)
- #19 — Transcode worker missing retry attempts and backoff
- #21 — `MediaStatusPoller` never updates parent state after transcode
  completes
- #25 — Add nginx security headers and rate limiting
- #26 — `web-production` Docker stage runs as root
- #41 / #42 / #43 — Phase 11 follow-up regression tests (SnippetPicker
  arrow-nav, calendar today-cell highlighting, calendar conflict tooltip)

None block production use on a self-hosted Proxmox/Docker stack behind a
reverse proxy.

### Migration notes

This is the first tagged release; no migration from a prior version.
Initial deployment guidance:

1. Generate the three secrets (`ENCRYPTION_KEY`, `CSRF_SECRET`,
   `SESSION_SECRET`) with `openssl rand -hex 32`.
2. Set `OAUTH_REDIRECT_BASE_URL` to your TLS-terminated public URL and
   register the same value as a callback in LinkedIn, Facebook, and
   Twitter developer consoles.
3. Run `docker compose up -d --build` — the API container auto-runs
   Drizzle migrations on boot.
4. Back up `ENCRYPTION_KEY` out-of-band: losing it bricks every
   connected social profile.

[1.0.1]: https://github.com/joshgk00/social-media-scheduler/releases/tag/v1.0.1
[1.0.0]: https://github.com/joshgk00/social-media-scheduler/releases/tag/v1.0.0
