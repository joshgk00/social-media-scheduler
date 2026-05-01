# Roadmap: Social Media Scheduler

## Overview

This roadmap delivers a self-hosted social media scheduling tool in 11 phases, progressing from infrastructure through Twitter-first validation, then LinkedIn and Facebook integration, then power features. Each phase delivers a deployable, verifiable capability. The first five phases produce a fully functional Twitter scheduling and queue automation tool. Phases 6-8 add media handling and multi-platform support. Phases 9-11 add notifications, bulk operations, and advanced features (snippets, search, calendar).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Infrastructure & Foundation** - Monorepo scaffold, Docker Compose stack, database, Redis, HTTPS, encryption module, health endpoint, structured logging
- [ ] **Phase 2: Authentication & User Account** - Login, sessions, 2FA, password management, user settings
- [ ] **Phase 3: Twitter Profile & Post Creation** - Twitter OAuth connection, tweet creation forms, common post fields, post state machine, tags
- [x] **Phase 4: Publish Worker & Scheduled Posts** - BullMQ worker service, publish pipeline with retry and idempotency, scheduled posts list, Twitter rate limit tracking (completed 2026-04-10)
- [x] **Phase 5: Queue Engine** - Queue CRUD, timezone-aware queue scheduling, queue post management, auto-destruct worker (completed 2026-04-15)
- [x] **Phase 6: Media Handling** - Image upload and thumbnailing, video transcoding via ffmpeg, storage backend selection, media cleanup (completed 2026-04-16)
- [ ] **Phase 6.1: Production Deployment Wiring** - INSERTED — Wire media routes in API entry point, add SESSION_SECRET to Docker Compose, create web production build target
- [ ] **Phase 6.2: Test & Build Stabilization + Migration Runner Hardening** - INSERTED — Rebuild stale dist packages, fix mock-db regression, resolve 30 test failures, harden migration runner (advisory lock, per-migration atomicity, test coverage) per 06.1-REVIEW.md H-01/H-02/M-01
- [ ] **Phase 6.3: Queue Engine Bug Fixes** - INSERTED — Fix recycling race condition, stuck queue state, seasonal pause logic, silent failures, profile display
- [ ] **Phase 6.4: Wire Media-Post Association** - INSERTED — Wire associateMediaToPost into post create/update routes, close MEDIA-05 and FLOW-C
- [ ] **Phase 6.5: Nginx Proxy Completion** - INSERTED — Add nginx proxy for /media/ and /admin/queues, mount media_data volume on nginx container
- [ ] **Phase 6.6: Twitter Publish Path Completion + State Guard** - INSERTED — Unblock thread/multi-media publish in Twitter worker; add 409 publishing-state guard to API
- [ ] **Phase 7: Multi-Platform Profiles & Token Lifecycle** - LinkedIn and Facebook OAuth connections, profile management UI, token health monitoring, auto-refresh
- [ ] **Phase 7.1: Profile UX Polish** - INSERTED — Add next-scheduled-run column, platform filter, markdown notes; explicit publish-loop exclusion logging for invalid-token profiles
- [ ] **Phase 8: LinkedIn & Facebook Post Creation** - LinkedIn share forms, Facebook post forms, LinkedIn and Facebook rate limit tracking
- [ ] **Phase 8.1: Rate Limit Dashboard Widget** - INSERTED — Per-profile dashboard widget showing current usage vs. limit, color-coded
- [ ] **Phase 9: Notifications & Settings** - In-app notification bell, SMTP email notifications, notification preferences, email logs
- [ ] **Phase 9.1: Notifications & Settings Polish** - INSERTED — Migrate NotificationsTab to RHF + Zod (CLAUDE.md alignment), preserve NotificationBell aria-label across expanded state, add notification-prefs round-trip test, add Discard-button regression test, fix docker-compose.dev.yml web service so cold compose-up boots Vite cleanly
- [ ] **Phase 9.2: Tech Debt Sweep** - INSERTED — Finalize 06.5 VALIDATION.md paperwork; enrich publish_failed notification with link_path; formalize dev-compose shared/dist volumes
- [x] **Phase 10: Bulk Operations** - CSV upload and export, bulk queue operations (randomize, purge, copy, text modify, deduplicate), bulk pause/resume/delete
- [ ] **Phase 11: Snippets, Search, Calendar & Polish** - Text snippets with insert button, full-text post search, calendar views, SEC-07 policy

## Phase Details

### Phase 1: Infrastructure & Foundation
**Goal**: A running Docker Compose stack with correct Redis configuration, HTTPS termination, database migrations, encryption infrastructure, and operational tooling -- the foundation every other phase builds on
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08, INFRA-09, INFRA-10, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. Running `docker compose up` starts all five services (web, worker, postgres, redis, nginx) and they pass health checks
  2. `GET /health` returns JSON with status for Redis, Postgres, worker heartbeat, pending jobs, and last publish timestamp
  3. Redis is configured with `maxmemory-policy noeviction` and persists data across restarts
  4. HTTPS works end-to-end (nginx terminates TLS; OAuth callback URLs are valid HTTPS)
  5. Encryption module can encrypt and decrypt a test payload using AES-256-GCM with key from env var; CSRF protection rejects state-changing requests without valid token
**Plans**: 5 plans
Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold, package skeletons, Drizzle ORM infrastructure, web stub
- [x] 01-02-PLAN.md — Docker Compose (prod + dev), Dockerfile, nginx, env template
- [x] 01-03-PLAN.md — AES-256-GCM encryption module (TDD)
- [x] 01-04-PLAN.md — Express API server, middleware stack, health endpoint, worker heartbeat
- [x] 01-05-PLAN.md — Integration verification, baseline migration, human sign-off

### Phase 2: Authentication & User Account
**Goal**: User can securely access their account, configure personal settings, and protect their session with 2FA
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, SETTINGS-01
**Success Criteria** (what must be TRUE):
  1. User can log in with email and password, and session persists across browser refresh (24-hour sliding window)
  2. User can enable TOTP 2FA, and subsequent logins require the TOTP code
  3. User can change password, disable 2FA, and set security questions from the account page
  4. User can configure timezone, date format, profile image, and entries-per-page in settings
