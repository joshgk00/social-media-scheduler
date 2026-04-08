# Social Media Scheduler

## What This Is

A self-hosted social media scheduling tool for personal business use, running as a Docker Compose stack on Proxmox. It enables composing, scheduling, queuing, and publishing posts to Twitter/X, LinkedIn, and Facebook — without relying on third-party services or recurring subscription costs. Built as a SocialOomph replacement with full ownership of credentials and data.

## Core Value

Own the stack, own the data, own the credentials — persistent queue automation that publishes without hand-holding, backed by your own Twitter Developer App, on hardware you control.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Social Profiles**
- [ ] User can connect a Twitter/X profile via OAuth 1.1 using their own Developer App credentials (Consumer Key, Consumer Secret, Access Token, Access Token Secret)
- [ ] User can connect LinkedIn Personal Profile and Company Page via OAuth
- [ ] User can connect a Facebook Page via OAuth
- [ ] User can view, rename, add notes to, re-authenticate, and delete connected profiles
- [ ] Connected profiles show token health status (valid / expiring / expired) with color indicators

**Post Creation**
- [ ] User can create a Twitter/X post (text, images, GIF, video, thread via `[[tweet]]` separator)
- [ ] User can create a LinkedIn share (text-only or single image)
- [ ] User can create a Facebook post (text, images, URL, video)
- [ ] All post forms support: scheduling (specific datetime or publish now), draft save, internal notes, spinnable text `{opt|opt}`, tags, auto-destruct config
- [ ] Post text fields show real-time character count (Twitter uses `twitter-text` library; LinkedIn 3,000; Facebook 63,206)
- [ ] Post creation form shows a live preview approximating the target platform's rendering

**Scheduling**
- [ ] User can view all scheduled posts in a filterable list (by network, status, tag, profile)
- [ ] User can edit, delete, view history, and view full text of scheduled posts
- [ ] Background worker publishes posts at scheduled time with retry logic (exponential backoff, max 3 retries)
- [ ] Failed posts move to `failed` state after retry exhaustion and require manual intervention
- [ ] Auto-destruct: worker deletes published post from platform after configured time period

**Queue System**
- [ ] User can create and configure queues (name, profile, schedule: interval, days-of-week, hour windows, start date, seasonal window)
- [ ] User can add posts to a queue; queue posts cycle on schedule and optionally recycle
- [ ] User can reorder queue posts (move up/down) and manage posts per queue
- [ ] Queue scheduling engine runs continuously and independently of the web process

**Bulk Operations**
- [ ] User can upload posts via CSV (scheduled or queue, with scheduling options)
- [ ] User can export scheduled posts and queue posts as CSV
- [ ] User can randomize, purge, copy, bulk-modify text, remove duplicates in a queue
- [ ] User can bulk pause/resume posts and queues for a profile

**Post State Machine**
- [ ] Posts follow valid state transitions: draft → scheduled/queued → publishing → published/failed, with auto_destructing and destroyed end states
- [ ] Optimistic locking prevents publishing stale content when a post is edited during worker pickup

**Spinnable Text**
- [ ] `{option1|option2}` syntax is resolved at publish time by randomly selecting one variant
- [ ] Queue posts list shows "view spinnable variants" action

**Media**
- [ ] Media uploads (images, GIF, video) are stored on local filesystem (Docker volume) or S3-compatible backend
- [ ] Images are thumbnailed; videos are transcoded asynchronously via ffmpeg and block publishing until complete

**Tags**
- [ ] User can create, rename, and delete tags; apply multiple tags to posts for filtering

**User Account & Settings**
- [ ] User can configure email, username, timezone, date format, entries-per-page, profile image
- [ ] User can change password and enable/disable TOTP-based 2FA
- [ ] User can configure notification preferences (publish failures, token expiry, rate limit warnings, queue empty)

**Notifications**
- [ ] In-app notification bell with unread count and recent events dropdown
- [ ] Email notifications for publish failures, token expiry, rate limit events (via configured SMTP)

**OAuth Token Lifecycle**
- [ ] Background job monitors token expiry; auto-refreshes Facebook and LinkedIn tokens 7 days before expiry
- [ ] Profiles with expired tokens are excluded from the publish loop with a clear error; notification sent on refresh failure

**Platform Rate Limit Tracking**
- [ ] Twitter: track tweets/month vs 500-tweet free tier limit; warn at 80%, block at 500; pre-flight check on new scheduled posts and CSV uploads
- [ ] Dashboard widget shows current usage vs limit per profile (color-coded green/yellow/red)

