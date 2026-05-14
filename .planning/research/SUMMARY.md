# Project Research Summary

**Project:** Self-Hosted Social Media Scheduler
**Domain:** Social media scheduling and queue automation (SocialOomph replacement)
**Researched:** 2026-04-07
**Confidence:** HIGH

## Executive Summary

This is a self-hosted social media scheduling tool built as a direct replacement for SocialOomph, targeting a single operator running the stack on Proxmox via Docker Compose. The product has two distinct complexity centers: the queue automation engine (persistent post pools with interval-based scheduling, recycling, and spinnable text) and the background publish worker (BullMQ on Redis, with retry semantics, idempotency, and dead-letter queue). Both are harder to build correctly than they look. The recommended approach is a Node.js 22 + Express 5 + React/Vite monorepo with PostgreSQL 17, Redis 7.4, and BullMQ — a well-understood stack with strong TypeScript coverage and no binary engine dependencies.

The most important architectural decision is to keep the web API and the worker as completely separate processes from day one. Running cron-style checks inside the Express process is the most common mistake in this domain and produces systems that lose jobs on restart, can't retry, and can't detect duplicate publishes. The BullMQ producer-consumer split is non-negotiable. A close second is getting idempotency right before the first post is published: the `platform_post_id` check prevents duplicate posts whenever a stalled job is retried, which will happen in any real deployment.