**Plans**: 6 plans
Plans:
- [ ] 02-01-PLAN.md — DB schema, shared Zod schemas, session/auth/rate-limit middleware
- [ ] 02-02-PLAN.md — Frontend shell: shadcn/ui, React Router, TanStack Query, auth guards
- [ ] 02-03-PLAN.md — Auth services and routes: setup, login (with 2FA), logout, CSRF
- [ ] 02-04-PLAN.md — Recovery, password change, settings API, 2FA settings, security questions
- [ ] 02-05-PLAN.md — Schema push, SetupPage, LoginPage, RecoverPage
- [ ] 02-06-PLAN.md — SettingsPage with modals, human verification checkpoint
**UI hint**: yes

### Phase 3: Twitter Profile & Post Creation
**Goal**: User can connect a Twitter/X profile and create tweets (text, images, threads) with full post management including drafts, scheduling, tags, and spinnable text
**Depends on**: Phase 2
**Requirements**: PROFILE-01, POST-TW-01, POST-TW-02, POST-TW-03, POST-TW-04, POST-TW-05, POST-TW-06, POST-TW-07, POST-CMN-01, POST-CMN-02, POST-CMN-03, POST-CMN-04, POST-CMN-05, POST-CMN-06, POST-CMN-07, STATE-01, STATE-02, STATE-03, STATE-04, STATE-05, TAGS-01, TAGS-02
**Success Criteria** (what must be TRUE):
  1. User can connect a Twitter/X profile using their own Developer App credentials (Consumer Key, Consumer Secret, Access Token, Access Token Secret)
  2. User can create a tweet with text, images, GIF, video, or thread (via `[[tweet]]` separator) and see real-time character count using `twitter-text` rules
  3. User can schedule a post for a specific datetime, save as draft, or publish immediately; drafts are not picked up by the scheduler
  4. User can create and apply tags to posts; scheduled posts show conflict warning when another post is within 5 minutes on the same profile
  5. Post state machine enforces valid transitions (draft -> scheduled -> publishing -> published/failed); posts in `publishing` state cannot be edited
**Plans**: 11 plans
Plans:
- [ ] 11-01-PLAN.md — Wave 0 shared utilities: snippet-tokens util + Zod schemas (snippets, calendar, posts response extension)
- [ ] 11-02-PLAN.md — SEC-07: pino redact extension + BullMQ schema contract test + SECURITY.md
- [ ] 11-03-PLAN.md — Drizzle schema (snippets table, posts.search_vector + tag_search_vector) + migration 0009 with hand-edited tsvector + GIN + trigger SQL
- [ ] 11-04-PLAN.md — [BLOCKING] Apply migration 0009 + verify via psql + EXPLAIN
- [ ] 11-05-PLAN.md — Snippet CRUD service + routes + integration tests (cross-tenant isolation, duplicate-name 409)
- [ ] 11-06-PLAN.md — post.service FTS rewrite (plainto_tsquery + ts_headline + ts_rank) + scope-by-view + real-Postgres integration test (GIN hit, cross-tenant)
- [ ] 11-07-PLAN.md — Calendar API: GET /api/calendar with windowed query + hasConflict (reusing checkConflicts) + filter integration tests
- [ ] 11-08-PLAN.md — CSV bulk-import handlers wire substituteSnippetsInText + tests for missing/cross-tenant cases
- [ ] 11-09-PLAN.md — Snippets web surface: useSnippets hooks + SnippetPicker (cursor-capture) + SnippetFormDialog + SnippetsPage + SharedPostFields integration
- [ ] 11-10-PLAN.md — headline-to-mark allowlist parser + QueuePostsPage search input + render headline in posts/queue lists
- [ ] 11-11-PLAN.md — Calendar UI: install react-big-calendar + luxonLocalizer + CalendarPage with custom toolbar + filter bar + sidebar/route wiring + platform color tokens
**UI hint**: yes

### Phase 4: Publish Worker & Scheduled Posts
**Goal**: Background worker autonomously publishes scheduled Twitter posts at the right time with retry logic, idempotency, and rate limit awareness
**Depends on**: Phase 3
**Requirements**: WORKER-01, WORKER-02, WORKER-03, WORKER-04, WORKER-05, WORKER-06, WORKER-07, WORKER-08, SCHED-01, SCHED-02, SCHED-03, SCHED-04, LIMIT-01, LIMIT-02, LIMIT-03, LIMIT-04, LIMIT-05
**Success Criteria** (what must be TRUE):
  1. Scheduled Twitter posts publish automatically at their scheduled time without user intervention; published posts show `platform_post_id` and `published_at` timestamp
  2. Failed publishes retry with exponential backoff (max 3 retries); exhausted retries move the post to `failed` state and land in the dead letter queue
  3. Stalled job recovery does not cause duplicate posts -- worker checks `platform_post_id` before re-attempting publish
  4. User can view all scheduled posts in a filterable list with per-post actions (edit, delete, view history, view full text)
  5. Twitter rate limit tracking respects the user's configured monthly budget; publishing is blocked when budget is reached; new posts show pre-flight warning at 90%
**Plans**: 6 plans
Plans:
- [x] 04-01-PLAN.md — post_attempts table + social_profiles rate-limit columns + Drizzle migration ([BLOCKING] schema push)
- [x] 04-02-PLAN.md — Shared queue constants, error classifier, Zod schemas, rate-limit + publish-queue services, dependency installs
- [x] 04-03-PLAN.md — Publish worker, scanner, lifecycle service, twitter publish service, graceful shutdown
- [x] 04-04-PLAN.md — Retry/history/rate-limit/admin endpoints with security checks (Bull-Board mounted behind requireAuth)
- [x] 04-05-PLAN.md — Posts page extensions, history modal, rate limit banner/block/settings UI (human verification checkpoint)
- [x] 04-06-PLAN.md — Integration tests (testcontainers), graceful shutdown test, finalize VALIDATION.md, phase sign-off

