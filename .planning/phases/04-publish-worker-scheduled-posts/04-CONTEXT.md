# Phase 4: Publish Worker & Scheduled Posts - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

A background BullMQ worker autonomously publishes scheduled Twitter/X posts at their scheduled time with retry logic, idempotency, stalled-job recovery, and a dead letter queue. The user-facing scheduled-posts list (built in Phase 3) is extended with an error-message column and a post history modal showing all publish attempts. Twitter rate limit tracking enforces a configurable per-profile monthly budget with pre-flight checks and hard blocking at 100%.

**In scope:**
- BullMQ worker process publishing to Twitter via `twitter-api-v2` using decrypted credentials (in-memory only, never cached)
- Hybrid scheduling: delayed jobs enqueued on save + 60-second reconciliation scanner
- Publish pipeline: state transitions (`scheduled` → `publishing` → `published`/`failed`) with `post_version` optimistic locking and `platform_post_id` idempotency
- Retry policy with 4 attempts (initial + 3 retries), custom backoff, transient vs permanent error classification
- New `post_attempts` table persisting every attempt for audit and the SCHED-04 history modal
- Dead letter queue for posts that exhaust retries
- Bull-Board UI at `/admin/queues` behind session auth for operator visibility
- Twitter rate limit: per-profile monthly budget (configurable), calendar-month UTC window, on-demand counter, pre-flight warn at 90% / hard block at 100% returning 409 Conflict
- Reusable pre-flight check helper that Phase 10 will wire into CSV bulk upload
- Scheduled posts list updates in Phase 3 `/posts` view: error-message column, Retry kebab action, history modal (SCHED-04)

**Explicitly out of scope (belong in other phases):**
- Auto-destruct worker / state transitions — Phase 5 (WORKER-09)
- Queue CRUD and recurring queue scheduling — Phase 5
- Media transcoding blocking — Phase 6 (video posts skipped when media status = processing)
- LinkedIn and Facebook publish paths — Phase 7/8
- CSV bulk upload UI — Phase 10 (but pre-flight helper built here is reusable)
- Notification event delivery (in-app bell, SMTP) — Phase 9. Phase 4 emits notification events to a `notification` queue; Phase 9 consumes them.

</domain>

<decisions>
## Implementation Decisions

### Scheduling Mechanism

- **D-01:** Hybrid scheduling. On post save, the API enqueues a BullMQ job into the `publish` queue with `delay = scheduledAt - now`. In parallel, a repeatable scanner job runs every 60 seconds, querying `posts WHERE status = 'scheduled' AND scheduledAt <= now() + 90s`, and enqueues any posts that don't have a live job (reconciliation pass). This gives on-time publishing on the happy path and self-healing after Redis/worker restarts or edit races.
- **D-02:** Edit races resolved via `post_version` optimistic locking. The publish worker reads the post row inside a transaction with `SELECT ... FOR UPDATE`, re-checks `post_version` against the value captured when the job was enqueued, and aborts gracefully if the version has moved (user edited the post). Aborted posts stay in `scheduled` status; the next scanner pass re-enqueues with fresh content. Phase 3 already added the `post_version` column for this purpose.
- **D-03:** Auto-destruct completely deferred to Phase 5 (per REQUIREMENTS.md WORKER-09). Phase 4 ignores `auto_destructing` / `destroyed` states. Posts with `autoDestructAfter` set transition to `published` normally; Phase 5 introduces the `auto-destruct` queue, worker, and the subsequent state transitions.

### Worker Architecture

