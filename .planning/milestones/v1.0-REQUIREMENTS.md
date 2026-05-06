# Requirements: Social Media Scheduler

**Defined:** 2026-04-07
**Core Value:** Own the stack, own the data, own the credentials — persistent queue automation that publishes without hand-holding, backed by your own Twitter Developer App, on hardware you control.

---

## v1 Requirements

### Infrastructure (INFRA)

- [x] **INFRA-01**: Monorepo with pnpm workspaces containing `shared`, `db`, `api`, `worker`, `web` packages
- [x] **INFRA-02**: Docker Compose stack with `web`, `worker`, `postgres`, `redis`, `nginx` services, all wired and health-checked
- [x] **INFRA-03**: nginx configured as reverse proxy with TLS termination (Cloudflare Tunnel or Let's Encrypt)
- [x] **INFRA-04**: PostgreSQL 17 with Drizzle ORM schema and versioned migrations (`drizzle-kit generate` + `drizzle-kit migrate` on container start)
- [x] **INFRA-05**: Redis 7.4 configured with `maxmemory-policy noeviction` (required for BullMQ correctness)
- [x] **INFRA-06**: `GET /health` endpoint returns JSON status for Redis, Postgres, worker heartbeat, pending job count, and last publish timestamp
- [x] **INFRA-07**: Worker reports heartbeat to Redis every 30 seconds; `/health` flags `worker_alive: false` if no heartbeat for 60 seconds
- [x] **INFRA-08**: All log output is structured JSON with `timestamp`, `level`, `message`, `correlation_id`; sensitive data (tokens, keys, passwords) never logged
- [x] **INFRA-09**: Every HTTP request assigned a UUID correlation ID via middleware; ID passed through BullMQ job data for end-to-end tracing
- [x] **INFRA-10**: Multi-stage Docker build handles native addon compilation (argon2, sharp) and includes ffmpeg in production image

### Authentication (AUTH)

- [x] **AUTH-01**: User can log in with email and password (argon2 password hashing)
- [x] **AUTH-02**: User session persists across browser refresh using Redis-backed HTTP-only Secure cookie (24-hour sliding window)
- [x] **AUTH-03**: User can log out; session invalidated server-side on logout or expiry
- [x] **AUTH-04**: User can change password (current password required)
- [x] **AUTH-05**: User can enable TOTP-based 2FA with QR code setup flow (otpauth library)
- [x] **AUTH-06**: User can disable 2FA (password confirmation required)
- [x] **AUTH-07**: User can set security questions and answers for account recovery

### Security (SEC)

- [x] **SEC-01**: All OAuth tokens encrypted at rest using AES-256-GCM; encryption key loaded from `ENCRYPTION_KEY` env var only — never stored in DB or source control
- [x] **SEC-02**: Each encrypted token record stores IV and authentication tag alongside the ciphertext
- [x] **SEC-03**: `SocialProfile` table includes `token_encryption_version` (INT DEFAULT 1); key rotation decrypts with old key and re-encrypts with new key without requiring re-auth
- [x] **SEC-04**: Decrypted tokens are never cached in Redis; loaded from Postgres, decrypted in-memory for the API call, discarded immediately after use
- [x] **SEC-05**: All state-changing requests (POST, PUT, DELETE) require CSRF token validation (csrf-csrf, not deprecated csurf); cookies use `SameSite=Strict`
- [x] **SEC-06**: Security headers configured via `helmet`: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`
- [x] **SEC-07**: OpenAI API key (used for AI generation) never persisted — passed in request body, used once, discarded; never in job payloads, Redis, or logs

### Social Profiles (PROFILE)

- [x] **PROFILE-01**: User can connect a Twitter/X profile via OAuth 1.1 using their own Developer App credentials (Consumer Key, Consumer Secret, Access Token, Access Token Secret)
- [x] **PROFILE-02**: User can connect a LinkedIn Personal Profile via OAuth 2.0
- [x] **PROFILE-03**: User can connect a LinkedIn Company Page via OAuth 2.0
- [x] **PROFILE-04**: User can connect a Facebook Page via OAuth (short-lived → long-lived token exchange on initial connection)
- [ ] **PROFILE-05**: Profile list displays all connected profiles with: network icon, account name, internal profile ID, connected date, last published date, next scheduled run, token health badge — _PARTIAL: ProfileCard missing next-scheduled-run column_
- [ ] **PROFILE-06**: Profile list is filterable by network type (Twitter, LinkedIn, Facebook) — _UNSATISFIED: no platform filter UI_
- [ ] **PROFILE-07**: User can rename a profile, add internal Markdown notes, re-authenticate to refresh tokens, and delete a profile (with cascade warning) — _PARTIAL: markdown notes field not present_
- [x] **PROFILE-08**: Token health badge shows green (valid, >7 days), yellow (expiring within 7 days), or red (expired/invalid requiring re-auth)

### OAuth Token Lifecycle (TOKEN)

- [x] **TOKEN-01**: Background job runs daily to check token expiry for all connected profiles
- [x] **TOKEN-02**: LinkedIn access tokens (60-day expiry) auto-refreshed 7 days before expiry using refresh token (365-day lifetime); failure flags profile as "Needs Re-authentication" and triggers notification
- [x] **TOKEN-03**: Facebook Page tokens are treated as non-expiring (derived from long-lived user tokens); validity monitored via periodic test API call, not expiry date
- [x] **TOKEN-04**: Twitter OAuth 1.1 tokens do not expire; revocation detected via 401 API response, which flags the profile immediately
- [ ] **TOKEN-05**: Profiles with expired or invalid tokens are excluded from the scheduling engine's publish loop — jobs skipped with clear log message, not silently failed — _PARTIAL: exclusion logging not fully wired_

### Post Creation — Twitter/X (POST-TW)

- [x] **POST-TW-01**: User can create a text-only tweet
- [ ] **POST-TW-02**: User can create a tweet with up to 4 images (JPG, GIF, PNG, WEBP, max 5 MB each) — _PARTIAL: composition UI present; worker rejects multi-media at twitter-publish.service.ts:54-58_
- [ ] **POST-TW-03**: User can create a tweet with one animated GIF (max 15 MB) — _PARTIAL: composition UI present; worker blocks media path_
- [ ] **POST-TW-04**: User can create a tweet with one video (max 15 MB) — _PARTIAL: composition UI present; worker blocks media path_
- [ ] **POST-TW-05**: User can create a tweet thread using `[[tweet]]` separator; all tweets in thread publish simultaneously; media attaches to first tweet only — _PARTIAL: thread parser/UI present; worker rejects threads_
- [x] **POST-TW-06**: Tweet text field shows real-time character count using `twitter-text` library (URLs = 23 chars, CJK/emoji rules applied); color-coded indicator (green → yellow → red)
- [x] **POST-TW-07**: Tweet creation form shows live preview approximating Twitter's rendering (avatar, display name, tweet text, media grid, thread preview)

### Post Creation — LinkedIn (POST-LI)

- [x] **POST-LI-01**: User can create a text-only LinkedIn share
- [x] **POST-LI-02**: User can create a LinkedIn share with one image (JPG, GIF, PNG, max 20 MB)
- [x] **POST-LI-03**: Share visibility selector: Anyone on LinkedIn | Connections only
- [x] **POST-LI-04**: Share text field shows real-time character count (max 3,000)
- [x] **POST-LI-05**: LinkedIn creation form shows live preview approximating LinkedIn's rendering

### Post Creation — Facebook (POST-FB)

- [x] **POST-FB-01**: User can create a text-only Facebook post
- [x] **POST-FB-02**: User can create a Facebook post with up to 10 images (JPG, GIF, PNG, BMP, TIFF, max 5 MB each)
- [x] **POST-FB-03**: User can create a Facebook post with one video (max 100 MB)
- [x] **POST-FB-04**: User can attach an optional URL to a Facebook post
- [x] **POST-FB-05**: Post text field shows real-time character count (max 63,206)
- [x] **POST-FB-06**: Facebook creation form shows live preview approximating Facebook's rendering

### Post Creation — Common Fields (POST-CMN)

- [x] **POST-CMN-01**: All post creation forms support: publish at specific datetime, publish now, or save as draft
- [x] **POST-CMN-02**: Date/time picker respects user's configured IANA timezone and date format
- [x] **POST-CMN-03**: All posts support spinnable text syntax `{option1|option2|option3}` with "contains spinnable text" toggle; one option selected randomly at publish time
- [x] **POST-CMN-04**: All posts support auto-destruct: delete from platform after N [minutes/hours/days/weeks/months/years]
- [x] **POST-CMN-05**: All posts support internal tags (multi-select) and internal notes (Markdown, not published)
- [x] **POST-CMN-06**: User can save any post as draft without assigning a schedule; drafts are not picked up by the scheduling engine
- [x] **POST-CMN-07**: Post creation form shows scheduling conflict warning when another post is scheduled for the same profile within ±5 minutes of the requested time (non-blocking)
- [x] **POST-CMN-08**: All post forms include an "Insert Snippet" button to insert saved text snippets at cursor position

### Post State Machine (STATE)

- [x] **STATE-01**: Posts follow valid states: `draft`, `scheduled`, `queued`, `publishing`, `published`, `failed`, `auto_destructing`, `destroyed`
- [ ] **STATE-02**: Posts in `publishing` state cannot be edited or deleted; UI disables those actions; API returns 409 Conflict — _PARTIAL: schema enforces states; API 409 guard missing on POST/PATCH/DELETE /api/posts/:id_
- [x] **STATE-03**: `Post` table includes `post_version` (INT DEFAULT 1); worker performs conditional update `WHERE id = ? AND post_version = ?` before publishing — aborts and re-queues if version changed
- [x] **STATE-04**: `platform_post_id` stored after successful publish; worker checks this field before re-attempting publish to prevent duplicate posts on crash recovery
- [x] **STATE-05**: Failed posts (all retries exhausted) move to `failed` state; user must manually edit and reschedule or delete

### Scheduled Posts (SCHED)

- [x] **SCHED-01**: Scheduled posts list view shows all posts across all profiles with filterable columns (network, status, tag, profile)
- [x] **SCHED-02**: Each post row shows: text preview, network icon, profile name, post type, status badge, post ID, queue name (if queued), scheduled datetime (relative + absolute), error message (if failed)
- [x] **SCHED-03**: Per-post actions: Edit (draft/scheduled/error posts), Delete (with confirmation), View History, View full text, View media, View notes
- [x] **SCHED-04**: Post history modal shows log of all publish attempts: timestamp, success/failure, error message

### Queue System (QUEUE)

- [x] **QUEUE-01**: User can create a queue with: name, network, social profile, schedule type (fixed or variable interval), interval (N [minutes/hours/days/weeks/months/years]), days-of-week checkboxes, hour windows (multi-select), start date, optional seasonal window, internal notes
- [x] **QUEUE-02**: Queue list shows all queues with: name, network icon, profile, queue ID, total post count, last published, next run; filterable by network
- [x] **QUEUE-03**: Per-queue actions: Edit, Copy Configuration, Delete (with confirmation), View Posts, View Notes
- [x] **QUEUE-04**: Queue posts list shows posts within a selected queue with per-post actions: Edit, View media, Move Up, Move Down, Delete, View History, View spinnable variants
- [x] **QUEUE-05**: Queue posts can be reordered (move up/down within queue)
- [x] **QUEUE-06**: Queue scheduling uses BullMQ with timezone-aware scheduling (`tz` parameter set to user's IANA timezone); DST transitions do not shift scheduled times

### Background Worker (WORKER)

- [x] **WORKER-01**: Separate `worker` Docker service runs independently of the `web` service; communicates only via BullMQ queues through Redis
- [x] **WORKER-02**: Named BullMQ queues per job type: `publish`, `transcode`, `token-refresh`, `auto-destruct`, `media-cleanup`, `notification`, `bulk`; separate concurrency limits per queue type
- [x] **WORKER-03**: Publish worker checks queue schedule (day-of-week, hour window, interval) before selecting the next post; timezone-aware evaluation
- [x] **WORKER-04**: Publish worker implements exponential backoff retry (max 3 retries) for transient errors; exhausted retries → `failed` state + notification event
- [x] **WORKER-05**: After successful publish: marks post as `published`, records `published_at`, stores `platform_post_id`, logs result; if recycling enabled, moves post to end of queue
- [x] **WORKER-06**: BullMQ stalled job detection enabled; stalled jobs automatically retried; idempotency check via `platform_post_id` prevents duplicate publishes
- [x] **WORKER-07**: Failed jobs (all retries exhausted) moved to dead letter queue for inspection; notification event emitted
- [x] **WORKER-08**: Graceful shutdown: worker drains in-progress jobs before exiting; SIGTERM handled properly
- [x] **WORKER-09**: Auto-destruct worker: after configured time period post `published`, calls platform delete endpoint; transitions post to `auto_destructing` → `destroyed`

### Media Handling (MEDIA)

- [x] **MEDIA-01**: Uploaded images generate a thumbnail (max 300px wide) stored alongside the original
- [x] **MEDIA-02**: Images validated for format and dimensions; resized if exceeding platform limits before publish
- [x] **MEDIA-03**: Videos transcoded asynchronously via ffmpeg BullMQ job; upload HTTP request returns immediately with `processing` status
- [x] **MEDIA-04**: Video transcoding timeout: 5 minutes; failed transcodes set `transcode_status = failed` with error message
- [x] **MEDIA-05**: Posts with media in `pending` or `processing` transcode state are skipped by the publish worker with log message; retried on next cycle
- [x] **MEDIA-06**: Files stored at `{storage_root}/media/{profile_id}/{year}/{month}/{uuid}.{ext}`; metadata (filename, MIME type, dimensions, size, upload date) stored in `MediaFile` table
- [x] **MEDIA-07**: Media storage backend selectable via `MEDIA_STORAGE_BACKEND` env var: `local` (Docker volume, default) or `s3` (S3-compatible; configured via `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`)
- [x] **MEDIA-08**: Deleted post media soft-deleted; weekly background job permanently deletes soft-deleted files older than 30 days
- [x] **MEDIA-09**: Settings page shows total media storage consumed

### Rate Limit Tracking (LIMIT)

- [x] **LIMIT-01**: Twitter rate limit tracking is configurable: user can set their monthly tweet budget (not hardcoded to 500 — supports legacy free tier, pay-per-use, or Basic plan users)
- [x] **LIMIT-02**: Warning threshold configurable (default 80%); when usage exceeds threshold, warning banner displayed and notification sent
- [x] **LIMIT-03**: When configured monthly budget is reached, scheduling engine skips Twitter posts with clear log message; does not attempt publish and receive 429
- [x] **LIMIT-04**: Pre-flight check on new Twitter post: estimates current-month tweet total (existing scheduled + queued + new); warns at 90% of budget, blocks at 100%
- [x] **LIMIT-05**: Pre-flight check on CSV bulk upload targeting Twitter: counts rows, adds to current-month total, applies same warn/block logic before processing
- [x] **LIMIT-06**: Facebook rate limit tracking: 200 Graph API calls/user/hour; backoff when approaching limit
- [x] **LIMIT-07**: LinkedIn rate limit tracking: daily API call limits tracked; backoff when approaching limit
- [ ] **LIMIT-08**: Dashboard widget shows current usage vs. limit for each connected profile (color-coded: green <50%, yellow 50–80%, red >80%) — _PARTIAL: per-profile chip exists; aggregated dashboard widget missing_

### Notifications (NOTIF)

- [x] **NOTIF-01**: In-app notification bell in header shows unread count and dropdown of recent notifications
- [x] **NOTIF-02**: Email notifications sent via configured SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` env vars)
- [x] **NOTIF-03**: Publish failure notifications sent after retry exhaustion (email + in-app; configurable off)
- [x] **NOTIF-04**: OAuth token expiring soon (7 days) notification (email + in-app; configurable off)
- [x] **NOTIF-05**: OAuth token expired or re-auth required notification (email + in-app; always on)
- [x] **NOTIF-06**: Platform rate limit warning at configured threshold (in-app; configurable off)
- [x] **NOTIF-07**: Platform rate limit reached / publishing paused notification (email + in-app; always on)
- [x] **NOTIF-08**: Queue empty (no more posts) notification (in-app; configurable off)
- [x] **NOTIF-09**: Bulk operation completed (in-app; not configurable)