### Phase 5: Queue Engine
**Goal**: User can create persistent post queues that publish on a recurring schedule with timezone-aware timing, post recycling, and auto-destruct
**Depends on**: Phase 4
**Requirements**: QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-04, QUEUE-05, QUEUE-06, WORKER-09
**Success Criteria** (what must be TRUE):
  1. User can create a queue with schedule configuration (interval, days-of-week, hour windows, start date, seasonal window) and assign it to a connected profile
  2. Queue scheduling engine publishes the next post at the configured interval, respecting day-of-week and hour window constraints; DST transitions do not shift scheduled times
  3. User can reorder posts within a queue (move up/down) and view spinnable text variants for queued posts
  4. Auto-destruct worker deletes published posts from the platform after the configured time period; post transitions through `auto_destructing` to `destroyed`
**Plans**: 5 plans
Plans:
- [ ] 05-01-PLAN.md — Queue table schema, posts extension, shared constants/schemas, spinnable text parser, schedule evaluation functions, schema push
- [ ] 05-02-PLAN.md — Queue CRUD API routes, queue service, queue post management (add, list, reorder, delete), auto-destruct queue service
- [ ] 05-03-PLAN.md — Queue scanner worker, auto-destruct worker + lifecycle + Twitter delete service, worker bootstrap integration
- [ ] 05-04-PLAN.md — Queue list page, queue create/edit page with schedule builder, sidebar nav, React Router routes
- [ ] 05-05-PLAN.md — Queue posts page with reorder, spinnable variants dialog, adapted post form for queue mode, human verification
**UI hint**: yes

### Phase 6: Media Handling
**Goal**: User can upload images and videos to posts with automatic thumbnailing, async video transcoding, and configurable storage backend
**Depends on**: Phase 4
**Requirements**: MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, MEDIA-05, MEDIA-06, MEDIA-07, MEDIA-08, MEDIA-09
**Success Criteria** (what must be TRUE):
  1. Uploaded images generate thumbnails (300px wide) and are validated for format and dimensions; oversized images are resized before publish
  2. Video uploads trigger async ffmpeg transcoding via BullMQ job; upload returns immediately with `processing` status; posts with pending media are skipped by the publish worker
  3. Media storage works on both local Docker volume and S3-compatible backend (selectable via env var)
  4. Deleted post media is soft-deleted; weekly cleanup job permanently removes files older than 30 days; settings page shows total storage consumed
**Plans**: 6 plans
Plans:
- [x] 06-01-PLAN.md — StorageBackend interface + implementations, post_media schema extension, queue constants, media-limits, Docker infrastructure
- [x] 06-02-PLAN.md — Media upload API (multer middleware, image thumbnailing, video upload with transcode enqueue, soft-delete, association)
- [x] 06-03-PLAN.md — ffmpeg transcode worker, publish worker media-readiness gate
- [x] 06-04-PLAN.md — Frontend media UI (drop zone, thumbnail grid, upload progress, transcoding status, post list indicators)
- [x] 06-05-PLAN.md — Media cleanup worker, storage usage API + settings card, schema push
- [x] 06-06-PLAN.md — [GAP CLOSURE] Generate drizzle-kit migration SQL for Phase 6 schema changes
**UI hint**: yes

### Phase 6.1: Production Deployment Wiring
**INSERTED** — Gap closure from v1.0 milestone audit
**Goal**: Production Docker Compose stack starts without crashing, media API routes are reachable, and frontend is served from built assets
**Depends on**: Phase 6
**Requirements**: Affected: MEDIA-01 through MEDIA-08 (INT-01), AUTH-01 through AUTH-07 (INT-02), SCHED-01, SCHED-02, SCHED-03, LIMIT-04, LIMIT-05 (documentation fix)
**Gap Closure**: INT-01, INT-02, FLOW-01, FLOW-02
**Success Criteria** (what must be TRUE):
  1. `api/src/index.ts` creates storage backend and transcode queue; media router mounts and `/api/media/*` routes return non-404 responses
  2. `docker-compose.yml` api service includes `SESSION_SECRET` env var; API starts without crashing
  3. Web production Dockerfile target exists; `web_dist` volume is populated with built React assets; nginx serves the frontend
  4. Phase 4 plan SUMMARY frontmatter claims SCHED-01, SCHED-02, SCHED-03, LIMIT-04, LIMIT-05
**Plans**: 3 plans
Plans:
- [x] 06.1-01-PLAN.md — Wire storage + transcodeQueue into API index.ts (mount media routes)
- [x] 06.1-02-PLAN.md — Docker Compose SESSION_SECRET, web-production Dockerfile target, nginx proxy_pass + /assets/ cache
- [x] 06.1-03-PLAN.md — Integration checkpoint + Phase 4 SUMMARY requirements_satisfied frontmatter

### Phase 6.2: Test & Build Stabilization + Migration Runner Hardening
**INSERTED** — Gap closure from v1.0 milestone audit + Phase 6.1 code-review follow-ups
**Goal**: All packages compile and all tests pass — no stale dist artifacts, no mock regressions — and the database migration runner is safe for production redeploy (advisory-locked, per-migration atomic, covered by tests)
**Depends on**: Phase 6.1
**Requirements**: Affects test reliability for QUEUE-01 through QUEUE-06, WORKER-09; production deploy safety for INT-02 (multi-replica boot scenarios)
**Gap Closure**:
  - Stale dist builds (26 failures), mock-db .returning() regression (4 failures) — from v1.0 audit
  - `packages/db/src/migrate.ts` H-01 (no advisory lock — concurrent migrator race), H-02 (per-migration atomicity lost — partial-migration crash loop), M-01 (zero test coverage) — from 06.1-REVIEW.md
