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
- [ ] **Phase 7: Multi-Platform Profiles & Token Lifecycle** - LinkedIn and Facebook OAuth connections, profile management UI, token health monitoring, auto-refresh
- [ ] **Phase 8: LinkedIn & Facebook Post Creation** - LinkedIn share forms, Facebook post forms, LinkedIn and Facebook rate limit tracking
- [ ] **Phase 9: Notifications & Settings** - In-app notification bell, SMTP email notifications, notification preferences, email logs
- [ ] **Phase 10: Bulk Operations** - CSV upload and export, bulk queue operations (randomize, purge, copy, text modify, deduplicate), bulk pause/resume/delete
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
**Plans**: 5 plans
Plans:
- [ ] 01-01-PLAN.md — Monorepo scaffold, package skeletons, Drizzle ORM infrastructure, web stub
- [ ] 01-02-PLAN.md — Docker Compose (prod + dev), Dockerfile, nginx, env template
- [ ] 01-03-PLAN.md — AES-256-GCM encryption module (TDD)
- [ ] 01-04-PLAN.md — Express API server, middleware stack, health endpoint, worker heartbeat
- [ ] 01-05-PLAN.md — Integration verification, baseline migration, human sign-off
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
- [ ] 06.2-02-PLAN.md — migrate.ts hardening: sql.reserve() + advisory lock + per-migration transaction + narrowed duplicate codes
- [ ] 06.2-03-PLAN.md — migrate.test.ts (6 D-08 scenarios) + test harness + vitest coverage config

### Phase 6.3: Queue Engine Bug Fixes
**INSERTED** — Gap closure from v1.0 milestone audit
**Goal**: Queue engine runtime bugs identified during audit are fixed — no race conditions, stuck states, or silent failures
**Depends on**: Phase 6.2
**Requirements**: Affects QUEUE-01 through QUEUE-06, WORKER-09
**Gap Closure**: WR-01, WR-02, WR-04, WR-05, IN-02, IN-03
**Success Criteria** (what must be TRUE):
  1. Recycling bulk update and MIN(queue_position) select run in a single transaction (WR-01)
  2. `removePostFromQueue` clears queued status and queueId atomically (WR-02)
  3. QueueStatusBadge seasonal pause shows correctly for Nov-Jan windows year-round (WR-04)
  4. `useRemoveFromQueue` shows error toast on failure (WR-05)
  5. Queue list displays profile name instead of '-' (IN-02)
  6. Queue scanner logger is created at module scope, not per tick (IN-03)
**Plans**: TBD

### Phase 7: Multi-Platform Profiles & Token Lifecycle
**Goal**: User can connect LinkedIn and Facebook profiles alongside Twitter, with token health monitoring and automatic refresh
**Depends on**: Phase 4
**Requirements**: PROFILE-02, PROFILE-03, PROFILE-04, PROFILE-05, PROFILE-06, PROFILE-07, PROFILE-08, TOKEN-01, TOKEN-02, TOKEN-03, TOKEN-04, TOKEN-05
**Success Criteria** (what must be TRUE):
  1. User can connect a LinkedIn Personal Profile and Company Page via OAuth 2.0, and a Facebook Page via OAuth (short-lived to long-lived token exchange)
  2. Profile list shows all connected profiles with network icon, token health badge (green/yellow/red), and last published date; filterable by network
  3. LinkedIn tokens auto-refresh 7 days before expiry; Facebook Page tokens are monitored via test API call (not expiry date); Twitter token revocation detected via 401
  4. Profiles with expired or invalid tokens are excluded from the publish loop with a clear error message and notification
**Plans**: 5 plans
Plans:
- [ ] 01-01-PLAN.md — Monorepo scaffold, package skeletons, Drizzle ORM infrastructure, web stub
- [ ] 01-02-PLAN.md — Docker Compose (prod + dev), Dockerfile, nginx, env template
- [ ] 01-03-PLAN.md — AES-256-GCM encryption module (TDD)
- [ ] 01-04-PLAN.md — Express API server, middleware stack, health endpoint, worker heartbeat
- [ ] 01-05-PLAN.md — Integration verification, baseline migration, human sign-off
**UI hint**: yes

### Phase 8: LinkedIn & Facebook Post Creation
**Goal**: User can create and publish LinkedIn shares and Facebook posts with platform-specific forms, previews, and rate limit tracking
**Depends on**: Phase 7
**Requirements**: POST-LI-01, POST-LI-02, POST-LI-03, POST-LI-04, POST-LI-05, POST-FB-01, POST-FB-02, POST-FB-03, POST-FB-04, POST-FB-05, POST-FB-06, LIMIT-06, LIMIT-07, LIMIT-08
**Success Criteria** (what must be TRUE):
  1. User can create a LinkedIn share (text-only or with image) with visibility selector and real-time character count (3,000 max); live preview approximates LinkedIn rendering
  2. User can create a Facebook post (text, up to 10 images, video, optional URL) with real-time character count (63,206 max); live preview approximates Facebook rendering
  3. LinkedIn and Facebook posts publish through the existing worker pipeline with the same retry, state machine, and idempotency guarantees as Twitter
  4. Dashboard widget shows current API usage vs. limit for each connected profile (color-coded green/yellow/red) across all platforms