### Bulk Operations (BULK)

- [ ] **BULK-01**: User can upload CSV (UTF-8, max 10 MB) to create scheduled posts or queue posts in bulk; supports scheduling options (start time, frequency, days, hours), recycle toggle, spinnable flag, auto-destruct, tags
- [ ] **BULK-02**: CSV bulk upload for Twitter profiles applies pre-flight rate limit check before processing
- [ ] **BULK-03**: User can export scheduled posts (with current filters applied) as UTF-8 CSV
- [ ] **BULK-04**: User can randomize the order of all posts in a queue
- [ ] **BULK-05**: User can purge all posts from a queue (destructive, confirmation required)
- [ ] **BULK-06**: User can copy posts from one queue to another with optional randomize-after-copy
- [ ] **BULK-07**: User can bulk-modify queue post text: append, remove, or replace text across all posts in a queue (async BullMQ job)
- [ ] **BULK-08**: User can remove duplicate posts (identical text) from a queue (async BullMQ job)
- [ ] **BULK-09**: User can export all posts in a queue as UTF-8 CSV
- [ ] **BULK-10**: User can bulk pause or resume publishing for a profile (applies to scheduled posts or queues)
- [ ] **BULK-11**: User can bulk delete scheduled posts for a profile (destructive, confirmation required)