**Success Criteria** (what must be TRUE):
  1. `@sms/db` and `@sms/shared` dist directories are current with source; `pnpm build` succeeds in both packages
  2. `mock-db.ts` updateChain supports `.returning()` method
  3. Full test suite passes with zero failures across all packages
  4. `runMigrations()` acquires a Postgres advisory lock (`pg_try_advisory_lock`) before reading the journal; second concurrent caller waits or exits cleanly (H-01)
  5. Each pending migration runs inside a transaction; on failure, statements roll back and `__drizzle_migrations` stays unmodified — except duplicate-object SQLSTATE is still swallowed at statement level so drift is tolerated (H-02)
  6. `packages/db/src/__tests__/migrate.test.ts` covers: fresh DB apply, idempotent re-run, orphan-schema baseline, duplicate-object tolerance, real error abort, concurrent-caller lock behavior — 100% branch coverage per repo security-critical standard (M-01)
**Plans**: 3 plans
Plans:
- [x] 06.2-01-PLAN.md — Pretest build guardrail + api mock-db .returning() fix + .env.example DATABASE_URL_TEST
- [x] 06.2-02-PLAN.md — migrate.ts hardening: sql.reserve() + advisory lock + per-migration transaction + narrowed duplicate codes
- [x] 06.2-03-PLAN.md — migrate.test.ts (6 D-08 scenarios) + test harness + vitest coverage config

### Phase 6.3: Queue Engine Bug Fixes
**INSERTED** — Gap closure from v1.0 milestone audit
**Goal**: Queue engine runtime bugs identified during audit are fixed — no race conditions, stuck states, or silent failures
**Depends on**: Phase 6.2
**Requirements**: Affects QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-05, QUEUE-06, WORKER-09
**Gap Closure**: WR-01, WR-02, WR-04, WR-05, IN-02, IN-03
**Success Criteria** (what must be TRUE):
  1. Recycling bulk update and MIN(queue_position) select run in a single transaction (WR-01)
  2. `removePostFromQueue` clears queued status and queueId atomically (WR-02)
  3. QueueStatusBadge seasonal pause shows correctly for Nov-Jan windows year-round (WR-04)
  4. `useRemoveFromQueue` shows error toast on failure (WR-05)
  5. Queue list displays profile name instead of '-' (IN-02)
  6. Queue scanner logger is created at module scope, not per tick (IN-03)
**Plans**: 2 plans
Plans:
- [x] 06.3-01-PLAN.md — Worker fixes: cursor advance into transaction (WR-01) + module-scope logger (IN-03)
- [x] 06.3-02-PLAN.md — Frontend seasonal badge tests (WR-04) + verification of already-fixed WR-02, WR-05, IN-02

### Phase 6.4: Wire Media-Post Association
**INSERTED** — Gap closure from v1.0 milestone audit
**Goal**: Wire `associateMediaToPost` into post creation/update routes so `post_media.post_id` is set and the publish worker's media-readiness gate actually fires
**Depends on**: Phase 6.3
**Requirements**: MEDIA-05
**Gap Closure**: MEDIA-05 (unsatisfied), Integration gap (media.service → routes/posts.ts), FLOW-C (broken at "attach to post")
**Success Criteria** (what must be TRUE):
  1. `CreatePostInput` and `UpdatePostInput` in `post.service.ts` include `mediaIds?: string[]`
  2. POST `/api/posts` and PATCH `/api/posts/:id` call `associateMediaToPost(db, post.id, mediaIds)` after persisting the post
  3. After creating a post with media, `post_media.post_id` is non-NULL for associated media rows
  4. Publish worker skips posts with media in `pending` or `processing` transcode state (FLOW-C verified end-to-end)
**Plans**: 2 plans
Plans:
- [x] 06.4-01-PLAN.md -- Wire associateMediaToPost into createPost/updatePost + unit tests
- [x] 06.4-02-PLAN.md -- Integration tests for POST/PATCH with mediaIds + full suite verification

### Phase 6.5: Nginx Proxy Completion
**INSERTED** — Gap closure from v1.0 re-audit (2026-04-21)
**Goal**: All API-served paths (`/media/`, `/admin/`) are reachable through nginx in production — uploaded media files render correctly and Bull-Board dashboard loads
**Depends on**: Phase 6.4
**Requirements**: MEDIA-06 (partial → satisfied), MEDIA-01 (degrades without proxy)
**Gap Closure**: MEDIA-06 partial, Integration /media/ proxy + volume mount, Integration /admin/ proxy, FLOW-E (Bull-Board)
**Success Criteria** (what must be TRUE):
  1. nginx.conf includes `location /media/` block proxying to `api_backend`; uploaded thumbnails and media files return the actual file (not index.html) through the published nginx port
  2. nginx `/media/` requests proxy to Express (`api_backend`), which serves files from the `media_data` volume mounted on the api service — nginx does not mount the volume directly, preserving Express path validation and the consistent proxy pattern
  3. nginx.conf includes `location /admin/` block proxying to `api_backend`; `/admin/queues` loads the Bull-Board dashboard through nginx (not the SPA catch-all)
**Plans**: 1 plan
Plans:
- [x] 06.5-01-PLAN.md -- Add /media/ and /admin/ proxy blocks to nginx.conf and nginx.dev.conf

### Phase 6.6: Twitter Publish Path Completion + State Guard
**INSERTED** — Gap closure from v1.0 code-grounded re-verification (2026-04-29)
**Goal**: Twitter worker can publish threads and multi-media tweets; API rejects edits/deletes on `publishing`-state posts with 409
**Depends on**: Phase 6.5
**Requirements**: POST-TW-02, POST-TW-03, POST-TW-04, POST-TW-05, STATE-02
**Gap Closure**:
  - Worker rejects threads and multi-media at `packages/worker/src/twitter-publish.service.ts:54-58` ("unsupported until Phase 4.5")
  - No 409 publishing-state guard on POST/PATCH/DELETE `/api/posts/:id`