The primary external risk is Twitter/X API pricing instability. The 500-tweet free tier referenced in the PRD was discontinued in February 2026. The constraint is now financial (pay-per-use at $0.01/tweet), not volumetric, so rate-limit tracking must be designed as configurable rather than hardcoded. A secondary risk is the OAuth + HTTPS dependency: LinkedIn and Facebook both require verified HTTPS callback URLs, and getting TLS working on a self-hosted Proxmox server (via Cloudflare Tunnel or Let's Encrypt) must be solved in Phase 1 before any OAuth work begins.

## Key Findings

### Recommended Stack

The stack is a TypeScript-first monorepo (`npm workspaces`) with four packages: `shared` (types + Zod schemas), `db` (Drizzle ORM schema + migrations), `api` (Express 5), `worker` (BullMQ consumers), and `web` (Vite + React 19). Drizzle ORM is preferred over Prisma for this project: no binary query engine, SQL-transparent API, instant type inference, and no `generate` step. Redis 7.4 is locked (not 8.x) due to new SSPL licensing and less ecosystem testing. BullMQ 5.x requires Redis 6.2+ and is the right tool for every async operation in the system.

**Core technologies:**
- Node.js 22 LTS: runtime — active LTS until April 2027, satisfies Vite 8 and Express 5 minimums
- Express 5.2.x: HTTP API — stable since March 2025, native async error handling
- Vite 8 + React 19: SPA — fastest DX, no SSR needed for self-hosted tool
- PostgreSQL 17: primary data store — proven stable, runs until Nov 2029
- Redis 7.4-alpine: queue broker + session store — BullMQ-tested, stable licensing
- BullMQ 5.x: job queue — cron scheduling, stalled detection, dead-letter, retry with backoff
- Drizzle ORM 0.45.x: database access — zero binary deps, TypeScript-native, SQL-transparent
- Luxon 3.5.x: timezone handling — built-in IANA support critical for DST-safe scheduling
- argon2 0.41.x: password hashing — argon2id, winner of Password Hashing Competition
- twitter-api-v2 1.29.x: Twitter client — zero deps, OAuth 1.0a, v1.1+v2, full TypeScript
- Direct HTTP calls: LinkedIn API — no maintained official Node SDK exists
- facebook-nodejs-business-sdk 24.0.x: Facebook Graph API — Meta's official SDK

See `STACK.md` for full dependency list, version compatibility matrix, and Docker image strategy.

### Expected Features

The core value proposition is SocialOomph parity: queue-based scheduling with interval + day/hour windows, post recycling (evergreen loops), and spinnable text (`{opt1|opt2}` resolved at publish time). These are the features users can't easily get from SaaS competitors. Twitter-only for Phase 1, LinkedIn + Facebook in Phase 2.

**Must have (table stakes):**
- Twitter/X OAuth 1.0a connection using user's own Developer App credentials
- Post creation: text, up to 4 images, thread via `[[tweet]]` separator
- Character counting via `twitter-text` (handles URL weighting, CJK, emoji)
- Post state machine: draft → scheduled → publishing → published → failed
- Background worker: BullMQ + Redis with retry (exponential backoff, max 3), dead-letter queue, stalled job detection
- Queue system: CRUD + schedule config (interval, days-of-week, hour windows)
- Queue post management: add, edit, delete, reorder, recycle toggle
- Post recycling: move to end of queue after publish for evergreen content
- Spinnable text `{opt|opt}`: resolved randomly at publish time
- Token encryption at rest: AES-256-GCM with IV + auth tag
- Media upload: local filesystem via Docker volume, thumbnail generation via sharp
- Rate limit tracking: configurable for pay-per-use and legacy plan models
- Docker Compose deployment: web, worker, postgres, redis, nginx

**Should have (competitive differentiators):**
- LinkedIn + Facebook integration (Phase 2)
- Auto-destruct posts: schedule delete API call after configured duration
- CSV bulk upload/download: SocialOomph parity for bulk content management
- Bulk queue operations: randomize, purge, copy, text modify, deduplicate
- Notification system: in-app bell + SMTP email for failures and token expiry
- 2FA (TOTP) via `otpauth`
- OAuth token lifecycle management: health monitoring and auto-refresh

**Defer (Phase 3+):**
- Calendar view (significant UI effort — monthly/weekly/daily with conflict detection)
- AI post generation (OpenAI, user's own key)
- Webhooks (inbound HTTP POST — requires public endpoint, adds attack surface)
- Full-text post search (PostgreSQL tsvector + GIN, low urgency for single-user)
- Hashtag sets and saved text snippets
- Video upload + async transcoding (lower priority media type)

See `FEATURES.md` for full prioritization matrix and competitor analysis.

### Architecture Approach

The system splits into two independent Docker services: a web service (Express API + React SPA served as static files) and a worker service (BullMQ consumers only — no HTTP). They communicate exclusively via Redis-backed BullMQ queues. The API enqueues jobs and returns immediately; the worker processes them asynchronously. PostgreSQL holds all persistent state; Redis holds job queues, sessions, and rate limit counters. OAuth tokens travel from PostgreSQL to worker memory (decrypted) to platform API call, then are discarded — they never touch Redis and never appear in logs.

**Major components:**
1. nginx (TLS termination, reverse proxy, static asset caching, OAuth callback routing)
2. Express API (REST, authentication, session/CSRF, request validation, job enqueueing)
3. React SPA (post creation forms, queue management, settings — served as static files)
4. BullMQ Worker (publish, transcode, token-refresh, auto-destruct, cleanup, notifications)
5. Redis (job queue broker, session store, rate limit counters, worker heartbeat)
6. PostgreSQL (users, profiles, posts, queues, media metadata, publish logs)
7. Docker Volume (media files at `{storage_root}/media/{profile_id}/{year}/{month}/{uuid}.ext`)

**Key patterns:**
- Named queues per job type: `publish` (concurrency 5), `transcode` (1), `token-refresh` (2), `auto-destruct` (3), `notification` (2), `bulk` (1)
- Optimistic locking via `post_version` integer: worker verifies version before making platform API call
- Correlation IDs through the full chain: HTTP request → job data → worker logs → platform API call
- Monorepo with `packages/shared` for Zod schemas and TypeScript types shared between API and worker

See `ARCHITECTURE.md` for full data flow diagrams, anti-patterns, and migration strategy.

### Critical Pitfalls

1. **Twitter/X API pricing change** — The 500-tweet free tier no longer exists (discontinued Feb 2026). Rate-limit tracking must be configurable (pay-per-use cost budget vs. hard monthly cap). Hardcoding 500 is wrong. Address in Phase 1 before building rate-limit tracking.

2. **BullMQ stalled jobs cause double-publishing** — If the publish worker's event loop is blocked past `lockDuration`, BullMQ retries the job. Without an idempotency check (`platform_post_id` already set?), the post publishes twice. This check must be in the first version of the publish worker, not added later. Combine with graceful SIGTERM handling and `stop_grace_period: 30s` in Docker Compose.

3. **Redis `maxmemory-policy` silently corrupts queue state** — Default Redis config allows key eviction. BullMQ keys evicted under memory pressure cause jobs to vanish without error. Set `maxmemory-policy noeviction` and `appendonly yes` in the Docker Compose Redis command. Must be correct before the first queue is used.

4. **HTTPS required before any OAuth integration** — LinkedIn and Facebook reject non-HTTPS callback URLs. Self-hosted Proxmox has no automatic TLS. Choose Cloudflare Tunnel (recommended: free, works behind NAT) or Let's Encrypt + nginx. Decide in Phase 1; it gates all OAuth work.

5. **DST transitions break queue schedules** — Cron-style queues scheduled without timezone awareness publish an hour early or late twice a year. Use BullMQ's `tz` option (`{ pattern: '0 9 * * *', tz: 'America/New_York' }`). Store IANA timezone identifiers, not pre-computed UTC offsets. Use Luxon for all schedule math. Must be correct from day one of the queue engine.

6. **Encryption key loss requires re-authenticating every profile** — The `ENCRYPTION_KEY` env var is the single point of failure for all stored OAuth tokens. Back it up outside the Proxmox server (password manager) on day one. Add a startup check that refuses to run without it. Test key rotation before it's needed in production.

7. **Facebook Page token lifecycle is not "60-day refresh"** — Page tokens derived from long-lived User tokens do not expire by time. Building auto-refresh logic targeting a 60-day cycle wastes rate limit quota and may break working tokens. Store `token_expires_at` as NULL for Page tokens; validate health via periodic test API calls instead.

See `PITFALLS.md` for the full list including integration gotchas, performance traps, and security mistakes.

## Implications for Roadmap

Based on the combined research, the architecture's natural dependency graph and the pitfall-to-phase mappings suggest a 6-phase structure. Each phase delivers a deployable system that validates the next phase's work.

### Phase 1: Infrastructure and Foundation

**Rationale:** Every other phase depends on this. HTTPS must work before OAuth. Redis config must be correct before any queue work. Encryption key management must be established before any token is stored. This phase has the highest number of Phase 1 pitfall items in `PITFALLS.md` (Redis eviction policy, HTTPS, encryption key strategy).
**Delivers:** Running Docker Compose stack with correct Redis config, HTTPS via Cloudflare Tunnel or Let's Encrypt, monorepo scaffolding (`shared`, `db`, `api` skeleton, `worker` skeleton, `web` scaffold), Drizzle schema + migration runner, health check endpoint, structured JSON logging with correlation IDs, user auth (login, argon2id password, session, CSRF).
**Addresses:** User auth, health check, Docker deployment, token encryption infrastructure.
**Avoids:** Redis key eviction (set `noeviction` from first `docker-compose.yml`), HTTPS gap that blocks all OAuth work, encryption key loss (document backup procedure before first token is stored).

### Phase 2: Twitter Integration and Core Post Publishing

**Rationale:** Twitter is the primary platform and the one with the most API quirks (OAuth 1.0a read+write permissions, v2 media endpoint, pay-per-use pricing changes). Validating the entire publish pipeline with one platform before adding others is the right order. The post state machine and worker must be solid here because everything downstream depends on them.
**Delivers:** Twitter OAuth 1.0a connection (user's own Developer App credentials), post creation (text, up to 4 images, thread via `[[tweet]]` separator), character counting via `twitter-text`, media upload to Docker volume with thumbnail generation, post state machine (draft/scheduled/publishing/published/failed), BullMQ publish worker with retry + dead-letter + idempotency check, scheduled posts list with filtering, configurable rate limit tracking (pay-per-use + legacy plan modes).
**Addresses:** Twitter post creation, background worker, post state machine, media upload, rate limit tracking.
**Avoids:** Twitter media 403 errors (test with images during profile setup, not later), double-publishing (idempotency check from day one), worker graceful shutdown (SIGTERM handling + `stop_grace_period: 30s`).

### Phase 3: Queue Engine and Scheduling

**Rationale:** The queue system is the most complex feature in the product and the primary reason to build this instead of using a simpler scheduler. It depends on Phase 2's post state machine and publish worker being solid. DST-awareness must be built in from the start — it's the hardest to retrofit.
**Delivers:** Queue CRUD (name, description, profile assignment), queue schedule config (interval, days-of-week, hour windows, seasonal window), queue scheduler worker (timezone-aware cron via BullMQ's `tz` option), queue post management (add, edit, delete, reorder), post recycling (move to end after publish), spinnable text resolution `{opt|opt}` at publish time, draft posts.
**Addresses:** Queue system, queue scheduling engine, queue post management, post recycling, spinnable text.
**Avoids:** DST schedule drift (Luxon + BullMQ `tz` option, IANA timezone storage from day one), stalled job crashes (graceful shutdown already implemented in Phase 2).

### Phase 4: Multi-Platform Integration

**Rationale:** LinkedIn and Facebook OAuth both require the HTTPS infrastructure from Phase 1. Building both platforms together is efficient because they share the same token lifecycle patterns. Facebook's token complexity (Page tokens vs. User tokens) and LinkedIn's API versioning are documented pitfalls that require care.
**Delivers:** LinkedIn OAuth 2.0 connection (Personal Profile + Company Page), LinkedIn post creation (text, single image, visibility control), Facebook OAuth 2.0 connection (Pages only), Facebook post creation (text, up to 10 images, video URL), correct Facebook Page token lifecycle (no expiry date, health via test API calls), LinkedIn API version as a configuration constant (not hardcoded), OAuth token health monitoring with green/yellow/red indicators, token auto-refresh for LinkedIn/Facebook.
**Addresses:** LinkedIn integration, Facebook integration, OAuth token lifecycle management, token health indicators.
**Avoids:** Facebook 60-day refresh misconception (Page tokens don't expire by time), LinkedIn API version hardcoding (it sunsets annually), LinkedIn rate limit exhaustion (cache token introspection results).

### Phase 5: Notifications, Power Features, and Polish

**Rationale:** These features add operational value but don't block core scheduling. CSV and bulk operations are natural complements to the queue engine. Notifications are straightforward with nodemailer but require SMTP config decisions. 2FA is independent.
**Delivers:** Notification system (in-app bell + SMTP email for publish failures, token expiry, queue empty events), 2FA via TOTP (`otpauth`), tags (CRUD, apply to posts, filter), post preview panels (Twitter-rendered text with character count, platform-specific previews), CSV bulk upload/download (scheduling options, validation, rate limit pre-flight), bulk queue operations (randomize, purge, copy, text modify, deduplicate), video upload + async transcoding via ffmpeg in separate BullMQ queue.
**Addresses:** Notifications, 2FA, tags, CSV bulk operations, video media.
**Avoids:** ffmpeg blocking publish jobs (separate `transcode` queue with concurrency: 1, never inside publish worker).

### Phase 6: Advanced Features

**Rationale:** These features have the highest implementation cost relative to core scheduling value. Calendar view is significant UI work. Auto-destruct requires careful handling of partial thread failures. Webhooks add attack surface and require a public endpoint.
**Delivers:** Auto-destruct posts (BullMQ delayed delete API call, persistent — not `setTimeout`), calendar view (monthly/weekly/daily, color-coded by platform, click-to-create, conflict detection for 5-minute window), post search (PostgreSQL tsvector + GIN index), hashtag sets and saved text snippets, webhooks (inbound HTTP POST with HMAC-SHA256 verification and IP allowlist), AI post generation (OpenAI, user's own key, posts land as drafts).
**Addresses:** Auto-destruct, calendar view, full-text search, snippets, webhooks, AI generation.
**Avoids:** Auto-destruct via `setTimeout` (must use BullMQ delayed jobs — timers don't survive restarts), Twitter thread partial publish (store each tweet ID, handle mid-thread failure gracefully).

### Phase Ordering Rationale

- Phase 1 before everything: HTTPS and Redis config gate all OAuth and queue work. Encryption key management gates all token storage.
- Phase 2 before Phase 3: The queue scheduling engine in Phase 3 depends on the publish worker and post state machine being solid. Debugging queue logic on a flaky worker is painful.
- Phase 2 before Phase 4: Twitter's OAuth 1.0a is the simplest to get right. Facebook and LinkedIn are harder (multi-step token exchange, API versioning). Proving the OAuth + publish pipeline works on one platform before multiplying it is the right order.
- Phase 3 before Phase 5: CSV bulk upload and bulk queue operations require the queue system to exist.
- Phase 4 and Phase 5 can partially overlap: notification work (email/in-app) is independent of platform-specific work and can begin mid-Phase 4.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Twitter pay-per-use pricing model details and current API tier behavior need verification at implementation time. The OAuth 1.0a + media upload 403 issue (see `PITFALLS.md` Pitfall 2) is an active community bug — check developer forums for current status before building media upload.
- **Phase 4:** LinkedIn API version must be verified at implementation time (it sunsets annually). Current supported version and rate limits should be looked up immediately before building, not based on research done months earlier. Facebook Data Access Expiry (90-day inactivity) is a separate system from token expiry — needs careful handling.
- **Phase 6:** Webhook security posture (HMAC verification + IP allowlist) needs a specific implementation decision. Cloudflare Tunnel behavior with inbound webhooks should be tested before building the feature.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Docker Compose, nginx TLS termination, Express session + CSRF, argon2id password hashing — all well-documented, established patterns.
- **Phase 3:** BullMQ timezone-aware cron, Luxon IANA scheduling, queue CRUD — well-documented. BullMQ docs cover the `tz` option explicitly.
- **Phase 5:** nodemailer SMTP, TOTP via otpauth, PostgreSQL tsvector — standard patterns with good documentation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official docs and npm packages verified for all core dependencies. Version compatibility matrix confirmed. Drizzle vs Prisma comparison from multiple sources including official docs. |
| Features | HIGH | PRD is comprehensive and specific. Competitor landscape (SocialOomph, Mixpost, Postiz) well-documented. Twitter API pricing change verified from official announcement. |
| Architecture | HIGH | Producer-consumer BullMQ pattern is well-documented with official code examples. Monorepo structure reflects established Node.js patterns. Data flows are explicit and verifiable. |
| Pitfalls | HIGH | Critical pitfalls sourced from official API docs and active developer community reports (not hypothetical). Twitter pay-per-use issue, BullMQ stalled jobs, Redis eviction, Facebook token lifecycle all have verified primary sources. |

**Overall confidence:** HIGH

### Gaps to Address

- **Twitter pay-per-use 403 media bug:** As of research date (April 2026), there are active developer forum reports of 403 errors on media posts with OAuth 1.0a under pay-per-use accounts. This may be resolved by implementation time, or may require a workaround. Verify current status before starting Phase 2 media upload work.
- **Twitter rate limit tracking design:** The configurable rate-limit tracker needs a concrete data model design (hard cap mode vs. cost-budget mode, configurable thresholds). This is a design decision, not a research gap, but it should be settled before Phase 2 begins.
- **Cloudflare Tunnel vs. Let's Encrypt decision:** Both HTTPS strategies are valid. The choice affects Phase 1 infrastructure. Should be decided based on the operator's network setup (NAT, ISP restrictions) before Phase 1 implementation begins.
- **LinkedIn current API version:** LinkedIn API versions are dated (YYYYMM format) and each is supported for one year. The exact version string to target should be verified at Phase 4 implementation time.

## Sources

### Primary (HIGH confidence)
- [Express 5.1.0 stable release announcement](https://expressjs.com/2025/03/31/v5-1-latest-release.html)
- [BullMQ Redis Compatibility docs](https://docs.bullmq.io/guide/redis-tm-compatibility)
- [BullMQ Stalled Jobs docs](https://docs.bullmq.io/guide/workers/stalled-jobs)
- [BullMQ Going to Production guide](https://docs.bullmq.io/guide/going-to-production)
- [Drizzle ORM docs](https://orm.drizzle.team/docs/get-started/postgresql-new)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8)
- [twitter-api-v2 npm](https://www.npmjs.com/package/twitter-api-v2)
- [X API Pay-Per-Use Announcement](https://devcommunity.x.com/t/announcing-the-launch-of-x-api-pay-per-use-pricing/256476)
- [X API v2 Authentication Mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping)
- [Facebook Long-Lived Token Docs](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/)
- [LinkedIn Posts API docs](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)
- [LinkedIn API Rate Limiting docs](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits)
- [otpauth npm](https://www.npmjs.com/package/otpauth)

### Secondary (MEDIUM confidence)
- [X API Pricing 2026 — Postproxy](https://postproxy.dev/blog/x-api-pricing-2026/) — free tier discontinued Feb 2026, pay-per-use at $0.01/post
- [Drizzle vs Prisma — Bytebase 2026](https://www.bytebase.com/blog/drizzle-vs-prisma/) — Drizzle wins for single-dev Docker projects
- [Drizzle vs Prisma — MakerKit](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)
- [BullMQ Timezone Handling — Dragonfly FAQ](https://www.dragonflydb.io/faq/bullmq-handle-timezones)
- [Pino logger guide — SigNoz 2026](https://signoz.io/guides/pino-logger/) — 5x faster than Winston
- [Vitest vs Jest comparison — PkgPulse 2026](https://www.pkgpulse.com/blog/node-test-vs-vitest-vs-jest-native-test-runner-2026)
- [Argon2 password hashing guide 2025](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/)
- [DST Pitfalls in Cron Jobs — DEV Community](https://dev.to/cronmonitor/handling-timezone-issues-in-cron-jobs-2025-guide-52ii)

### Tertiary (LOW confidence / active community issues)
- [X Developer Community: OAuth 1.0a + Pay-Per-Use 403 Issues](https://devcommunity.x.com/t/pay-per-use-oauth-1-0a-post-2-tweets-with-media-ids-returns-403-you-are-not-permitted-to-perform-this-action-after-only-3-successful-image-posts/258317) — active bug, status may have changed by implementation time

---
*Research completed: 2026-04-07*
*Ready for roadmap: yes*