### Tags (TAGS)

- [x] **TAGS-01**: User can create, rename, and delete tags
- [x] **TAGS-02**: Tags are applied at post creation (multi-select); tags filter the Scheduled Posts list and Queue Posts list

### User Settings (SETTINGS)

- [x] **SETTINGS-01**: User can configure: email, username (3–100 chars), profile image, first/last name, IANA timezone (full list), date format (8 options), entries per page
- [x] **SETTINGS-02**: User can configure notification preferences per event type (enable/disable email and/or in-app where configurable)
- [x] **SETTINGS-03**: Email logs view shows paginated, filterable list of all system emails sent

### Snippets (SNIP)

- [x] **SNIP-01**: User can create, edit, and delete named text snippets (Hashtag Set or Text Snippet category)
- [x] **SNIP-02**: "Insert Snippet" button on all post creation forms inserts snippet content at cursor position
- [x] **SNIP-03**: CSV bulk uploads support `{{snippet:name}}` syntax resolved at upload processing time

### Post Search (SEARCH)

- [x] **SEARCH-01**: Full-text search available on Scheduled Posts list, Queue Posts list, and Calendar view via search input in filter bar
- [x] **SEARCH-02**: Search uses PostgreSQL `tsvector` + GIN index on post text, notes, and tag names; results ranked by relevance (`ts_rank`); matching terms highlighted via `ts_headline`