**Success Criteria** (what must be TRUE):
  1. `callTwitter` chains thread tweets via Twitter API v2 reply (in_reply_to_tweet_id) without rejecting at the entry guard
  2. `callTwitter` performs chunked media upload for images, GIF, and video; attaches mediaIds to first tweet only on threads
  3. POST/PATCH/DELETE `/api/posts/:id` returns HTTP 409 when `post.status === 'publishing'`; UI Edit/Delete buttons disabled in that state
  4. Existing single-tweet text-only path continues to pass; no regression in Phase 4 publish tests

### Phase 7: Multi-Platform Profiles & Token Lifecycle
**Goal**: User can connect LinkedIn and Facebook profiles alongside Twitter, with token health monitoring and automatic refresh
**Depends on**: Phase 4
**Requirements**: PROFILE-02, PROFILE-03, PROFILE-04, PROFILE-05, PROFILE-06, PROFILE-07, PROFILE-08, TOKEN-01, TOKEN-02, TOKEN-03, TOKEN-04, TOKEN-05
**Success Criteria** (what must be TRUE):
  1. User can connect a LinkedIn Personal Profile and Company Page via OAuth 2.0, and a Facebook Page via OAuth (short-lived to long-lived token exchange)
  2. Profile list shows all connected profiles with network icon, token health badge (green/yellow/red), and last published date; filterable by network
  3. LinkedIn tokens auto-refresh 7 days before expiry; Facebook Page tokens are monitored via test API call (not expiry date); Twitter token revocation detected via 401
  4. Profiles with expired or invalid tokens are excluded from the publish loop with a clear error message and notification
**Plans**: 11 plans
Plans:
- [ ] 11-01-PLAN.md — Wave 0 shared utilities: snippet-tokens util + Zod schemas (snippets, calendar, posts response extension)
- [ ] 11-02-PLAN.md — SEC-07: pino redact extension + BullMQ schema contract test + SECURITY.md
- [ ] 11-03-PLAN.md — Drizzle schema (snippets table, posts.search_vector + tag_search_vector) + migration 0009 with hand-edited tsvector + GIN + trigger SQL
- [ ] 11-04-PLAN.md — [BLOCKING] Apply migration 0009 + verify via psql + EXPLAIN
- [ ] 11-05-PLAN.md — Snippet CRUD service + routes + integration tests (cross-tenant isolation, duplicate-name 409)
- [ ] 11-06-PLAN.md — post.service FTS rewrite (plainto_tsquery + ts_headline + ts_rank) + scope-by-view + real-Postgres integration test (GIN hit, cross-tenant)
- [ ] 11-07-PLAN.md — Calendar API: GET /api/calendar with windowed query + hasConflict (reusing checkConflicts) + filter integration tests
- [ ] 11-08-PLAN.md — CSV bulk-import handlers wire substituteSnippetsInText + tests for missing/cross-tenant cases
- [ ] 11-09-PLAN.md — Snippets web surface: useSnippets hooks + SnippetPicker (cursor-capture) + SnippetFormDialog + SnippetsPage + SharedPostFields integration
- [ ] 11-10-PLAN.md — headline-to-mark allowlist parser + QueuePostsPage search input + render headline in posts/queue lists
- [ ] 11-11-PLAN.md — Calendar UI: install react-big-calendar + luxonLocalizer + CalendarPage with custom toolbar + filter bar + sidebar/route wiring + platform color tokens
**UI hint**: yes

### Phase 7.1: Profile UX Polish
**INSERTED** — Gap closure from v1.0 code-grounded re-verification (2026-04-29)
**Goal**: Profile list surfaces next scheduled run and supports platform filtering; users can attach Markdown notes to profiles; the publish scanner emits a clear log line when skipping invalid-token profiles
**Depends on**: Phase 7
**Requirements**: PROFILE-05, PROFILE-06, PROFILE-07, TOKEN-05
**Gap Closure**:
  - PROFILE-05 partial: ProfileCard missing "next scheduled run" column
  - PROFILE-06 unsatisfied: ProfilesPage has no platform filter UI
  - PROFILE-07 partial: EditProfileDialog missing Markdown notes field
  - TOKEN-05 partial: scanner does not emit a structured `skipping: true` log when a profile is excluded for token revocation/expiry
**Success Criteria** (what must be TRUE):
  1. ProfileCard renders a "Next scheduled run" field computed from the earliest queued/scheduled post for that profile (empty state when none)
  2. ProfilesPage exposes a network filter (Twitter | LinkedIn | Facebook | All) that narrows the rendered list
  3. EditProfileDialog has a Markdown-capable notes textarea persisted to `social_profiles.notes`; ProfileCard preview shows first 80 chars
  4. Publish scanner logs `{ level: 'warn', profileId, reason, skipping: true }` whenever a profile is excluded due to invalid token, and emits the matching token-status notification once per status transition

### Phase 8: LinkedIn & Facebook Post Creation
**Goal**: User can create and publish LinkedIn shares and Facebook posts with platform-specific forms, previews, and rate limit tracking
**Depends on**: Phase 7
**Requirements**: POST-LI-01, POST-LI-02, POST-LI-03, POST-LI-04, POST-LI-05, POST-FB-01, POST-FB-02, POST-FB-03, POST-FB-04, POST-FB-05, POST-FB-06, LIMIT-06, LIMIT-07, LIMIT-08
**Success Criteria** (what must be TRUE):
  1. User can create a LinkedIn share (text-only or with image) with visibility selector and real-time character count (3,000 max); live preview approximates LinkedIn rendering
  2. User can create a Facebook post (text, up to 10 images, video, optional URL) with real-time character count (63,206 max); live preview approximates Facebook rendering
  3. LinkedIn and Facebook posts publish through the existing worker pipeline with the same retry, state machine, and idempotency guarantees as Twitter
  4. Dashboard widget shows current API usage vs. limit for each connected profile (color-coded green/yellow/red) across all platforms
