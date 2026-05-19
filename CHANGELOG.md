# Changelog

All notable changes to the Social Media Scheduler are recorded here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] — 2026-05-19

First maintenance release. Bug fixes surfaced by the v1.0.0 production
deploy plus a round of security hardening across the API, worker,
nginx layer, and Docker images. Includes one schema migration/backfill
for `post_media.user_id`; no breaking changes — drop in over v1.0.0.

### Fixed

- **Trust-proxy + X-Forwarded-Proto passthrough** (#50) — `packages/api/src/app.ts`
  now trusts only loopback and Docker's private proxy range so Express
  honors `X-Forwarded-Proto` from the bundled nginx without accepting
  spoofed forwarded headers from arbitrary clients. Secure session and
  CSRF cookies now actually get set in production. `nginx/nginx.conf`
  overwrites `X-Forwarded-For` with `$remote_addr` and accepts only
  `http` / `https` `X-Forwarded-Proto` values from the external reverse
  proxy, falling back to `$scheme` otherwise. Without this, any POST
  behind a TLS-terminating reverse proxy returned `403 invalid csrf
  token` — including `/api/auth/setup`, blocking initial account
  creation. Regression tests in
  `packages/api/src/__tests__/middleware.test.ts` pin the configuration.

- **Production env var passthrough to api + worker containers** (#49) —
  `docker-compose.yml` now forwards OAuth and notification environment
  variables into both the `api` and `worker` services. Previously these
  vars were defined for the host but never reached the container
  process, so Twitter/LinkedIn/Facebook OAuth callbacks and SMTP
  notifications failed silently in any deployment that relied on
  per-environment secrets.

- **Profile delete cleanup** (#53, PR #55) — Profile deletion now
  blocks while owned posts are in in-flight states, explicitly detaches
  the profile and queue references from owned posts before deleting,
  and deletes owned queue definitions before the profile row. The
  previous implementation relied on FK cascade alone and returned a
  generic 500 when post state made a clean delete impossible. The
  delete preview / confirmation copy now represents empty owned queues
  correctly, and delete failures emit structured logs with the request
  correlation ID.

- **Profile PATCH 500 hardening + route-aware error logging** (#54,
  PR #77) — The PATCH handler in `packages/api/src/routes/profiles.ts`
  catch block now mirrors the DELETE handler from `cbde4a0`: generates
  a correlation ID, emits a handler-level structured log with
  `{err, profileId, userId, correlationId}`, and forwards a stable
  `ProfileServiceError` so clients receive a `code: 'profile_update_failed'`
  field. The central error-handler in
  `packages/api/src/middleware/error-handler.ts` now logs `method` and
  `route` for every unhandled exception, not just profile routes —
  satisfies the project's "no unloggable 500s" rule for the whole API.

- **Auto-destruct 401/403 → `UnrecoverableError`** (#15, PR #84) —
  `packages/worker/src/auto-destruct-lifecycle.service.ts` now throws
  BullMQ's `UnrecoverableError` (not plain `Error`) when the Twitter
  delete API returns 401 or 403, matching the publish worker's
  treatment of the same revoked-credentials case. Previously BullMQ
  burned the full D-12 retry cadence — 30s + 5m + 30m ≈ 36 minutes —
  before the failed listener could surface the failure. The
  `auto-destruct-worker.ts` failed listener also recognises
  `err.name === 'UnrecoverableError'` as a final failure so the
  operator notification still fires on the immediate throw.

- **Vite alias path in ESM config** (`dec2417`) — `packages/web/vite.config.ts`
  resolves the `@sms/shared` alias against `import.meta.url` instead of
  `process.cwd()`. Restores the dev server when Vite is invoked from
  outside `packages/web`.

### Security

- **`post_media.user_id` IDOR fix** (#6, PR #81) — `post_media` now
  carries a `user_id` column; a migration backfills it from associated
  posts and (for unattached uploads) from the storage-path profile id.
  New image and video uploads stamp the session user id at write time.
  Media status, delete, retry, attach, detach, and post-media read
  paths are now scoped by owner. Upload-route profile-ownership
  validation closes the remaining path where one user could reference
  another user's known media id. Regression tests pin the new checks.

- **Web container runs as non-root** (#26, PR #82) — `Dockerfile`'s
  `web-production` stage swaps `nginx:1.27-alpine` for
  `nginxinc/nginx-unprivileged:1.27-alpine` (upstream's non-root
  variant). `nginx/nginx.conf` and `nginx/nginx.dev.conf` move the
  PID file to `/tmp/nginx.pid` and listen on `8080` instead of `80`.
  `docker-compose.yml` and `docker-compose.dev.yml` map the host port
  to the container's new 8080 — the externally-visible port default
  stays `8080`, so no reverse-proxy reconfiguration is needed.
  Brings the web image into line with the `api-production` and
  `worker-production` non-root standard.

- **nginx security headers + rate limiting** (#25, PR #83) — nginx
  now sets a production security header bundle (CSP, HSTS,
  X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
  Permissions-Policy) on both proxied and static responses, and
  applies rate limiting to `/api/` and `/admin/` paths with 429
  responses on burst. Gzip is enabled for proxied responses; SPA
  `index.html` is served with `no-cache` so deploy rollovers
  propagate to clients on next load. API middleware tests in
  `packages/api/src/__tests__/middleware.test.ts` cover the
  production controls.

### Upgrade notes for v1.0.0 → v1.0.1

External reverse proxies in front of the LXC should already be setting
`X-Forwarded-Proto: https` — Cloudflare Tunnel, Caddy, and Traefik do
this by default. Custom nginx LAN reverse proxies need:

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

After pulling: check that your `.env` (or compose override) actually
defines the OAuth + SMTP vars listed in `docker-compose.yml` — they're
now propagated into the api / worker containers, so a missing var that
was previously silently absent will now show up as a "missing env" log
at boot rather than as a runtime OAuth failure.

The non-root web container listens on `8080` internally. The
externally-visible port default is unchanged (`8080:8080` was
`8080:80`). If your compose override remaps the host port, no action
needed; if you proxy directly to the container, point your upstream at
`:8080`.

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