### Calendar View (CAL)

- [x] **CAL-01**: Monthly, weekly, and daily calendar views showing all scheduled posts and queue runs across all profiles
- [x] **CAL-02**: Entries color-coded by platform; clicking an entry opens post detail/edit; clicking empty time slot opens post creation pre-filled with that datetime
- [x] **CAL-03**: Calendar filterable by platform, profile, tags; toggle between queue-scheduled and one-time scheduled posts
- [x] **CAL-04**: Calendar highlights conflicting time slots (posts on same profile within ±5 minutes) with visual indicator

---

## v2 Requirements

### AI Post Generation (AI)

- **AI-01**: User can generate 1–50 posts via OpenAI API by providing topic, number of posts, optional character/persona, tone, and language; generated posts land in the selected queue as drafts
- **AI-02**: OpenAI API key supplied per-request; never stored or logged

### Webhooks (HOOK)

- **HOOK-01**: User can create webhooks with unique inbound HTTPS URLs; external services POST to these URLs to create posts or add to a queue
- **HOOK-02**: Webhook requests validated against HMAC-SHA256 signature (when shared secret configured) and IP allowlist (when configured)
- **HOOK-03**: Webhook rate limiting: 60 requests/webhook/window; 429 response with `retry_after`; automatic IP block after 10 consecutive 429s
- **HOOK-04**: Webhook supports text-only (JSON) and media (multipart/form-data) payloads; HTML stripped from body before storage