**Plans**: 11 plans
Plans:
- [ ] 11-01-PLAN.md — Wave 0 shared utilities: snippet-tokens util + Zod schemas (snippets, calendar, posts response extension)
- [ ] 11-02-PLAN.md — SEC-07: pino redact extension + BullMQ schema contract test + SECURITY.md
- [ ] 11-03-PLAN.md — Drizzle schema (snippets table, posts.search_vector + tag_search_vector) + migration 0009 with hand-edited tsvector + GIN + trigger SQL
- [ ] 11-04-PLAN.md — [BLOCKING] Apply migration 0009 + verify via psql + EXPLAIN
- [ ] 11-05-PLAN.md — Snippet CRUD service + routes + integration tests (cross-tenant isolation, duplicate-name 409)
- [ ] 11-06-PLAN.md — post.service FTS rewrite (plainto_tsquery + ts_headline + ts_rank) + scope-by-view + real-Postgres integration test (GIN hit, cross-tenant)
- [ ] 11-07-PLAN.md — Calendar API: GET /api/calendar with windowed query + hasConflict (reusing checkConflicts) + filter integration tests
- [ ] 11-08-PLAN.md — CSV bulk-import handlers wire substituteSnippetsInText + tests for missing/cross-tenant cases
- [ ] 11-09-PLAN.md — Snippets web surface: useSnippets hooks + SnippetPicker (cursor-capture) + SnippetFormDialog + SnippetsPage + SharedPostFields integration
- [ ] 11-10-PLAN.md — headline-to-mark allowlist parser + QueuePostsPage search input + render headline in posts/queue lists
- [ ] 11-11-PLAN.md — Calendar UI: install react-big-calendar + luxonLocalizer + CalendarPage with custom toolbar + filter bar + sidebar/route wiring + platform color tokens
**UI hint**: yes

### Phase 8.1: Rate Limit Dashboard Widget
**INSERTED** — Gap closure from v1.0 code-grounded re-verification (2026-04-29)
**Goal**: Aggregated dashboard widget shows current API usage vs. limit for each connected profile, color-coded — beyond the per-profile chip already in ProfileCard
**Depends on**: Phase 8
**Requirements**: LIMIT-08
**Gap Closure**: LIMIT-08 partial — RateLimitChip exists in ProfileCard but no aggregated dashboard widget per the requirement
**Success Criteria** (what must be TRUE):
  1. Dashboard page hosts a `RateLimitWidget` listing every connected profile with platform icon, name, current count, configured limit, and percent used
  2. Each row is color-coded green (<50%), yellow (50–80%), red (>80%) and links to the profile detail
  3. Counts read from the same fields the chip uses (`twitter_*`, `linkedin_*`, `facebook_*` columns on `social_profiles`); refresh on profile-switch

### Phase 9: Notifications & Settings
**Goal**: User receives timely alerts for publish failures, token issues, and rate limits via in-app bell and email; notification preferences are configurable
**Depends on**: Phase 4
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07, NOTIF-08, NOTIF-09, SETTINGS-02, SETTINGS-03
**Success Criteria** (what must be TRUE):
  1. In-app notification bell in the header shows unread count and dropdown of recent notifications (publish failures, token expiry, rate limits, queue empty)
  2. Email notifications send via configured SMTP for publish failures, token expiry, and rate limit events
  3. User can configure notification preferences per event type (enable/disable email and/or in-app where applicable)
  4. Email logs view shows a paginated, filterable list of all system emails sent
**Plans**: 6 plans
Plans:
- [ ] 09-01-PLAN.md — Wave 0 scaffolding: nodemailer install, shared event-type catalog, non-token event payload schemas, JOB_NAMES.rateLimitReachedNotification, RED test files for every Wave 0 entry
- [ ] 09-02-PLAN.md — DB schema (notifications, user_notification_prefs, email_logs) + partial unique index + [BLOCKING] schema push via drizzle-kit generate + migrate
- [ ] 09-03-PLAN.md — Notification worker: SMTP factory, 9 active handlers + bulk_completed stub, 7 templates + email shell + escape-html, prefs service, notification store, bootstrap wiring in main()
- [ ] 09-04-PLAN.md — API routes (notifications, notification-prefs, email-logs, system) + always-on coercion + rate_limit_reached producer in posts.ts (NOTIF-07)
- [ ] 09-05-PLAN.md — Web UI: bell + dropdown, /notifications page, /settings/email-logs page, Settings Tabs + Notifications tab, hook bundle, App routes; visual checkpoint
- [ ] 09-06-PLAN.md — End-to-end testcontainers integration tests, .env.template updates, finalize 09-VALIDATION.md, full repo suite verification
**UI hint**: yes

### Phase 9.1: Notifications & Settings Polish
**INSERTED** — Phase 9 UAT follow-ups (`.planning/phases/09-notifications-settings/09-UAT.md` Findings A, C, D, E, F)
**Goal**: Close five low-risk Phase 9 polish items — RHF + Zod migration of NotificationsTab (per packages/web/CLAUDE.md), NotificationBell a11y polish, two test-coverage gaps that allowed Phase 9 bugs to ship to UAT, and a dev compose fix so `docker compose up -d --build web` boots Vite cleanly
**Depends on**: Phase 9
**Requirements**: None new — quality / convention / test-gap closures only. No NOTIF-* or SETTINGS-* outcome changes.
**Success Criteria** (what must be TRUE):
  1. NotificationsTab uses React Hook Form + Zod resolver per packages/web/CLAUDE.md State Management standard; existing 3 component tests still pass; Save and Discard buttons disable when form returns to saved state
  2. NotificationBell trigger has accessible name queryable in BOTH dropdown-collapsed and dropdown-expanded states; new test asserts this
  3. notification-prefs.test.ts contains a round-trip test (GET → PATCH(response.rows) → 200) so the schema-asymmetry bug fixed at 038ad6f cannot silently regress
  4. NotificationsTab.test.tsx asserts the Discard changes button is queryable and exercises the discard reset flow
  5. From a clean state, `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build web` reaches Vite-ready and serves http://127.0.0.1:5173/ with HTTP 200 (no "Cannot find module vite")