- **D-04:** BullMQ queues created in Phase 4 (matching WORKER-02): `publish`, `notification`. Other named queues from WORKER-02 (`transcode`, `token-refresh`, `auto-destruct`, `media-cleanup`, `bulk`) are NOT created in this phase — they belong to the phases that own them. Creating unused queues now would be dead code.
- **D-05:** Worker concurrency: `publish` queue limited to 2 concurrent jobs (Twitter API calls are fast; higher concurrency risks hitting per-second rate limits during burst reconciliation). Scanner runs in a single repeatable job, not concurrent.
- **D-06:** Twitter credentials decrypted in-memory only at the moment of publish, passed to the `twitter-api-v2` client, and discarded immediately after the API call returns. Decrypted tokens never enter Redis, log output, or job payloads. Job payload contains only `postId` — the worker re-reads the post and associated profile credentials inside the publish transaction.
- **D-07:** Graceful shutdown (WORKER-08): SIGTERM handler sets the worker to stop accepting new jobs, waits for in-flight jobs to finish (with 30s timeout), then disconnects Redis and exits. Reuses the existing heartbeat cleanup pattern from Phase 1.
- **D-08:** BullMQ stalled job detection enabled with default settings (job locked for 30s without progress is considered stalled). Stalled jobs automatically re-enqueued; the idempotency check on `platform_post_id` prevents duplicate publishes.

### Retry & Error Handling

- **D-09:** Retry policy: 4 total attempts (initial + 3 retries per WORKER-04). Backoff delays: 30s → 5min → 30min. BullMQ `attempts: 4` with custom backoff function. When Twitter returns 429 with a `Retry-After` header, the worker honors that value instead of the standard backoff schedule.
- **D-10:** Error classification helper in the twitter publish service categorizes failures:
  - **Transient** — network errors, 5xx, 429: retry with backoff
  - **Permanent** — 401 (token revoked), 403 (forbidden), 422 (duplicate content, invalid payload): fail fast, transition to `failed` on first attempt, do not consume retry budget
- **D-11:** After all retries exhausted (or permanent error on first attempt): post transitions to `failed`, `failureReason` populated with a user-readable message, failed job moves to BullMQ dead letter queue for operator inspection, and a notification event is enqueued to the `notification` queue for Phase 9 to consume.

### Failure Surfacing

- **D-12:** `/posts` view extensions (SCHED-02, SCHED-03):
  - New column for error message (truncated, full text on row expand) when status = `failed`
  - Kebab menu includes a **Retry** action for posts in `failed` status — re-enqueues with a fresh 4-attempt budget; prior attempts remain in history
  - **View History** action opens a modal listing all attempts (timestamp, attempt number, outcome, http status, error message) — this is SCHED-04