**Plans**: 5 plans
Plans:
- [ ] 01-01-PLAN.md — Monorepo scaffold, package skeletons, Drizzle ORM infrastructure, web stub
- [ ] 01-02-PLAN.md — Docker Compose (prod + dev), Dockerfile, nginx, env template
- [ ] 01-03-PLAN.md — AES-256-GCM encryption module (TDD)
- [ ] 01-04-PLAN.md — Express API server, middleware stack, health endpoint, worker heartbeat
- [ ] 01-05-PLAN.md — Integration verification, baseline migration, human sign-off
**UI hint**: yes

### Phase 9: Notifications & Settings
**Goal**: User receives timely alerts for publish failures, token issues, and rate limits via in-app bell and email; notification preferences are configurable
**Depends on**: Phase 4
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07, NOTIF-08, NOTIF-09, SETTINGS-02, SETTINGS-03
**Success Criteria** (what must be TRUE):
  1. In-app notification bell in the header shows unread count and dropdown of recent notifications (publish failures, token expiry, rate limits, queue empty)
  2. Email notifications send via configured SMTP for publish failures, token expiry, and rate limit events
  3. User can configure notification preferences per event type (enable/disable email and/or in-app where applicable)
  4. Email logs view shows a paginated, filterable list of all system emails sent
**Plans**: 5 plans
Plans:
- [ ] 01-01-PLAN.md — Monorepo scaffold, package skeletons, Drizzle ORM infrastructure, web stub
- [ ] 01-02-PLAN.md — Docker Compose (prod + dev), Dockerfile, nginx, env template
- [ ] 01-03-PLAN.md — AES-256-GCM encryption module (TDD)
- [ ] 01-04-PLAN.md — Express API server, middleware stack, health endpoint, worker heartbeat
- [ ] 01-05-PLAN.md — Integration verification, baseline migration, human sign-off
**UI hint**: yes

### Phase 10: Bulk Operations
**Goal**: User can manage content at scale via CSV upload/export, bulk queue modifications, and bulk profile-level actions
**Depends on**: Phase 5
**Requirements**: BULK-01, BULK-02, BULK-03, BULK-04, BULK-05, BULK-06, BULK-07, BULK-08, BULK-09, BULK-10, BULK-11
**Success Criteria** (what must be TRUE):
  1. User can upload a CSV file to create scheduled posts or queue posts in bulk, with scheduling options and tag assignment; Twitter uploads apply pre-flight rate limit check
  2. User can export scheduled posts and queue posts as CSV (with current filters applied)
  3. User can randomize, purge, copy, bulk-modify text, and remove duplicates in a queue; bulk operations run as async BullMQ jobs with completion notification
  4. User can bulk pause, resume, or delete scheduled posts and queues for a profile
**Plans**: 5 plans
Plans:
- [ ] 01-01-PLAN.md — Monorepo scaffold, package skeletons, Drizzle ORM infrastructure, web stub
- [ ] 01-02-PLAN.md — Docker Compose (prod + dev), Dockerfile, nginx, env template
- [ ] 01-03-PLAN.md — AES-256-GCM encryption module (TDD)
- [ ] 01-04-PLAN.md — Express API server, middleware stack, health endpoint, worker heartbeat
- [ ] 01-05-PLAN.md — Integration verification, baseline migration, human sign-off
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
**Plans**: 5 plans
Plans:
- [ ] 01-01-PLAN.md — Monorepo scaffold, package skeletons, Drizzle ORM infrastructure, web stub
- [ ] 01-02-PLAN.md — Docker Compose (prod + dev), Dockerfile, nginx, env template
- [ ] 01-03-PLAN.md — AES-256-GCM encryption module (TDD)
- [ ] 01-04-PLAN.md — Express API server, middleware stack, health endpoint, worker heartbeat
- [ ] 01-05-PLAN.md — Integration verification, baseline migration, human sign-off
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 6.1 -> 6.2 -> 6.3 -> 7 -> 8 -> 9 -> 10 -> 11
Note: Phases 6, 7, and 9 all depend on Phase 4 (not on each other) and could theoretically overlap.
Note: Phases 6.1-6.3 are gap closure phases inserted after v1.0 milestone audit. 6.3 depends on 6.2 (needs passing tests first).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure & Foundation | 0/5 | Planning complete | - |
| 2. Authentication & User Account | 0/6 | Planning complete | - |
| 3. Twitter Profile & Post Creation | 0/TBD | Not started | - |
| 4. Publish Worker & Scheduled Posts | 6/6 | Complete    | 2026-04-10 |
| 5. Queue Engine | 5/5 | Complete | 2026-04-15 |
| 6. Media Handling | 6/6 | Complete | 2026-04-16 |
| 6.1 Production Deployment Wiring | 0/TBD | Gap closure | - |
| 6.2 Test & Build Stabilization + Migration Runner Hardening | 0/TBD | Gap closure | - |
| 6.3 Queue Engine Bug Fixes | 0/TBD | Gap closure | - |
| 7. Multi-Platform Profiles & Token Lifecycle | 0/TBD | Not started | - |
| 8. LinkedIn & Facebook Post Creation | 0/TBD | Not started | - |
| 9. Notifications & Settings | 0/TBD | Not started | - |
| 10. Bulk Operations | 0/TBD | Not started | - |
| 11. Snippets, Search, Calendar & Polish | 0/TBD | Not started | - |