**Plans**: 3 plans
Plans:
- [ ] 09.1-01-PLAN.md — NotificationBell aria-label preservation (Finding C) + notification-prefs round-trip test (Finding E)
- [ ] 09.1-02-PLAN.md — Migrate NotificationsTab to RHF + Zod (Finding D) + Discard button regression tests (Finding F)
- [ ] 09.1-03-PLAN.md — Fix docker-compose.dev.yml web service volumes and command (Finding A)

### Phase 9.2: Tech Debt Sweep
**INSERTED** — Gap closure from v1.0 code-grounded re-verification (2026-04-29)
**Goal**: Close lingering paperwork and dev-experience items surfaced by audit and 09.1 UAT — no new requirements, just hygiene
**Depends on**: Phase 9.1
**Requirements**: None new (quality / paperwork / dev-experience only)
**Working tree state**: Some of this work is already in-flight on the `phase-9-notifications-and-settings` branch as uncommitted edits to `docker-compose.dev.yml`, `packages/web/vite.config.ts`, and `packages/web/src/lib/api-client.ts`. The plan should absorb those existing diffs rather than re-do them.
**Gap Closure**:
  - 06.5 VALIDATION.md frontmatter still `status: draft / nyquist_compliant: false` despite verification PASSED 5/5 (paperwork)
  - Phase 9 `publish_failed` notifications emit `link_path: NULL` — should be `/posts/{post_id}` (UAT Test 7 follow-up)
  - 09.1 UAT applied ad-hoc volume additions for `shared/dist` + `shared/package.json` to **api and worker** services (Phase 9.1 already handled the web service in plan 09.1-03) — formalize the api/worker mounts in `docker-compose.dev.yml`
  - Web Vite dev-server proxy hardcodes `http://localhost:3000`, which fails when the web dev server runs in-container — should target the `api` Docker service name
  - `apiClient.get` lets the browser HTTP cache stale notification responses — needs `cache: 'no-store'` so in-app bell stays fresh in dev
**Success Criteria** (what must be TRUE):
  1. `.planning/phases/06.5-bull-board-nginx-proxy/06.5-VALIDATION.md` frontmatter shows `status: complete` and `nyquist_compliant: true` with reasoning that records the 5/5 verification override
  2. `publish_failed` notification producer enriches payload with `link_path: /posts/{post_id}`; in-app bell row links to the post detail page; existing publish_failed test asserts the link is set
  3. `docker-compose.dev.yml` `api` and `worker` services mount `./packages/shared/dist:/app/packages/shared/dist` and `./packages/shared/package.json:/app/packages/shared/package.json:ro`; a cold `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build` boots all services without ad-hoc fixups
  4. `packages/web/vite.config.ts` `server.proxy['/api']` targets `http://api:3000` (Docker service DNS), not `http://localhost:3000`, so the in-container web dev server can reach the api container
  5. `apiClient.get` includes `cache: 'no-store'` so GET responses are not served from browser HTTP cache (notification freshness)