- **D-13:** Bull-Board admin dashboard mounted at `/admin/queues` for operator debugging (queue depths, job payloads, failed job inspection, manual retry/remove). Protected by the existing session auth middleware — only authenticated users see it. This is an operator tool, not a user feature, but in a single-user app the user is also the operator.
- **D-14:** User-triggered Retry action resets the attempt counter — the retry enters the queue as a fresh publish with 4 attempts available. Prior `post_attempts` rows remain untouched so the history modal shows the full lineage across all manual retries.
- **D-15:** Real-time status updates on the `/posts` page use TanStack Query polling at a 10-second interval while the page is open. No WebSocket/SSE push in this phase — polling is sufficient for a single-user tool and avoids a new transport. Polling is paused when the tab is hidden (handled by TanStack Query's `refetchOnWindowFocus` + custom interval logic).

### Publish History Storage

- **D-16:** New `post_attempts` table with the following columns:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE`
  - `attempt_num integer NOT NULL` (1-indexed per retry cycle; reset on manual retry? — see D-17)
  - `started_at timestamptz NOT NULL`
  - `finished_at timestamptz` (nullable until completion)
  - `outcome text NOT NULL` — enum-like: `success`, `transient_fail`, `permanent_fail`, `cancelled`
  - `http_status integer` (nullable for non-HTTP errors)
  - `error_code text` (nullable — e.g., Twitter error code like `duplicate_status`)
  - `error_message text` (nullable)
  - `platform_post_id varchar(255)` (nullable — populated on success)
  - Index on `(post_id, started_at)` for history modal queries
- **D-17:** `attempt_num` is scoped to the current retry cycle. On a manual Retry action, the counter resets to 1 for the new cycle. The history modal groups attempts by cycle (visible as separators in the UI). This makes the per-attempt numbers meaningful ("attempt 3 of 4 in the second retry cycle") without losing the full lineage.
- **D-18:** Retention policy: retained forever. No cleanup job. Attempts rows are ~200 bytes, disk is cheap on Proxmox, and a single-user app with 500 posts/month caps the growth rate. If this ever becomes a problem it's a Phase 99 decision.
- **D-19:** Only compact fields stored in `post_attempts`. Full outbound/inbound Twitter API payloads are NOT persisted in the DB — they appear in pino logs with the correlation ID for debugging. This keeps `post_attempts` rows small and avoids duplicating potentially surprising third-party fields across every attempt.

### Twitter Rate Limit Tracking

- **D-20:** Rate limit window = **calendar month UTC**. Counter resets at 00:00 UTC on the 1st. This aligns with Twitter's developer portal reporting so the in-app counter matches what the Twitter dashboard shows. Date boundaries computed with luxon (`DateTime.utc().startOf('month')`).
- **D-21:** Counter computed on demand, not maintained. Query shape:
  ```sql
  SELECT count(*) FROM posts
  WHERE profile_id = ?
    AND published_at >= date_trunc('month', now() AT TIME ZONE 'UTC')
    AND status IN ('published', 'auto_destructing', 'destroyed')
  ```
  The `posts_profile_status` index from Phase 3 makes this fast enough. Source of truth stays in the `posts` table; no counter row to drift.
- **D-22:** Per-profile configuration on the `social_profiles` table. New columns:
  - `monthly_tweet_budget integer NOT NULL DEFAULT 500` (LIMIT-01 — configurable, not hardcoded)
  - `warn_threshold_percent integer NOT NULL DEFAULT 80` (LIMIT-02)
  - Edited via a modal from the profile card in `/profiles`. Validation: 1 ≤ budget ≤ 10000, 1 ≤ warn_threshold ≤ 99.
- **D-23:** Pre-flight check (LIMIT-04) is a reusable service function `checkTwitterBudget({ profileId, additionalPostCount })` returning `{ currentCount, budget, wouldExceed, warnThresholdHit, blockThresholdHit }`. Called by:
  - POST /api/posts (new scheduled Twitter post) — `additionalPostCount: 1` (or count of threaded tweets if applicable)
  - PUT /api/posts/:id (edit to change a draft to scheduled) — `additionalPostCount: 1`
  - Phase 10 CSV upload — reuses this helper as-is with `additionalPostCount: <row count>`
  The phase 4 helper is written with Phase 10 in mind but Phase 10 does the wiring.
- **D-24:** Block behavior: API returns **HTTP 409 Conflict** with an error body `{ code: 'twitter_budget_exceeded', budget, currentCount }` when the pre-flight check fails. Frontend surfaces this as an inline error on the form with a link to the profile settings modal where the budget can be raised. No soft-override — the hard block matches a strict reading of LIMIT-03 and LIMIT-04.
- **D-25:** Warning banner (LIMIT-02): when `currentCount / budget >= warn_threshold_percent / 100`, the new-post form shows an inline yellow banner ("You've used 412 of 500 tweets this month (82%). Consider raising your budget if you plan to keep scheduling."). Non-blocking; a notification event is also emitted (Phase 9 delivers it).
- **D-26:** Runtime rate limit blocking (LIMIT-03): when the worker picks up a `publish` job, it runs the pre-flight check one more time before calling Twitter. If the budget is exhausted, the worker aborts the publish, leaves the post in `scheduled` status, logs the skip, and the scanner will retry on the next pass. Prevents attempting a Twitter API call that would return 429 and waste a retry budget.

### Claude's Discretion

- Exact BullMQ worker initialization pattern in `packages/worker/src/index.ts` (factory function receives injected Redis + DB clients)
- Bull-Board integration details — which Express app mounts it (likely the main API app to reuse session middleware), route prefix, which queues are exposed
- Error classification taxonomy — the twitter-api-v2 library has its own error shapes; Claude picks a clean mapping helper. Transient/permanent buckets are fixed by D-10 but the exact error-code-to-bucket table is Claude's call.
- `notification` queue payload shape — consumed in Phase 9, but Phase 4 chooses the initial JSON structure (event type, profileId, postId, reason)
- Test strategy for the worker: Vitest + msw to mock `twitter-api-v2`, supertest for the admin routes, fake timers for retry backoff tests
- Exact query to list failed jobs in Bull-Board vs the user-facing Failed filter on `/posts`
- History modal layout specifics — table vs timeline vs grouped list; D-17 requires grouping by retry cycle but presentation is open
- How the scanner job is initialized (on worker boot vs via a BullMQ `QueueScheduler` repeatable)
- Exact logger correlation ID flow from API request → enqueued job → worker execution → pino log lines
- Monorepo placement of the new Twitter publish service — likely `packages/api/src/services/twitter-publish.service.ts` mirrored as a reusable export consumed by the worker

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §WORKER — WORKER-01 through WORKER-08 (publish worker architecture, retry, idempotency, stalled recovery, DLQ, graceful shutdown)
- `.planning/REQUIREMENTS.md` §SCHED — SCHED-01 through SCHED-04 (scheduled posts list, columns, per-post actions, history modal)
- `.planning/REQUIREMENTS.md` §LIMIT — LIMIT-01 through LIMIT-05 (Twitter rate limit tracking, pre-flight checks, block behavior)
- `.planning/ROADMAP.md` §Phase 4 — Goal and 5 success criteria that must be TRUE for phase completion

### Project Context
- `.planning/PROJECT.md` §Context — Twitter-first strategy, 500 tweets/month free-tier awareness, UTC storage / IANA display rule
- `.planning/PROJECT.md` §Constraints — BullMQ + Redis, AES-256-GCM token encryption, env-only encryption key
- `.planning/PROJECT.md` §Key Decisions — "BullMQ + Redis (not pg-boss or cron)" rationale (stalled job detection, DLQ built in)

### Prior Phase Context
- `.planning/phases/01-infrastructure-foundation/01-CONTEXT.md` — Encryption module, worker package layout, heartbeat pattern, pino logger with correlation IDs
- **Phase 3 context (lives on `phase-3-twitter-profile-post-creation` branch, not present on this branch):** `git show phase-3-twitter-profile-post-creation:.planning/phases/03-twitter-profile-post-creation/03-CONTEXT.md`. Specifically the post state machine (D-24 through D-26), posts/tags schema, `/posts` filter bar layout, `/profiles` page structure — all relied on by Phase 4.

### Codebase Integration Points
- `packages/worker/src/index.ts` — Worker bootstrap, Redis connection, heartbeat. Phase 4 adds BullMQ queue consumers alongside the existing heartbeat.
- `packages/worker/src/heartbeat.ts` — Existing heartbeat module; graceful-shutdown pattern to mirror.
- `packages/db/src/schema/posts.ts` — Existing posts table with `postVersion`, `platformPostId`, `scheduledAt`, status enum. Phase 4 adds no columns here, only the new `post_attempts` table.
- `packages/db/src/schema/social-profiles.ts` — Needs two new columns: `monthlyTweetBudget`, `warnThresholdPercent`.
- `packages/db/src/schema/index.ts` — Schema barrel where `post_attempts` table gets registered.
- `packages/api/src/app.ts` — Express app factory; new routes (POST /api/posts/:id/retry, GET /api/posts/:id/history, PATCH /api/profiles/:id/rate-limit) and Bull-Board mount point (`/admin/queues`).
- `packages/shared/src/encryption.ts` — Decrypt Twitter credentials in-memory during publish; never cache.
- `packages/shared/src/env.ts` — `requireEnv()` for `REDIS_URL`, `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY` (already in place from Phase 1).
- `packages/shared/src/logger.ts` — pino logger with correlation IDs; child loggers for the worker.
- `packages/web/src/pages/posts/PostsPage.tsx` — Existing filter bar + data table. Phase 4 adds the error column, Retry kebab action, and History modal trigger.
- `packages/web/src/hooks/use-posts.ts` — TanStack Query hooks to extend with 10s refetchInterval for the list view.
- `packages/web/src/lib/api-client.ts` — API client already handles CSRF; add retry/history/rate-limit endpoints.

### External Library Docs (resolved during planning via mcp__context7__*)
- `bullmq` — delayed jobs, repeatable jobs, stalled detection, worker concurrency, graceful shutdown
- `@bull-board/express` — Express mount point, auth middleware integration
- `twitter-api-v2` — error shapes for classification, `v2.tweet()` return types, chunked media upload for threaded posts
- `luxon` — `DateTime.utc().startOf('month')` for the rate limit window

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **BullMQ infrastructure already installed** — `bullmq ~5.73.0` and `ioredis ~5.10.1` are in `packages/worker/package.json`. No new dependencies needed for the worker; the API package also needs `bullmq` to enqueue jobs.
- **Worker heartbeat pattern** — `packages/worker/src/heartbeat.ts` gives a template for startup/shutdown hooks, TTL'd Redis keys, and error-tolerant tick functions.
- **Encryption module** — `packages/shared/src/encryption.ts` exposes `encrypt` / `decrypt` for Twitter credentials. Worker calls `decrypt` inside the publish transaction, uses the plaintext once, discards the reference.
- **pino logger** — `packages/shared/src/logger.ts` exports `createLogger(namespace)`. Worker creates a child logger per job with `correlationId` binding so log lines are traceable from API request through to Twitter response.
- **Posts schema with optimistic locking ready** — `packages/db/src/schema/posts.ts` already has `postVersion`, `platformPostId` (with unique index), `publishedAt`, `failedAt`, `failureReason`, `scheduledAt`. Phase 4 writes to all of them; no column additions.
- **Existing posts indexes** — `posts_profile_scheduled_status` supports the scanner query efficiently; `posts_platform_post_id` unique index enforces idempotency at the DB level; `posts_profile_status` supports the rate limit counter query.
- **shadcn/ui components from Phase 3** — Dialog, DropdownMenu, Table, Badge, Button already wired for the history modal and Retry action.
- **TanStack Query patterns** — `use-posts.ts` has query hooks to extend with `refetchInterval`.
- **Twitter API client usage from Phase 3** — the profile validation path in Phase 3 already instantiates `twitter-api-v2` clients with per-profile credentials; Phase 4 reuses the same pattern in the publish service.

### Established Patterns
- **Factory functions with injected dependencies** — `createApp({ db, redis, sessionStore })` in api; worker will mirror with `createWorker({ db, redis, logger })`. No top-level side effects, no `process.cwd()` (per CLAUDE.md conventions).
- **Env vars read at runtime inside functions** — never at module scope. Worker must follow this.
- **Zod schemas in `packages/shared/src/schemas/`** — request/response validation lives here, imported by both API and web. New schemas for retry action, history response, rate limit config.
- **Router factory pattern** — `createXxxRouter({ db })` returns Express Router. Phase 4 adds `createRetryRouter`, `createHistoryRouter` (or extends existing posts router), and `createRateLimitRouter`.
- **Drizzle ORM with transactions for multi-step mutations** — `db.transaction(tx => ...)` pattern from Phase 2. The publish worker uses this for the state transition + attempt insert.
- **Vitest fake timers for time-dependent code** — established in Phase 2 for session expiry tests; Phase 4 reuses for retry backoff and scanner interval tests.

### Integration Points
- **Worker package expansion** — `packages/worker/src/index.ts` currently starts only the heartbeat. Phase 4 extends `main()` to also construct the publish worker, the scanner repeatable job, and the Bull-Board config (exposed to API package for mounting).
- **API package gains BullMQ dependency** — API enqueues delayed jobs on post save, so `bullmq` is added to `packages/api/package.json`. Shared queue config (queue names, connection options) goes in `packages/shared/src/constants/queues.ts` so both worker and api agree on names.
- **New Drizzle migration** — `post_attempts` table + `social_profiles` column additions. Follows the existing migration pattern from Phase 1/2/3 (drizzle-kit generate + manual review).
- **Posts page incremental extension** — no rewrite; add an error column, extend the kebab menu, add a new `PostHistoryDialog` component, thread the new query hook through.
- **New API endpoints** (mounted on existing posts router where possible):
  - `POST /api/posts/:id/retry` — retry a failed post
  - `GET /api/posts/:id/history` — return post_attempts for the history modal
  - `GET /api/profiles/:id/rate-limit` — current count, budget, warn status
  - `PATCH /api/profiles/:id/rate-limit` — update `monthlyTweetBudget` and `warnThresholdPercent`
  - `GET /admin/queues/*` — Bull-Board dashboard (mounted from worker package config, protected by session middleware)
- **Notification event producer only** — Phase 4 enqueues jobs into the `notification` queue but does NOT consume them. Phase 9 adds the consumer. Payload shape documented for downstream use.

</code_context>

<specifics>
## Specific Ideas

- **"Own the data" is the product pitch** — Phase 4's history retention (forever) and DB-backed attempt storage (not Redis-only) are intentional. A self-hosted tool where history vanishes after a Redis restart would betray that pitch. post_attempts is part of what makes this app worth running instead of SocialOomph.
- **Bull-Board behind session auth is the operator escape hatch** — in a single-user app, the user IS the operator. When something weird happens at 2am, having queue depth and raw job JSON one click away (inside the same login session) beats shell-ing into Redis.
- **The 30s → 5min → 30min retry schedule is tuned to Twitter's reality** — most Twitter blips are either instant (network) or bucket-level (429 windows are 15min). This schedule rides out both without making a post sit in limbo for hours.
- **Counter-on-demand over counter-table** — this is a single-user app with 500 posts/month as the ceiling. A materialized counter is premature optimization that introduces a new drift surface. Read-time aggregation on an indexed column is fast enough and impossible to get wrong.
- **Pre-flight check reusable by Phase 10** — the CSV bulk upload (Phase 10) needs the exact same logic with a different `additionalPostCount`. Writing the helper once now, with Phase 10 in mind, is cheap. Wiring it into CSV is a Phase 10 task.
- **Scanner interval 60s is chosen for latency vs DB load** — longer (5min) risks late publishes after a worker crash; shorter (10s) is overkill for a personal tool. 60s means worst-case 60s late on the self-healing path; happy path is on-time via the delayed job.
- **Runtime re-check of the rate limit inside the worker** — it's not redundant with the pre-flight. Between scheduling and publishing, other posts might have gone out; the pre-flight was a snapshot, the runtime check is the final authority before the API call. Costs one indexed count query per publish — fine.

</specifics>

<deferred>
## Deferred Ideas

- **Real-time push updates via SSE/WebSocket** — currently 10s polling (D-15) is sufficient. If the `/posts` view ever grows to show many profiles and polling becomes expensive, revisit for a later polish phase.
- **Cross-profile rate limit views / aggregate dashboard** — LIMIT-08 dashboard widget across all profiles is **Phase 8** scope. Phase 4 only surfaces per-profile usage on `/posts` and the profile card.
- **Facebook and LinkedIn rate limits** — LIMIT-06, LIMIT-07 are Phase 8. Phase 4's rate-limit helper pattern is reusable but explicitly Twitter-only in this phase.
- **Bulk retry of multiple failed posts at once** — out of scope; Phase 4 retry is one post at a time. Bulk operations are Phase 10.
- **Webhook-style external integration (IFTTT, etc.)** — listed in PROJECT.md "Advanced Features (later milestones)." Not this phase.
- **Worker horizontal scaling / multi-worker deployment** — single-user Proxmox box runs one worker. Bull-Board will expose enough to diagnose if this ever changes.
- **Custom per-post retry override** — users can't choose "retry this post 10 times." The 4-attempt budget is global. Flagged if ever needed.
- **Email/SMTP delivery for publish-failure notifications** — Phase 4 enqueues the notification event; Phase 9 delivers it via in-app bell and SMTP.
- **`auto-destruct`, `transcode`, `token-refresh`, `media-cleanup`, `bulk` queues** — mentioned in WORKER-02 but NOT created in Phase 4. Each queue is owned by the phase that consumes it (Phase 5, 6, 7, 10 respectively). Creating them now would be dead code.

</deferred>

---

*Phase: 04-publish-worker-scheduled-posts*
*Context gathered: 2026-04-09*