### HTML Converter (UTIL)

- **UTIL-01**: Standalone HTML-to-Markdown converter page (input textarea → output textarea, no persistence)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user / team accounts | Single-user personal tool; multi-tenancy requires full auth rearchitecture — separate product |
| Blog / RSS feed integration | Not needed; SocialOomph had it but it's not the use case here |
| Personal Facebook profile posting | Pages only; personal profile API has different restrictions and isn't the use case |
| Mobile native app | Web UI only; self-hosted on local network, not a public SaaS |
| Real-time collaborative editing | Single user; no collaboration needed |
| Paid plan / subscription management | Self-hosted; no billing or plan tiers |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Satisfied |
| INFRA-02 | Phase 1 | Satisfied |
| INFRA-03 | Phase 1 | Satisfied |
| INFRA-04 | Phase 1 | Satisfied |
| INFRA-05 | Phase 1 | Satisfied |
| INFRA-06 | Phase 1 | Satisfied |
| INFRA-07 | Phase 1 | Satisfied |
| INFRA-08 | Phase 1 | Satisfied |
| INFRA-09 | Phase 1 | Satisfied |
| INFRA-10 | Phase 1 | Satisfied |
| SEC-01 | Phase 1 | Satisfied |
| SEC-02 | Phase 1 | Satisfied |
| SEC-03 | Phase 1 | Satisfied |
| SEC-04 | Phase 1 | Satisfied |
| SEC-05 | Phase 1 | Satisfied |
| SEC-06 | Phase 1 | Satisfied |
| AUTH-01 | Phase 2 | Satisfied |
| AUTH-02 | Phase 2 | Satisfied |
| AUTH-03 | Phase 2 | Satisfied |
| AUTH-04 | Phase 2 | Satisfied |
| AUTH-05 | Phase 2 | Satisfied |
| AUTH-06 | Phase 2 | Satisfied |
| AUTH-07 | Phase 2 | Satisfied |
| SETTINGS-01 | Phase 2 | Satisfied |
| PROFILE-01 | Phase 3 | Satisfied |
| POST-TW-01 | Phase 3 | Satisfied |
| POST-TW-02 | Phase 6.6 | Partial (was Phase 3) |
| POST-TW-03 | Phase 6.6 | Partial (was Phase 3) |
| POST-TW-04 | Phase 6.6 | Partial (was Phase 3) |
| POST-TW-05 | Phase 6.6 | Partial (was Phase 3) |
| POST-TW-06 | Phase 3 | Satisfied |
| POST-TW-07 | Phase 3 | Satisfied |
| POST-CMN-01 | Phase 3 | Satisfied |
| POST-CMN-02 | Phase 3 | Satisfied |
| POST-CMN-03 | Phase 3 | Satisfied |
| POST-CMN-04 | Phase 3 | Satisfied |
| POST-CMN-05 | Phase 3 | Satisfied |
| POST-CMN-06 | Phase 3 | Satisfied |
| POST-CMN-07 | Phase 3 | Satisfied |
| STATE-01 | Phase 3 | Satisfied |
| STATE-02 | Phase 6.6 | Partial (was Phase 3) |
| STATE-03 | Phase 3 | Satisfied |
| STATE-04 | Phase 3 | Satisfied |
| STATE-05 | Phase 3 | Satisfied |
| TAGS-01 | Phase 3 | Satisfied |
| TAGS-02 | Phase 3 | Satisfied |
| WORKER-01 | Phase 4 | Satisfied |
| WORKER-02 | Phase 4 | Satisfied |
| WORKER-03 | Phase 4 | Satisfied |
| WORKER-04 | Phase 4 | Satisfied |
| WORKER-05 | Phase 4 | Satisfied |
| WORKER-06 | Phase 4 | Satisfied |
| WORKER-07 | Phase 4 | Satisfied |
| WORKER-08 | Phase 4 | Satisfied |
| SCHED-01 | Phase 4 | Satisfied |
| SCHED-02 | Phase 4 | Satisfied |
| SCHED-03 | Phase 4 | Satisfied |
| SCHED-04 | Phase 4 | Satisfied |
| LIMIT-01 | Phase 4 | Satisfied |
| LIMIT-02 | Phase 4 | Satisfied |
| LIMIT-03 | Phase 4 | Satisfied |
| LIMIT-04 | Phase 4 | Satisfied |
| LIMIT-05 | Phase 4 | Satisfied |
| QUEUE-01 | Phase 5 | Satisfied |
| QUEUE-02 | Phase 5 | Satisfied |
| QUEUE-03 | Phase 5 | Satisfied |
| QUEUE-04 | Phase 5 | Satisfied |
| QUEUE-05 | Phase 5 | Satisfied |
| QUEUE-06 | Phase 5 | Satisfied |
| WORKER-09 | Phase 5 | Satisfied |
| MEDIA-01 | Phase 6 | Satisfied |
| MEDIA-02 | Phase 6 | Satisfied |
| MEDIA-03 | Phase 6 | Satisfied |
| MEDIA-04 | Phase 6 | Satisfied |
| MEDIA-05 | Phase 6.4 | Satisfied |
| MEDIA-06 | Phase 6.5 | Satisfied |
| MEDIA-07 | Phase 6 | Satisfied |
| MEDIA-08 | Phase 6 | Satisfied |
| MEDIA-09 | Phase 6 | Satisfied |
| PROFILE-02 | Phase 7 | Satisfied |
| PROFILE-03 | Phase 7 | Satisfied |
| PROFILE-04 | Phase 7 | Satisfied |
| PROFILE-05 | Phase 7.1 | Partial (was Phase 7) |
| PROFILE-06 | Phase 7.1 | Pending (was Phase 7) |
| PROFILE-07 | Phase 7.1 | Partial (was Phase 7) |
| PROFILE-08 | Phase 7 | Satisfied |
| TOKEN-01 | Phase 7 | Satisfied |
| TOKEN-02 | Phase 7 | Satisfied |
| TOKEN-03 | Phase 7 | Satisfied |
| TOKEN-04 | Phase 7 | Satisfied |
| TOKEN-05 | Phase 7.1 | Partial (was Phase 7) |
| POST-LI-01 | Phase 8 | Satisfied |
| POST-LI-02 | Phase 8 | Satisfied |
| POST-LI-03 | Phase 8 | Satisfied |
| POST-LI-04 | Phase 8 | Satisfied |
| POST-LI-05 | Phase 8 | Satisfied |
| POST-FB-01 | Phase 8 | Satisfied |
| POST-FB-02 | Phase 8 | Satisfied |
| POST-FB-03 | Phase 8 | Satisfied |
| POST-FB-04 | Phase 8 | Satisfied |
| POST-FB-05 | Phase 8 | Satisfied |
| POST-FB-06 | Phase 8 | Satisfied |
| LIMIT-06 | Phase 8 | Satisfied |
| LIMIT-07 | Phase 8 | Satisfied |
| LIMIT-08 | Phase 8.1 | Partial (was Phase 8) |
| NOTIF-01 | Phase 9 | Satisfied |
| NOTIF-02 | Phase 9 | Satisfied |
| NOTIF-03 | Phase 9 | Satisfied |
| NOTIF-04 | Phase 9 | Satisfied |
| NOTIF-05 | Phase 9 | Satisfied |
| NOTIF-06 | Phase 9 | Satisfied |
| NOTIF-07 | Phase 9 | Satisfied |
| NOTIF-08 | Phase 9 | Satisfied |
| NOTIF-09 | Phase 9 | Satisfied |
| SETTINGS-02 | Phase 9 | Satisfied |
| SETTINGS-03 | Phase 9 | Satisfied |
| BULK-01 | Phase 10 | Pending |
| BULK-02 | Phase 10 | Pending |
| BULK-03 | Phase 10 | Pending |
| BULK-04 | Phase 10 | Pending |
| BULK-05 | Phase 10 | Pending |
| BULK-06 | Phase 10 | Pending |
| BULK-07 | Phase 10 | Pending |
| BULK-08 | Phase 10 | Pending |
| BULK-09 | Phase 10 | Pending |
| BULK-10 | Phase 10 | Pending |
| BULK-11 | Phase 10 | Pending |
| SNIP-01 | Phase 11 | Complete |
| SNIP-02 | Phase 11 | Complete |
| SNIP-03 | Phase 11 | Complete |
| SEARCH-01 | Phase 11 | Complete |
| SEARCH-02 | Phase 11 | Complete |
| CAL-01 | Phase 11 | Complete |
| CAL-02 | Phase 11 | Complete |
| CAL-03 | Phase 11 | Complete |
| CAL-04 | Phase 11 | Complete |
| POST-CMN-08 | Phase 11 | Complete |
| SEC-07 | Phase 11 | Complete |

**Coverage:**
- v1 requirements: 138 total
- v2 requirements: 6
- Mapped to phases: 138/138
- Unmapped: 0

**Status (as of 2026-04-29 code-grounded re-verification):**
- Satisfied: 106/138 (76.8%)
- Partial: 9/138 (6.5%) — addressed by Phases 6.6, 7.1, 8.1
- Pending: 23/138 (16.7%) — 11 in Phase 10, 11 in Phase 11, 1 in Phase 7.1 (PROFILE-06)

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-29 — code-grounded re-verification superseded the 2026-04-29 artifact-based audit; partials/unsatisfieds reassigned to gap-closure phases 6.6, 7.1, 8.1*