**Plans**: 3 plans
Plans:
- [ ] 09.2-01-PLAN.md — Flip 06.5 VALIDATION.md frontmatter to status:complete/nyquist_compliant:true with manual-verify override reasoning (SC#1)
- [ ] 09.2-02-PLAN.md — Fix publish_failed producer payload to match publishFailedNotificationSchema (eventType+profileId+errorMessage+occurredAt) so handler-side linkPath populates link_path on the notification row (SC#2)
- [ ] 09.2-03-PLAN.md — Verify-and-complete dev-experience triple: docker-compose.dev.yml api+worker shared volumes (SC#3) + vite proxy http://api:3000 (SC#4) + apiClient.get cache:no-store with mutation-bypass regression test (SC#5)


### Phase 10: Bulk Operations
**Goal**: User can manage content at scale via CSV upload/export, bulk queue modifications, and bulk profile-level actions
**Depends on**: Phase 5
**Requirements**: BULK-01, BULK-02, BULK-03, BULK-04, BULK-05, BULK-06, BULK-07, BULK-08, BULK-09, BULK-10, BULK-11
**Success Criteria** (what must be TRUE):
  1. User can upload a CSV file to create scheduled posts or queue posts in bulk, with scheduling options and tag assignment; Twitter uploads apply pre-flight rate limit check
  2. User can export scheduled posts and queue posts as CSV (with current filters applied)
  3. User can randomize, purge, copy, bulk-modify text, and remove duplicates in a queue; bulk operations run as async BullMQ jobs with completion notification
  4. User can bulk pause, resume, or delete scheduled posts and queues for a profile
**Plans**: 8 plans
Plans:
- [x] 10-01-PLAN.md -- Wave 0 foundation: csv-parse/csv-stringify install, twitter-text hoist to @sms/shared, shared Zod schemas + queue constants + normalize-text/platform-char-count helpers, RED test scaffolds + CSV/JSON fixtures
- [x] 10-02-PLAN.md -- bulk_operations table schema + extend post_status enum with paused, [BLOCKING] drizzle-kit push
- [x] 10-03-PLAN.md -- API: CSV import route (multer + csv-parse + Twitter pre-flight), CSV export endpoints, 8 bulk-action endpoints on /posts and /queues, bulk-ops queue producer, rate limiter, Bull-Board registration
- [x] 10-04-PLAN.md -- Worker dispatcher + 5 handlers (csv-import-scheduled, csv-import-queue, queue-randomize, queue-purge, queue-copy)
- [x] 10-05-PLAN.md -- Worker remaining 5 handlers (text-modify, dedupe, profile-pause, profile-resume, profile-bulk-delete) + drainDelayedJobs helper + bulk-completed notification handler stub fill
- [x] 10-06-PLAN.md -- Web foundation: TanStack table conversion of QueuePostsPage, RowSelectionState extensions, BulkActionsDropdown + SelectionSummaryBar + ConfirmSimpleDialog + ConfirmDestructiveDialog (dismiss-label discipline), 11 useBulkOps mutations, apiClient multipart/Blob helpers, PostStatusBadge paused variant
- [x] 10-07-PLAN.md -- Web: 9 specific bulk dialogs with exact UI-SPEC dismiss labels, BulkImportPage + FileDropZone + pre-flight cap banner, NotificationBell bulk-op-finished/failed variants, Sidebar Import Posts nav, /posts/import route
- [x] 10-08-PLAN.md -- Verification: testcontainers full-stack integration, web flow integration, finalize 10-VALIDATION.md (status:complete, nyquist_compliant:true), human checkpoint for manual-only behaviors
**UI hint**: yes

### Phase 11: Snippets, Search, Calendar & Polish
**Goal**: User has productivity tools (saved text snippets, full-text search, calendar visualization) and the security policy for future AI integration
**Depends on**: Phase 8, Phase 9
**Requirements**: SNIP-01, SNIP-02, SNIP-03, SEARCH-01, SEARCH-02, CAL-01, CAL-02, CAL-03, CAL-04, POST-CMN-08, SEC-07
**Success Criteria** (what must be TRUE):
  1. User can create, edit, and delete text snippets (hashtag sets or text snippets); "Insert Snippet" button on all post forms inserts content at cursor position; CSV uploads support `{{snippet:name}}` syntax
  2. Full-text search works across scheduled posts, queue posts, and calendar view using PostgreSQL tsvector with highlighted matching terms
  3. Calendar shows monthly, weekly, and daily views of all scheduled posts and queue runs; entries are color-coded by platform; clicking an entry opens edit, clicking empty slot opens creation pre-filled with that datetime
  4. Calendar highlights conflicting time slots (same profile within 5 minutes) with visual indicator; filterable by platform, profile, and tags
  5. OpenAI API key handling follows SEC-07 policy: never persisted, passed per-request only, never in job payloads, Redis, or logs
**Plans**: 11 plans
Plans:
- [ ] 11-01-PLAN.md — Wave 0 shared utilities: snippet-tokens util + Zod schemas (snippets, calendar, posts response extension)
- [ ] 11-02-PLAN.md — SEC-07: pino redact extension + BullMQ schema contract test + SECURITY.md
- [ ] 11-03-PLAN.md — Drizzle schema (snippets table, posts.search_vector + tag_search_vector) + migration 0009 with hand-edited tsvector + GIN + trigger SQL
- [ ] 11-04-PLAN.md — [BLOCKING] Apply migration 0009 + verify via psql + EXPLAIN
- [ ] 11-05-PLAN.md — Snippet CRUD service + routes + integration tests (cross-tenant isolation, duplicate-name 409)
- [ ] 11-06-PLAN.md — post.service FTS rewrite (plainto_tsquery + ts_headline + ts_rank) + scope-by-view + real-Postgres integration test (GIN hit, cross-tenant)
- [ ] 11-07-PLAN.md — Calendar API: GET /api/calendar with windowed query + hasConflict (reusing checkConflicts) + filter integration tests
- [ ] 11-08-PLAN.md — CSV bulk-import handlers wire substituteSnippetsInText + tests for missing/cross-tenant cases
- [ ] 11-09-PLAN.md — Snippets web surface: useSnippets hooks + SnippetPicker (cursor-capture) + SnippetFormDialog + SnippetsPage + SharedPostFields integration
- [ ] 11-10-PLAN.md — headline-to-mark allowlist parser + QueuePostsPage search input + render headline in posts/queue lists
- [ ] 11-11-PLAN.md — Calendar UI: install react-big-calendar + luxonLocalizer + CalendarPage with custom toolbar + filter bar + sidebar/route wiring + platform color tokens
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 6.1 -> 6.2 -> 6.3 -> 6.4 -> 6.5 -> 6.6 -> 7 -> 7.1 -> 8 -> 8.1 -> 9 -> 9.1 -> 9.2 -> 10 -> 11
Note: Phases 6, 7, and 9 all depend on Phase 4 (not on each other) and could theoretically overlap.
Note: Phases 6.1-6.5 are gap closure phases inserted after v1.0 milestone audit. 6.4 and 6.5 both depend on 6.3; they are independent of each other.
Note: Phases 6.6, 7.1, 8.1, 9.2 are gap closure phases inserted after the 2026-04-29 code-grounded re-verification — each closes partial/unsatisfied requirements within its parent phase's scope.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure & Foundation | 0/5 | Verified satisfied (code) | - |
| 2. Authentication & User Account | 0/6 | Verified satisfied (code) | - |
| 3. Twitter Profile & Post Creation | -/- | Substantially built (no phase dir); 4 partials → 6.6 | - |
| 4. Publish Worker & Scheduled Posts | 6/6 | Complete    | 2026-04-10 |
| 5. Queue Engine | 5/5 | Complete | 2026-04-15 |
| 6. Media Handling | 6/6 | Complete | 2026-04-16 |
| 6.1 Production Deployment Wiring | 3/3 | Complete | - |
| 6.2 Test & Build Stabilization + Migration Runner Hardening | 3/3 | Complete | - |
| 6.3 Queue Engine Bug Fixes | 2/2 | Complete | - |
| 6.4 Wire Media-Post Association | 2/2 | Complete | - |
| 6.5 Nginx Proxy Completion | 1/1 | Complete (paperwork pending in 9.2) | - |
| 6.6 Twitter Publish Path + State Guard | 0/TBD | Gap closure (planning) | - |
| 7. Multi-Platform Profiles & Token Lifecycle | -/- | Substantially built (no phase dir); 3 partials + 1 gap → 7.1 | - |
| 7.1 Profile UX Polish | 0/TBD | Gap closure (planning) | - |
| 8. LinkedIn & Facebook Post Creation | -/- | Substantially built (no phase dir); 1 partial → 8.1 | - |
| 8.1 Rate Limit Dashboard Widget | 0/TBD | Gap closure (planning) | - |
| 9. Notifications & Settings | 6/6 | Complete | - |
| 9.1 Notifications & Settings Polish | 3/3 | Complete | - |
| 9.2 Tech Debt Sweep | 0/TBD | Gap closure (planning) | - |
| 10. Bulk Operations | 0/TBD | Not started | - |
| 11. Snippets, Search, Calendar & Polish | 0/11 | Planned | - |