**Security**
- [ ] OAuth tokens encrypted at rest using AES-256-GCM; encryption key from env var only
- [ ] Decrypted tokens never cached in Redis; decrypted in-memory only during publish, discarded immediately
- [ ] CSRF protection on all state-changing requests; HTTP-only Secure session cookies
- [ ] OpenAI API key never persisted (passed per-request, never stored or logged)
- [ ] Security headers via `helmet` (CSP, X-Content-Type-Options, HSTS, etc.)

**Infrastructure & Operations**
- [ ] Docker Compose: `web`, `worker`, `postgres`, `redis`, `nginx` services
- [ ] `GET /health` endpoint with status for Redis, Postgres, worker heartbeat, pending jobs, last publish time
- [ ] Structured JSON logging with correlation IDs; sensitive data never logged
- [ ] BullMQ dead letter queue for failed jobs; crash recovery via stalled job detection + idempotency check

**Advanced Features (later milestones)**
- [ ] AI post generation via OpenAI API (topic + persona + tone → bulk draft posts)
- [ ] Webhooks (inbound HTTP POST from IFTTT/custom apps → post to profile or queue)
- [ ] Calendar view (monthly/weekly/daily with conflict detection)
- [ ] Hashtag sets & saved text snippets with Insert Snippet button on post forms
- [ ] Full-text post search (PostgreSQL `tsvector` / GIN index)
- [ ] HTML to Markdown converter utility page
- [ ] Post drafts page with draft-only filtered view
- [ ] Email logs view

### Out of Scope

- Multi-user / team features — single-user personal tool by design; adding multi-tenancy would require a full auth rearchitecture
- Blog/RSS feed integration — explicitly excluded; SocialOomph had it but it's not needed here
- Mobile app — web UI only; self-hosted on local network, not a public SaaS product
- Personal Facebook profile — Facebook Pages only; personal profiles have different API restrictions and aren't the use case

## Context

- Replacing SocialOomph: primary motivation is eliminating vendor dependency and subscription cost while matching the queue automation workflow
- Twitter/X is the highest-priority platform — start there and validate the scheduling engine before adding LinkedIn and Facebook
- Deployment target: Proxmox server running Docker Compose; access via local network (with optional Cloudflare Tunnel for OAuth callbacks)
- HTTPS is required for OAuth (Facebook and LinkedIn mandate HTTPS callback URLs) — nginx with Let's Encrypt or Cloudflare Tunnel handles TLS
- All times stored in UTC; user's IANA timezone used for display and scheduling input. DST handled by IANA library — never fixed UTC offsets
- Twitter free tier: 500 tweets/month write limit. Rate limit tracking is a first-class concern, not an afterthought

## Constraints

- **Tech Stack**: Node.js + Express (API), Vite + React (frontend), PostgreSQL (primary DB), Redis + BullMQ (job queue), nginx (reverse proxy) — matches PRD specification
- **Infrastructure**: Docker Compose on Proxmox; no Kubernetes, no cloud-managed services
- **Twitter API**: User must supply their own Developer App credentials (OAuth 1.1). Free tier write limit is 500 tweets/month
- **Credentials**: OAuth tokens must be encrypted at rest (AES-256-GCM); encryption key is env-var only, never in DB or source control
- **Video transcoding**: ffmpeg included in Docker image; transcoding is async with 5-minute timeout; posts with pending media cannot publish
- **Media storage**: Local filesystem via Docker volume as default; S3-compatible optional via env var

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Vite + React (not Next.js) | Self-hosted personal tool — no SEO, no SSR needed. Lighter build setup, faster DX | — Pending |
| BullMQ + Redis (not pg-boss or cron) | Stalled job detection, dead letter queue, and retry semantics are built-in. Crash recovery without custom logic | — Pending |
| PostgreSQL full-text search (not Elasticsearch) | Single-user app — `tsvector` + GIN index is sufficient. No separate search service to maintain | — Pending |
| AES-256-GCM for token encryption | Industry standard; supports key rotation via version column without re-auth | — Pending |
| Twitter/X first, then LinkedIn + Facebook | Highest personal use + most constrained API (rate limits, dev app creds) — validate scheduling engine there first | — Pending |
| Phase delivery | PRD scope is large; ship core scheduling + queue + Twitter first to validate the stack before building advanced features | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-07 after initialization*
