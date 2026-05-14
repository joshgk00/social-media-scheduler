# Phase 4: Publish Worker & Scheduled Posts - Research

**Researched:** 2026-04-09
**Domain:** BullMQ worker pipeline, Twitter publish, scheduled job orchestration, rate limit tracking
**Confidence:** HIGH

## Summary

Phase 4 turns the existing Phase 3 post model into an autonomously publishing system. The BullMQ + twitter-api-v2 + Drizzle + Luxon stack is already installed in `packages/worker` and `packages/api`, and CONTEXT.md locks almost every architectural decision. This research verifies the library APIs needed to implement those decisions (delayed jobs, custom backoff, stalled detection, UnrecoverableError, @bull-board integration, twitter-api-v2 error shapes, Luxon month boundaries) and documents concrete code patterns for each.

The notable library findings that shape task structure are: (1) BullMQ custom jobId provides a free idempotency layer on top of the `platform_post_id` DB check — re-enqueuing the same jobId while the job exists is a silent no-op; (2) BullMQ ships `UnrecoverableError` in v5 that fails a job immediately without consuming retry attempts — this is the clean mechanism for permanent errors (401/403/422); (3) the `twitter-api-v2` `ApiResponseError` exposes `code`, `rateLimitError`, `isAuthError`, and a `rateLimit` object with headers — the classifier has first-class hooks; (4) default BullMQ worker `lockDuration: 30000ms` and `stalledInterval: 30000ms` are appropriate for our workload and align with CONTEXT.md D-08; (5) `@bull-board/api/bullMQAdapter` (not `bullAdapter`) is the correct import for BullMQ v5.

**Primary recommendation:** Implement the publish pipeline as three tightly-scoped services — a `twitter-publish.service` (the API call + error classification), a `post-lifecycle.service` (state transitions + attempt recording inside a transaction), and a `publish-worker` module (the BullMQ Worker that wires them together). Keep the worker thin: it owns concurrency, retries, and logging; the lifecycle service owns the DB transaction contract; the twitter service owns the platform call. This keeps Phase 4 testable with MSW (mock twitter-api-v2 at HTTP level) and lets Phase 5's auto-destruct worker reuse both the lifecycle and the classifier.

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Scheduling Mechanism
- **D-01:** Hybrid scheduling. On post save, the API enqueues a BullMQ job into the `publish` queue with `delay = scheduledAt - now`. In parallel, a repeatable scanner job runs every 60 seconds, querying `posts WHERE status = 'scheduled' AND scheduledAt <= now() + 90s`, and enqueues any posts that don't have a live job (reconciliation pass). This gives on-time publishing on the happy path and self-healing after Redis/worker restarts or edit races.
- **D-02:** Edit races resolved via `post_version` optimistic locking. The publish worker reads the post row inside a transaction with `SELECT ... FOR UPDATE`, re-checks `post_version` against the value captured when the job was enqueued, and aborts gracefully if the version has moved (user edited the post). Aborted posts stay in `scheduled` status; the next scanner pass re-enqueues with fresh content. Phase 3 already added the `post_version` column for this purpose.
- **D-03:** Auto-destruct completely deferred to Phase 5 (per REQUIREMENTS.md WORKER-09). Phase 4 ignores `auto_destructing` / `destroyed` states. Posts with `autoDestructAfter` set transition to `published` normally; Phase 5 introduces the `auto-destruct` queue, worker, and the subsequent state transitions.

#### Worker Architecture
- **D-04:** BullMQ queues created in Phase 4 (matching WORKER-02): `publish`, `notification`. Other named queues from WORKER-02 (`transcode`, `token-refresh`, `auto-destruct`, `media-cleanup`, `bulk`) are NOT created in this phase — they belong to the phases that own them. Creating unused queues now would be dead code.
- **D-05:** Worker concurrency: `publish` queue limited to 2 concurrent jobs (Twitter API calls are fast; higher concurrency risks hitting per-second rate limits during burst reconciliation). Scanner runs in a single repeatable job, not concurrent.
- **D-06:** Twitter credentials decrypted in-memory only at the moment of publish, passed to the `twitter-api-v2` client, and discarded immediately after the API call returns. Decrypted tokens never enter Redis, log output, or job payloads. Job payload contains only `postId` — the worker re-reads the post and associated profile credentials inside the publish transaction.
- **D-07:** Graceful shutdown (WORKER-08): SIGTERM handler sets the worker to stop accepting new jobs, waits for in-flight jobs to finish (with 30s timeout), then disconnects Redis and exits. Reuses the existing heartbeat cleanup pattern from Phase 1.
- **D-08:** BullMQ stalled job detection enabled with default settings (job locked for 30s without progress is considered stalled). Stalled jobs automatically re-enqueued; the idempotency check on `platform_post_id` prevents duplicate publishes.

#### Retry & Error Handling
- **D-09:** Retry policy: 4 total attempts (initial + 3 retries per WORKER-04). Backoff delays: 30s → 5min → 30min. BullMQ `attempts: 4` with custom backoff function. When Twitter returns 429 with a `Retry-After` header, the worker honors that value instead of the standard backoff schedule.
- **D-10:** Error classification helper in the twitter publish service categorizes failures:
  - **Transient** — network errors, 5xx, 429: retry with backoff
  - **Permanent** — 401 (token revoked), 403 (forbidden), 422 (duplicate content, invalid payload): fail fast, transition to `failed` on first attempt, do not consume retry budget
- **D-11:** After all retries exhausted (or permanent error on first attempt): post transitions to `failed`, `failureReason` populated with a user-readable message, failed job moves to BullMQ dead letter queue for operator inspection, and a notification event is enqueued to the `notification` queue for Phase 9 to consume.

#### Failure Surfacing
- **D-12:** `/posts` view extensions (SCHED-02, SCHED-03): error column, Retry kebab action, View History modal (SCHED-04) grouped by retry cycle.
- **D-13:** Bull-Board admin dashboard mounted at `/admin/queues` protected by the existing session auth middleware.
- **D-14:** User-triggered Retry action resets the attempt counter — 4 fresh attempts. Prior `post_attempts` rows remain untouched.
- **D-15:** Real-time status updates via TanStack Query 10s polling; paused when tab hidden.

#### Publish History Storage
- **D-16:** New `post_attempts` table — id, post_id (cascade), attempt_num, started_at, finished_at, outcome (`success`/`transient_fail`/`permanent_fail`/`cancelled`), http_status, error_code, error_message, platform_post_id. Index on `(post_id, started_at)`.
- **D-17:** `attempt_num` scoped to the current retry cycle; resets on manual Retry. History modal groups by cycle.
- **D-18:** Retention forever. No cleanup job.
- **D-19:** Only compact fields stored. Full API payloads live in pino logs, not DB.

#### Twitter Rate Limit Tracking
- **D-20:** Rate limit window = calendar month UTC. Reset at 00:00 UTC on the 1st. Computed via luxon `DateTime.utc().startOf('month')`.
- **D-21:** Counter computed on demand via `SELECT count(*) FROM posts WHERE profile_id = ? AND published_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AND status IN ('published', 'auto_destructing', 'destroyed')`. Uses existing `posts_profile_status` index.
- **D-22:** Per-profile configuration on `social_profiles`: `monthly_tweet_budget integer NOT NULL DEFAULT 500`, `warn_threshold_percent integer NOT NULL DEFAULT 80`. Validation: 1 ≤ budget ≤ 10000, 1 ≤ warn_threshold ≤ 99.
- **D-23:** Pre-flight check is a reusable service function `checkTwitterBudget({ profileId, additionalPostCount })` returning `{ currentCount, budget, wouldExceed, warnThresholdHit, blockThresholdHit }`. Called by POST /api/posts, PUT /api/posts/:id, and Phase 10 CSV upload.
- **D-24:** Block behavior: API returns HTTP 409 Conflict with body `{ code: 'twitter_budget_exceeded', budget, currentCount }`.
- **D-25:** Warning banner at `currentCount / budget >= warn_threshold_percent / 100`; non-blocking; also emits a notification event.
- **D-26:** Runtime rate limit check: worker re-runs the pre-flight check before calling Twitter. If budget exhausted, aborts publish, leaves post in `scheduled`, scanner retries next pass.

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

### Deferred Ideas (OUT OF SCOPE)

- Real-time push updates via SSE/WebSocket (polling sufficient for now)
- Cross-profile rate limit dashboard (Phase 8 LIMIT-08)
- Facebook/LinkedIn rate limits (Phase 8 LIMIT-06/07)
- Bulk retry of multiple failed posts (Phase 10)
- Custom per-post retry overrides
- `auto-destruct`, `transcode`, `token-refresh`, `media-cleanup`, `bulk` queues — owned by other phases
- Webhook-style external integration
- Worker horizontal scaling / multi-worker deployment
- Email/SMTP delivery of publish-failure notifications (Phase 9 consumes the events)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WORKER-01 | Separate worker docker service, communicates via BullMQ only | Existing `packages/worker` container; wire BullMQ Worker into `main()` alongside heartbeat |
| WORKER-02 | Named BullMQ queues per job type | Phase 4 creates only `publish` and `notification` per D-04; queue names in `packages/shared/src/constants/queues.ts` |
| WORKER-03 | Publish worker checks schedule before publishing | Phase 4 scope: scheduled_at comparison + runtime rate limit check. Queue-recurrence check is Phase 5 |
| WORKER-04 | Exponential backoff, max 3 retries | BullMQ `attempts: 4` + `settings.backoffStrategy` custom function (30s→5min→30min) with UnrecoverableError for permanent failures |
| WORKER-05 | Record `published_at`, `platform_post_id`, log result | `post-lifecycle.service.markPublished()` inside DB transaction |
| WORKER-06 | Stalled detection + idempotency via `platform_post_id` | BullMQ default `lockDuration: 30000ms`, `stalledInterval: 30000ms`, `maxStalledCount: 1`; `posts_platform_post_id` unique index prevents duplicates; worker short-circuits if post row already has a platform_post_id |
| WORKER-07 | Dead letter queue on exhausted retries + notification event | BullMQ failed set = DLQ; `worker.on('failed', ...)` listener enqueues notification event when `job.attemptsMade >= job.opts.attempts` |
| WORKER-08 | Graceful shutdown, SIGTERM handled | `await worker.close()` pattern; SIGTERM race against 30s timer; reuse Phase 1 shutdown structure |
| SCHED-01 | Filterable scheduled posts list | Phase 3 `/posts` page exists; Phase 4 adds the error column and polling |
| SCHED-02 | Each row shows status badge + error message | New `error_message` column + truncation; row expand for full text |
| SCHED-03 | Per-post actions: Edit, Delete, View History, Retry | Retry action only for `failed` state; enforces via state machine `transitionPost('failed', 'scheduled')` |
| SCHED-04 | History modal showing all attempts | New `GET /api/posts/:id/history` returning `post_attempts` grouped by retry cycle |
| LIMIT-01 | Configurable monthly tweet budget | `monthly_tweet_budget` column on `social_profiles` |
| LIMIT-02 | Configurable warn threshold | `warn_threshold_percent` column; inline banner + notification event |
| LIMIT-03 | Block publishing at budget exhaustion | Worker runtime pre-check; skips publish, leaves in `scheduled` |
| LIMIT-04 | Pre-flight check on new post | Reusable `checkTwitterBudget()` service; API returns 409 Conflict on block |
| LIMIT-05 | Pre-flight check on CSV upload | Same helper; wired by Phase 10. Phase 4 writes the helper API with both callers in mind |

## Standard Stack

### Core (already installed per `packages/worker/package.json` and `packages/api/package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | ~5.73.0 | Queue / worker / scheduler | `[VERIFIED: npm view bullmq version → 5.73.3]` Installed and pinned. Ships delayed jobs, custom backoff, stalled detection, UnrecoverableError |
| ioredis | ~5.10.1 | Redis client | `[VERIFIED: installed]` BullMQ's required client |
| twitter-api-v2 | ~1.29.0 | Twitter/X client | `[VERIFIED: npm view twitter-api-v2 version → 1.29.0]` Installed in api package; OAuth 1.0a + v2 endpoints, ApiResponseError with rate limit helpers |
| drizzle-orm | ~0.45.2 | ORM | `[VERIFIED: installed]` Used for transaction + SELECT FOR UPDATE pattern |
| luxon | ~3.7.x | Timezone math | `[CITED: docs.bullmq.io]` Required for `startOf('month')` UTC boundary (`[VERIFIED: npm view luxon version → 3.7.2]`). **Not currently in packages/api/package.json or packages/worker/package.json — must be added** |
| pino | ~10.3.1 | Structured logging | `[VERIFIED: installed]` Child loggers with `correlationId` binding |

### New Dependencies (must be added)

| Package | Version | Why | Install To |
|---------|---------|-----|------------|
| `bullmq` | `~5.73.0` | API enqueues jobs, currently only worker has it | `packages/api` |
| `luxon` | `~3.7.2` | Month-boundary math for rate limit window; scheduler time math | `packages/api`, `packages/worker` |
| `@bull-board/api` | `~6.21.0` | Bull-Board queue UI (API) | `packages/api` |
| `@bull-board/express` | `~6.21.0` | Express adapter for Bull-Board | `packages/api` |
| `@types/luxon` | `~3.7.x` | Luxon types | `packages/api` (devDeps) if not bundled — luxon ships its own types, verify no @types needed |

**Version verification:**
```bash
npm view bullmq version              # → 5.73.3 (use ~5.73.0 to match worker)
npm view luxon version               # → 3.7.2
npm view @bull-board/api version     # → 6.21.0
npm view @bull-board/express version # → 6.21.0
npm view twitter-api-v2 version      # → 1.29.0 (already installed)
npm view ioredis version             # → 5.10.1 (already installed)
```
All versions verified via `npm view` on 2026-04-09. `[VERIFIED: npm registry 2026-04-09]`

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ~4.1.3 | Tests | Fake timers for backoff, mocks for twitter client |
| supertest | ~7.2.2 | HTTP assertion | Admin routes and new endpoints |

### Alternatives Considered (already rejected upstream — retained for context)
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BullMQ repeatable scanner | node-cron inside worker | Duplicates scheduling surface; BullMQ already handles it |
| Delayed jobs only | Scanner only | Would miss SCHED-01 on-time publish SLA on the happy path |
| Custom DLQ table | BullMQ failed set | Extra schema + state sync surface; the failed set + Bull-Board already covers inspection |
| UnrecoverableError | Setting `attempts: 1` at enqueue time for known-permanent | Would require knowing permanence before enqueue; error classifier runs inside the handler |

## Architecture Patterns

### Recommended File Placement

```
packages/shared/src/constants/
  queues.ts                        # NEW — QUEUE_NAMES, JOB_NAMES, defaultJobOptions

packages/shared/src/schemas/
  rate-limit.schema.ts             # NEW — Zod for PATCH /profiles/:id/rate-limit
  post-history.schema.ts           # NEW — response shape for history modal

packages/db/src/schema/
  post-attempts.ts                 # NEW — post_attempts table
  social-profiles.ts               # MODIFY — add monthly_tweet_budget, warn_threshold_percent
  index.ts                         # MODIFY — export postAttempts

packages/api/src/services/
  twitter-publish.service.ts       # NEW — API call + error classification (pure, no DB)
  post-lifecycle.service.ts        # NEW — state transitions + attempt rows (transactional)
  rate-limit.service.ts            # NEW — checkTwitterBudget helper (Phase 10 reuses)
  publish-queue.service.ts         # NEW — enqueue/cancel/reenqueue helpers used by post routes

packages/api/src/routes/
  posts.ts                         # MODIFY — new /retry and /history endpoints
  profiles.ts                      # MODIFY — new /rate-limit GET and PATCH
  admin.ts                         # NEW — Bull-Board mount protected by requireAuth

packages/worker/src/
  index.ts                         # MODIFY — wire publish worker + scanner alongside heartbeat
  publish-worker.ts                # NEW — createPublishWorker factory
  scanner.ts                       # NEW — createScannerJob factory (repeatable job producer)
  backoff.ts                       # NEW — buildBackoffStrategy function
  error-classifier.ts              # NEW — classifyTwitterError helper (shared with api package via shared)

packages/shared/src/lib/
  error-classifier.ts              # NEW — canonical place; both api publish service and worker import
```

### Pattern 1: BullMQ Queue Constants (shared module)

```typescript
// packages/shared/src/constants/queues.ts
export const QUEUE_NAMES = {
  publish: 'publish',
  notification: 'notification',
} as const;

export const JOB_NAMES = {
  publishPost: 'publish-post',
  scanScheduled: 'scan-scheduled',
  publishFailedNotification: 'publish-failed',
  rateLimitWarnNotification: 'rate-limit-warn',
} as const;

// Build stable jobIds for the publish queue so enqueue is idempotent
// and the scanner can safely re-add without creating duplicates.
// post_version is included so an edit (which bumps version) naturally
// creates a fresh job after the stale one completes/fails.
export function buildPublishJobId(postId: string, postVersion: number): string {
  return `post-${postId}-v${postVersion}`;
}
```

**Why stable jobIds:** BullMQ deduplicates by custom `jobId`. "When adding a job with an existing ID, that job will just be ignored and not added to the queue at all." `[CITED: docs.bullmq.io/guide/jobs/job-ids]` This gives us a free BullMQ-level idempotency layer on top of the DB `platform_post_id` check — the scanner cannot double-enqueue while the delayed job is still alive, and the post_version suffix ensures edits produce a fresh jobId.

### Pattern 2: Delayed Job Enqueue

```typescript
// packages/api/src/services/publish-queue.service.ts
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { QUEUE_NAMES, JOB_NAMES, buildPublishJobId } from '@sms/shared';

interface PublishJobPayload {
  postId: string;
  postVersion: number;
  correlationId: string;
}

export function createPublishQueueService(redis: Redis) {
  const publishQueue = new Queue<PublishJobPayload>(QUEUE_NAMES.publish, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 }, // keep failed for DLQ inspection
      attempts: 4,
      backoff: { type: 'publishBackoff' }, // custom strategy registered on worker
    },
  });

  async function enqueuePublish(
    postId: string,
    postVersion: number,
    scheduledAt: Date,
    correlationId: string,
  ) {
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    return publishQueue.add(
      JOB_NAMES.publishPost,
      { postId, postVersion, correlationId },
      {
        delay,
        jobId: buildPublishJobId(postId, postVersion),
      },
    );
  }

  async function cancelScheduled(postId: string, postVersion: number) {
    const jobId = buildPublishJobId(postId, postVersion);
    const job = await publishQueue.getJob(jobId);
    if (job && (await job.isDelayed())) {
      await job.remove();
    }
    // If the job is already active or completed, we rely on the
    // post_version optimistic lock (D-02) to abort gracefully.
  }

  return { publishQueue, enqueuePublish, cancelScheduled };
}
```

**Source:** BullMQ delayed job API `[CITED: docs.bullmq.io/guide/jobs/delayed]` — `delay: ms` option, `changeDelay()` not needed because edits bump `post_version` and re-enqueue with a new jobId.

### Pattern 3: Worker with Custom Backoff + UnrecoverableError

```typescript
// packages/worker/src/publish-worker.ts
import { Worker, UnrecoverableError, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Db } from '@sms/db';
import { QUEUE_NAMES } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import { classifyTwitterError } from './error-classifier.js';
import { buildBackoffStrategy } from './backoff.js';

interface PublishJobPayload {
  postId: string;
  postVersion: number;
  correlationId: string;
}

interface PublishWorkerDeps {
  redis: Redis;
  db: Db;
  publishPost: (params: { db: Db; postId: string; postVersion: number; correlationId: string }) => Promise<{ platformPostId: string }>;
}

export function createPublishWorker({ redis, db, publishPost }: PublishWorkerDeps) {
  const worker = new Worker<PublishJobPayload>(
    QUEUE_NAMES.publish,
    async (job) => {
      const logger = createLogger('publish-worker').child({
        correlationId: job.data.correlationId,
        postId: job.data.postId,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
      });

      logger.info('Processing publish job');

      try {
        const result = await publishPost({
          db,
          postId: job.data.postId,
          postVersion: job.data.postVersion,
          correlationId: job.data.correlationId,
        });
        logger.info({ platformPostId: result.platformPostId }, 'Publish succeeded');
        return result;
      } catch (err) {
        const classification = classifyTwitterError(err);
        if (classification.kind === 'permanent') {
          logger.warn({ errCode: classification.errorCode }, 'Permanent failure — skipping retries');
          throw new UnrecoverableError(classification.message);
        }
        // Transient — let BullMQ retry per backoff strategy.
        // The backoff strategy will honor Retry-After from rateLimit headers.
        logger.warn({ errCode: classification.errorCode }, 'Transient failure — will retry');
        throw err;
      }
    },
    {
      connection: redis,
      concurrency: 2,           // D-05
      lockDuration: 30_000,     // BullMQ default, explicit for clarity (D-08)
      stalledInterval: 30_000,  // BullMQ default
      maxStalledCount: 1,       // BullMQ default — one stall moves to failed
      settings: {
        backoffStrategy: buildBackoffStrategy(),
      },
    },
  );

  return worker;
}
```

**Source:** BullMQ `UnrecoverableError` "moves a job to failed even if the attemptsMade are lower than the expected limit" `[CITED: api.docs.bullmq.io UnrecoverableError]`. Defaults for lockDuration/stalledInterval/maxStalledCount verified `[CITED: api.docs.bullmq.io WorkerOptions — lockDuration=30000, stalledInterval=30000, maxStalledCount=1]`.

### Pattern 4: Custom Backoff Strategy with Retry-After Support

```typescript
// packages/worker/src/backoff.ts
import type { Job } from 'bullmq';
import { ApiResponseError } from 'twitter-api-v2';

const BACKOFF_SCHEDULE_MS = [30_000, 5 * 60_000, 30 * 60_000]; // 30s, 5min, 30min

export function buildBackoffStrategy() {
  return (attemptsMade: number, _type: string, err: Error, _job: Job): number => {
    // attemptsMade is 1-indexed *after* the failure, so for the 1st failure
    // attemptsMade=1 and we return the delay before attempt 2.
    const scheduleIndex = attemptsMade - 1;

    // Honor Twitter's Retry-After header on 429
    if (err instanceof ApiResponseError && err.rateLimitError && err.rateLimit) {
      const resetMs = err.rateLimit.reset * 1000 - Date.now();
      if (resetMs > 0) {
        return Math.min(resetMs, 30 * 60_000); // cap at 30 min
      }
    }

    return BACKOFF_SCHEDULE_MS[scheduleIndex] ?? BACKOFF_SCHEDULE_MS.at(-1)!;
  };
}
```

**Source:** BullMQ custom backoff signature `(attemptsMade, type, err, job) => number` `[CITED: docs.bullmq.io/guide/retrying-failing-jobs]`. twitter-api-v2 `ApiResponseError.rateLimitError` getter + `rateLimit.reset` (unix seconds) `[CITED: github.com/PLhery/node-twitter-api-v2 errors doc]`.

**Note:** Returning `-1` would prevent retry entirely `[CITED: docs.bullmq.io/guide/retrying-failing-jobs]`, but CONTEXT.md D-10 uses `UnrecoverableError` for permanent failures — that's cleaner because it preserves the attempts metadata and failure reason.

### Pattern 5: Error Classifier (shared module)

```typescript
// packages/shared/src/lib/error-classifier.ts
import { ApiResponseError, ApiRequestError } from 'twitter-api-v2';

export type ClassifiedError =
  | { kind: 'transient'; httpStatus: number | null; errorCode: string; message: string }
  | { kind: 'permanent'; httpStatus: number | null; errorCode: string; message: string };

const PERMANENT_HTTP = new Set([400, 401, 403, 404, 422]);
const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504]);

export function classifyTwitterError(err: unknown): ClassifiedError {
  // Network error before HTTP (DNS, ECONNRESET, etc.)
  if (err instanceof ApiRequestError || (err as NodeJS.ErrnoException)?.code === 'ECONNRESET') {
    return {
      kind: 'transient',
      httpStatus: null,
      errorCode: (err as NodeJS.ErrnoException).code ?? 'network_error',
      message: 'Network error contacting Twitter API',
    };
  }

  if (err instanceof ApiResponseError) {
    const status = err.code; // ApiResponseError.code is the HTTP status
    const twitterErrors = err.errors ?? [];
    const twitterCode = twitterErrors[0]?.code != null ? String(twitterErrors[0].code) : 'unknown';
    const twitterDetail = twitterErrors[0]?.message ?? err.data?.detail ?? err.message;

    // 187 = "Status is a duplicate" — Twitter-specific permanent failure
    const DUPLICATE_STATUS_CODE = 187;
    if (twitterErrors.some(e => e.code === DUPLICATE_STATUS_CODE)) {
      return { kind: 'permanent', httpStatus: status, errorCode: 'duplicate_content', message: 'Duplicate content — Twitter rejected this tweet' };
    }

    if (err.isAuthError || status === 401) {
      return { kind: 'permanent', httpStatus: status, errorCode: 'auth_revoked', message: 'Twitter credentials are no longer valid — please reconnect the profile' };
    }

    if (PERMANENT_HTTP.has(status)) {
      return { kind: 'permanent', httpStatus: status, errorCode: `http_${status}_${twitterCode}`, message: twitterDetail };
    }

    if (TRANSIENT_HTTP.has(status)) {
      return { kind: 'transient', httpStatus: status, errorCode: `http_${status}`, message: twitterDetail };
    }

    // Unknown HTTP: treat as transient to give the user one more shot
    return { kind: 'transient', httpStatus: status, errorCode: `http_${status}_unknown`, message: twitterDetail };
  }

  // Unknown error shape — treat as transient (safer default)
  const message = err instanceof Error ? err.message : 'Unknown error';
  return { kind: 'transient', httpStatus: null, errorCode: 'unknown', message };
}
```

**Source:** twitter-api-v2 `ApiResponseError` fields `code` (HTTP status), `isAuthError` getter, `rateLimitError` getter, `errors[]` array, and `data` object `[CITED: github.com/PLhery/node-twitter-api-v2 doc/errors.md]`.

### Pattern 6: Publish Lifecycle (transactional state transition)

```typescript
// packages/api/src/services/post-lifecycle.service.ts
import { sql, eq, and } from 'drizzle-orm';
import type { Db } from '@sms/db';
import { posts, postAttempts, socialProfiles } from '@sms/db';
import { transitionPost } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';

const logger = createLogger('post-lifecycle');

export class PostLifecycleAbort extends Error {
  constructor(public reason: 'version_mismatch' | 'already_published' | 'not_scheduled' | 'budget_exhausted') {
    super(reason);
  }
}

interface PublishContext {
  postId: string;
  expectedVersion: number;
  correlationId: string;
  // Injected to keep this file free of HTTP concerns
  callTwitter: (profile: typeof socialProfiles.$inferSelect, postText: string, isThread: boolean) => Promise<{ platformPostId: string }>;
  checkBudget: (profileId: string) => Promise<{ wouldExceed: boolean }>;
}

export async function publishPost(db: Db, ctx: PublishContext) {
  // 1. Lock the post row, verify version + state, transition to publishing
  const attemptStart = new Date();

  const lockedPost = await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT p.*, sp.id AS profile_row_id
      FROM posts p
      JOIN social_profiles sp ON sp.id = p.profile_id
      WHERE p.id = ${ctx.postId}
      FOR UPDATE OF p
    `);
    const post = (rows as any)[0];
    if (!post) throw new PostLifecycleAbort('not_scheduled');

    // Idempotency: if we already published, short-circuit success
    if (post.platform_post_id) {
      logger.info({ postId: ctx.postId, platformPostId: post.platform_post_id }, 'Idempotent: post already has platform_post_id — skipping');
      throw new PostLifecycleAbort('already_published');
    }

    if (post.post_version !== ctx.expectedVersion) {
      throw new PostLifecycleAbort('version_mismatch');
    }

    if (post.status !== 'scheduled') {
      throw new PostLifecycleAbort('not_scheduled');
    }

    // D-26: runtime rate limit re-check
    const budget = await ctx.checkBudget(post.profile_id);
    if (budget.wouldExceed) {
      throw new PostLifecycleAbort('budget_exhausted');
    }

    // Transition scheduled → publishing
    transitionPost(post.status, 'publishing');
    await tx
      .update(posts)
      .set({ status: 'publishing', updatedAt: new Date() })
      .where(and(eq(posts.id, ctx.postId), eq(posts.postVersion, ctx.expectedVersion)));

    return post;
  });

  // 2. Perform the network call OUTSIDE the DB transaction. Long-held
  //    row locks across a network call would block other workers.
  //    The 'publishing' state is now visible to other sessions,
  //    and the platform_post_id unique index prevents duplicate success.
  let platformPostId: string;
  try {
    const result = await ctx.callTwitter(lockedPost, lockedPost.text, lockedPost.is_thread);
    platformPostId = result.platformPostId;
  } catch (err) {
    // 3a. Record attempt + revert to scheduled (if transient) or failed (if permanent)
    await recordFailureAttempt(db, ctx.postId, attemptStart, err, ctx.correlationId);
    throw err;
  }

  // 3b. Success: record attempt + transition to published
  await db.transaction(async (tx) => {
    await tx.insert(postAttempts).values({
      postId: ctx.postId,
      attemptNum: 1, // replaced with real counter by the caller wiring
      startedAt: attemptStart,
      finishedAt: new Date(),
      outcome: 'success',
      platformPostId,
    });

    await tx
      .update(posts)
      .set({
        status: 'published',
        publishedAt: new Date(),
        platformPostId,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, ctx.postId));
  });

  return { platformPostId };
}
```

**Key patterns:**
- `SELECT ... FOR UPDATE` on the post row inside the transaction implements the optimistic lock (D-02). The row lock is short — only the version check + transition to `publishing`.
- The Twitter API call happens **outside** the DB transaction. Long-held locks across a ~2s network call would serialize the entire worker. The `publishing` state + `platform_post_id` unique index together provide the correctness guarantee.
- Idempotency has **two layers**: (a) the `platform_post_id` column short-circuit at the top of the transaction, (b) the Postgres unique index `posts_platform_post_id` as a hard backstop if two workers race (the second will get a unique violation and can treat it as success).

### Pattern 7: Rate Limit Counter (on-demand)

```typescript
// packages/api/src/services/rate-limit.service.ts
import { DateTime } from 'luxon';
import { sql, and, eq, gte, inArray } from 'drizzle-orm';
import type { Db } from '@sms/db';
import { posts, socialProfiles } from '@sms/db';

export interface BudgetCheckResult {
  currentCount: number;
  budget: number;
  warnThresholdPercent: number;
  wouldExceed: boolean;
  warnThresholdHit: boolean;
  blockThresholdHit: boolean;
  monthStartUtc: Date;
}

const COUNTED_STATUSES = ['published', 'auto_destructing', 'destroyed'] as const;

export async function checkTwitterBudget(
  db: Db,
  { profileId, additionalPostCount }: { profileId: string; additionalPostCount: number },
): Promise<BudgetCheckResult> {
  const monthStart = DateTime.utc().startOf('month').toJSDate();

  const [profile] = await db
    .select({
      budget: socialProfiles.monthlyTweetBudget,
      warnThresholdPercent: socialProfiles.warnThresholdPercent,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));

  if (!profile) throw new Error(`Profile ${profileId} not found`);

  const [countRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(posts)
    .where(
      and(
        eq(posts.profileId, profileId),
        gte(posts.publishedAt, monthStart),
        inArray(posts.status, [...COUNTED_STATUSES]),
      ),
    );

  const currentCount = Number(countRow.c);
  const projectedCount = currentCount + additionalPostCount;
  const warnThreshold = Math.floor(profile.budget * (profile.warnThresholdPercent / 100));

  return {
    currentCount,
    budget: profile.budget,
    warnThresholdPercent: profile.warnThresholdPercent,
    wouldExceed: projectedCount > profile.budget,
    warnThresholdHit: projectedCount >= warnThreshold,
    blockThresholdHit: projectedCount >= profile.budget,
    monthStartUtc: monthStart,
  };
}
```

**Source:** Luxon `DateTime.utc().startOf('month')` returns the first day at 00:00:00.000 UTC `[CITED: moment.github.io/luxon DateTime.startOf]`.

**Race condition note:** This count is computed at the moment of the call but is not atomic against concurrent worker publishes. The `concurrency: 2` limit on the publish worker caps the worst-case race at 2 posts. Since we check twice (pre-flight at API + runtime re-check inside worker), and budget is set by the user (not a hard API limit), a 1-off overshoot is acceptable. If we ever need hard atomicity, promote the counter to a row with advisory lock — but CONTEXT.md D-21 explicitly prefers on-demand query over a counter table.

### Pattern 8: Scanner Repeatable Job

```typescript
// packages/worker/src/scanner.ts
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Db } from '@sms/db';
import { and, eq, lte, isNull, sql } from 'drizzle-orm';
import { posts } from '@sms/db';
import { QUEUE_NAMES, JOB_NAMES, buildPublishJobId } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import { randomUUID } from 'node:crypto';

const SCANNER_QUEUE = 'scanner'; // private queue just for the repeatable trigger
const SCAN_INTERVAL_MS = 60_000;
const SCAN_HORIZON_MS = 90_000;  // look 90s into the future

export async function startScanner(redis: Redis, db: Db, publishQueue: Queue) {
  const logger = createLogger('scanner');

  // Private queue that hosts the repeatable "tick" job.
  const scannerQueue = new Queue(SCANNER_QUEUE, { connection: redis });

  // Idempotent add — BullMQ ignores duplicate repeatable registrations with the same key.
  await scannerQueue.add(
    JOB_NAMES.scanScheduled,
    {},
    {
      repeat: { every: SCAN_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );

  const scannerWorker = new Worker(
    SCANNER_QUEUE,
    async () => {
      const horizon = new Date(Date.now() + SCAN_HORIZON_MS);
      const duePosts = await db
        .select({ id: posts.id, postVersion: posts.postVersion, scheduledAt: posts.scheduledAt })
        .from(posts)
        .where(
          and(
            eq(posts.status, 'scheduled'),
            lte(posts.scheduledAt, horizon),
            // Exclude posts that already have a platform_post_id (belt & suspenders)
            isNull(posts.platformPostId),
          ),
        );

      logger.info({ count: duePosts.length }, 'Scanner pass');

      for (const post of duePosts) {
        // BullMQ dedupes by jobId — if a delayed job is already registered
        // for this (postId, version) pair, this add is a silent no-op.
        const delay = Math.max(0, (post.scheduledAt?.getTime() ?? 0) - Date.now());
        await publishQueue.add(
          JOB_NAMES.publishPost,
          { postId: post.id, postVersion: post.postVersion, correlationId: randomUUID() },
          {
            delay,
            jobId: buildPublishJobId(post.id, post.postVersion),
          },
        );
      }
    },
    { connection: redis, concurrency: 1 }, // D-05: scanner never concurrent
  );

  return { scannerQueue, scannerWorker };
}
```

**Source:** BullMQ `repeat.every` ms interval `[CITED: docs.bullmq.io/guide/jobs/repeatable]`.

### Pattern 9: @bull-board Integration Mounted in API

```typescript
// packages/api/src/routes/admin.ts
import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Queue } from 'bullmq';
import { requireAuth } from '../middleware/auth-guard.js';

interface AdminDeps {
  publishQueue: Queue;
  notificationQueue: Queue;
}

export function createAdminRouter({ publishQueue, notificationQueue }: AdminDeps) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(publishQueue), new BullMQAdapter(notificationQueue)],
    serverAdapter,
  });

  const router = Router();
  // Session auth protects the entire dashboard
  router.use('/admin/queues', requireAuth, serverAdapter.getRouter());
  return router;
}
```

**Key point:** `BullMQAdapter` is imported from `@bull-board/api/bullMQAdapter` (camelCase, NOT `bullAdapter` which is for the older `bull` library). `[CITED: github.com/felixmosh/bull-board/tree/master/packages/api]`

**CSRF interaction:** Bull-Board uses standard Express forms — the existing `csrf-csrf` middleware will cover POST actions from its UI as long as cookies flow. If the Bull-Board UI breaks on state-changing actions, scope an exception for `/admin/queues` or rely on session auth only for that prefix.

### Pattern 10: Graceful Shutdown (extending existing worker `index.ts`)

```typescript
// packages/worker/src/index.ts (modified main())
async function main() {
  const REDIS_URL = requireEnv('REDIS_URL');
  const DATABASE_URL = requireEnv('DATABASE_URL');

  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null }); // BullMQ requires this
  redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
  await redis.ping();

  const db = createDb(DATABASE_URL);

  const heartbeatInterval = startHeartbeat(redis);
  const publishQueue = new Queue(QUEUE_NAMES.publish, { connection: redis });
  const publishWorker = createPublishWorker({ redis, db, publishPost });
  const scanner = await startScanner(redis, db, publishQueue);

  logger.info('Worker fully started: heartbeat + publish + scanner');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down...');
    stopHeartbeat(heartbeatInterval);

    // Close workers first — they stop accepting new jobs and wait for
    // in-flight jobs to finish naturally. Each close in its own try-catch
    // per CLAUDE.md convention (shutdown: one failure must not skip the rest).
    const closeWithTimeout = async (name: string, fn: () => Promise<void>) => {
      try {
        await Promise.race([
          fn(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error(`${name} close timed out`)), 30_000),
          ),
        ]);
      } catch (err) {
        logger.error({ err, name }, 'Shutdown step failed');
      }
    };

    await closeWithTimeout('publishWorker', () => publishWorker.close());
    await closeWithTimeout('scannerWorker', () => scanner.scannerWorker.close());
    await closeWithTimeout('publishQueue', () => publishQueue.close());
    await closeWithTimeout('scannerQueue', () => scanner.scannerQueue.close());
    try { await redis.quit(); } catch (err) { logger.error({ err }, 'Redis quit error'); }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

**Source:** `worker.close()` "will not timeout by itself, so you should make sure that your jobs finalize in a timely manner" `[CITED: docs.bullmq.io/guide/workers/graceful-shutdown]`. We add a 30s Promise.race timeout per CONTEXT.md D-07.

**Important:** BullMQ requires `maxRetriesPerRequest: null` on the ioredis connection passed to workers/queues. `[CITED: docs.bullmq.io/guide/connections]` This needs to be set even though the existing heartbeat code works without it.

### Anti-Patterns to Avoid

- **Holding the DB row lock across the Twitter API call** — serializes workers, starves other publishes. Always release the lock before the network call; correctness comes from the `platform_post_id` unique index + idempotent state check on re-entry.
- **Re-using jobId without post_version suffix** — breaks the ability to re-enqueue after an edit; the scanner would see a matching jobId and silently skip the post.
- **Using `fixed` BullMQ backoff** — doesn't match the 30s→5min→30min schedule. Must use custom strategy.
- **Letting UnrecoverableError leak into the "failed" notification** — the error code still needs to route to `notification` queue, just without consuming retry budget. Handle in the `worker.on('failed')` listener regardless of whether attempts exhausted or UnrecoverableError fired.
- **Storing decrypted tokens in the job payload** — violates D-06 and SEC-04. Payload must contain only `postId` + `postVersion` + `correlationId`.
- **Using `bull` (without MQ) adapter in @bull-board** — wrong package; must use `BullMQAdapter` from `@bull-board/api/bullMQAdapter`.
- **Running the scanner in the same Worker concurrency pool as publish** — D-05 requires scanner in a separate worker (concurrency 1) so a slow publish queue can't starve reconciliation.
- **Enqueuing a post with `delay: negative`** — BullMQ treats this as "publish immediately" which is the desired behavior for overdue posts, but make the intent explicit with `Math.max(0, scheduledAt - now)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Delayed job execution | `setTimeout` over DB poll | BullMQ `delay` option | Survives worker restarts, integrates with retry/backoff |
| Stalled job detection | Heartbeat per job in Postgres | BullMQ `stalledInterval` + `lockDuration` | Built into the library, battle tested |
| Idempotent enqueue | DB lock + exists check | BullMQ custom `jobId` deduplication | Silent no-op on duplicate add |
| Permanent vs transient failure routing | Custom attempts counter | `UnrecoverableError` from `bullmq` | BullMQ v5 native; preserves failed metadata |
| Retry backoff with Retry-After | Manual timer + Redis key | BullMQ custom `backoffStrategy` function | Gets `(attemptsMade, type, err, job)` natively |
| Twitter error classification | String matching on error message | `ApiResponseError` getters (`isAuthError`, `rateLimitError`, `code`, `errors[]`) | Stable library surface |
| Queue dashboard | Custom admin pages | `@bull-board/express` + `BullMQAdapter` | Free queue inspection, retry, remove |
| Month boundary math | `new Date(year, month, 1)` + UTC offset wrangling | `DateTime.utc().startOf('month')` from luxon | DST-safe; aligns with Twitter dev portal |
| Graceful shutdown | `process.kill` after timeout | `worker.close()` + outer Promise.race timeout | Library draining is correct; timeout is just a backstop |
| Optimistic lock for state machine | Custom `UPDATE ... WHERE status = ?` | `SELECT FOR UPDATE` + `transitionPost()` from Phase 3 | Phase 3's `transitionPost` is already the canonical mechanism |

**Key insight:** BullMQ v5 ships every scheduling primitive Phase 4 needs. The only custom code is (a) the backoff strategy function, (b) the error classifier, and (c) the lifecycle service. Resist the urge to build abstractions over BullMQ — the library is thin already.

## Common Pitfalls

### Pitfall 1: ioredis maxRetriesPerRequest blocks BullMQ workers
**What goes wrong:** Default ioredis retries every request up to 20 times with internal backoff, which breaks BullMQ's blocking `BRPOPLPUSH` calls. Worker appears to hang.
**Why it happens:** BullMQ requires `maxRetriesPerRequest: null` on the connection. Existing Phase 1 heartbeat code doesn't need it because `SET EX` is non-blocking.
**How to avoid:** Create a dedicated Redis instance for BullMQ queues/workers: `new Redis(url, { maxRetriesPerRequest: null })`. Keep the heartbeat Redis separate or use the same options.
**Warning signs:** Tests that pass in isolation hang when run with a real Redis; "Connection is closed" errors in BullMQ logs.

### Pitfall 2: Custom jobId dedup silently hides re-enqueue attempts
**What goes wrong:** A post is edited, but the edit didn't bump `post_version`, so the scanner re-adds with the same `jobId` and BullMQ silently ignores it. The old (stale) job still runs.
**Why it happens:** BullMQ "ignores and does not add" duplicate jobIds `[CITED: docs.bullmq.io/guide/jobs/job-ids]`. The edit's text is in the DB but the worker reads the DB at job execution — so actually this is fine for text edits. **The real trap is scheduled_at changes**: if the old jobId is still in the delayed state with the old delay, the new scheduled_at is not honored.
**How to avoid:** Always bump `post_version` on any edit (Phase 3 already does this), and include `postVersion` in the `jobId`. Also call `cancelScheduled(postId, oldVersion)` on update — the new version creates a fresh jobId + fresh delay.
**Warning signs:** Scheduled posts firing at the old time after an edit.

### Pitfall 3: Idempotency check too late — Twitter double-posts on stalled recovery
**What goes wrong:** Job processes, calls Twitter, Twitter succeeds and returns tweet id, worker crashes before updating DB. BullMQ detects stall, re-enqueues. New worker instance runs the job, re-calls Twitter, creates a second tweet.
**Why it happens:** The DB `platform_post_id` write wasn't atomic with the Twitter call.
**How to avoid:** On every publish job entry, **first** check `posts.platform_post_id` — if non-null, return success without calling Twitter (the row is the source of truth). As a secondary backstop, the Twitter API returns error code 187 ("duplicate status") for the second attempt, which the classifier treats as permanent success-equivalent. Both layers matter.
**Warning signs:** Two identical tweets from the same post after a worker restart; post_attempts table shows two success rows for the same post.

### Pitfall 4: Custom backoff strategy must be registered on the Worker, not the Queue
**What goes wrong:** Setting `settings.backoffStrategy` on the `Queue` has no effect — it only runs on the `Worker` side.
**Why it happens:** BullMQ runs the backoff function in the worker process (the queue process may be in a separate container).
**How to avoid:** Register `backoffStrategy` inside the `Worker` constructor's `settings`, not `Queue` options. The Queue just references it by `type: 'publishBackoff'` name.
**Warning signs:** Jobs retry with default delay (2s exponential) instead of the 30s→5min→30min schedule.

### Pitfall 5: `DateTime.utc().startOf('month')` requires the system-month not JS-Date month
**What goes wrong:** Using `new Date()` directly with local-timezone math drifts across UTC midnight on the 1st.
**Why it happens:** Node's `new Date()` is local unless explicitly UTC.
**How to avoid:** Always go through luxon for the boundary: `DateTime.utc().startOf('month').toJSDate()`. This returns a `Date` whose underlying timestamp is the UTC month start, regardless of the server's timezone.
**Warning signs:** Rate limit counter resetting ~5 hours early or late depending on the host's `TZ` env.

### Pitfall 6: @bull-board UI needs CSRF exception or the existing middleware breaks it
**What goes wrong:** Clicking "Retry" in Bull-Board fails with 403 because the UI doesn't send the CSRF token from `csrf-csrf`.
**Why it happens:** csrf-csrf expects a double-submit cookie pattern; Bull-Board doesn't know about it.
**How to avoid:** Two options: (a) mount Bull-Board before the csrf-csrf middleware (session auth is still in place), or (b) add `/admin/queues` to the csrf-csrf ignoreRoutes. Option (b) is cleaner because it keeps the order deterministic.
**Warning signs:** Bull-Board read works, writes return 403.

### Pitfall 7: Scanner passes the same horizon to every iteration → oversees already-queued jobs
**What goes wrong:** Scanner queries every 60s with a 90s horizon and re-enqueues posts whose delayed job is still alive.
**Why it happens:** This is actually **correct behavior** — BullMQ's jobId dedup silently handles it. But if jobId construction is wrong (e.g., missing version suffix) it would double-process.
**How to avoid:** Confirm jobId stability in tests: scanner enqueue during a pending delayed job must be a no-op. Spy on `publishQueue.add` returns — BullMQ returns the existing job, not a new one, so the test can assert on job count.

### Pitfall 8: UnrecoverableError swallows the error message in the failed listener
**What goes wrong:** `worker.on('failed', (job, err) => ...)` receives `UnrecoverableError` as the `err`, not the original twitter error. The notification loses the root cause.
**Why it happens:** The `throw new UnrecoverableError(message)` replaces the error object.
**How to avoid:** Persist the classification **before** throwing: write the `post_attempts` row (with the real error_code and message) inside the handler, then throw `UnrecoverableError(classification.message)`. The failed listener reads from `post_attempts`, not from `err`.

## Runtime State Inventory

Not applicable — Phase 4 is a greenfield capability addition. No rename, refactor, or data migration of existing records. New table (`post_attempts`) and new columns on `social_profiles` are schema additions with safe defaults.

**Category-by-category explicit check:**
- **Stored data:** None — new table and new columns only. Existing post rows keep their current values.
- **Live service config:** None — no external service has this project's queue names baked into an external UI.
- **OS-registered state:** None — worker runs inside Docker, no host-level registrations.
- **Secrets/env vars:** No new secrets. Reuses existing `REDIS_URL`, `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY` from Phase 1.
- **Build artifacts:** None.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | assumed ✓ | 22 LTS (per CLAUDE.md) | — |
| Redis | BullMQ | ✓ (docker-compose from Phase 1) | 7.4-alpine | — |
| PostgreSQL | Drizzle | ✓ (docker-compose from Phase 1) | 17-alpine | — |
| Twitter Dev App credentials | Publish pipeline | user-supplied per-profile | OAuth 1.0a | — |
| ioredis | Client | ✓ (~5.10.1 installed) | — | — |
| bullmq | Queue library | ✓ in worker, ✗ in api | ~5.73.0 in worker | add to api package.json |
| twitter-api-v2 | Twitter client | ✓ in api, ✗ in worker | ~1.29.0 in api | worker imports via `@sms/shared` or adds dep |
| luxon | Month boundary math | ✗ in both packages | needs ~3.7.2 | add to api and worker |
| @bull-board/api | Queue UI | ✗ | needs ~6.21.0 | add to api |
| @bull-board/express | Express adapter | ✗ | needs ~6.21.0 | add to api |

**Missing dependencies with no fallback:** none — all are addable via npm.

**Missing dependencies with fallback:** none.

**Dependency strategy:** `twitter-api-v2` needs to be importable from both the worker (for publishing) and the api (for existing profile validation). Two options: (a) add `twitter-api-v2` as a direct worker dep (simpler, matches existing pattern), or (b) re-export the wrapper from `@sms/shared`. Recommend (a) — the package is 23KB and tiny, and `@sms/shared` is browser-safe territory in the long run.

## Code Examples

### Enqueuing from API on post creation

```typescript
// packages/api/src/routes/posts.ts (modified POST /api/posts handler)
const post = await createPost(db, userId, validated);
if (post.status === 'scheduled' && post.scheduledAt) {
  const correlationId = req.correlationId ?? randomUUID();
  await publishQueueService.enqueuePublish(
    post.id,
    post.postVersion,
    new Date(post.scheduledAt),
    correlationId,
  );
}
res.status(201).json(post);
```

### Retry endpoint

```typescript
// POST /api/posts/:id/retry
router.post('/api/posts/:id/retry', requireAuth, async (req, res) => {
  const postId = validateUuidParam(req.params.id as string);
  const userId = req.session.userId!;

  const updated = await db.transaction(async (tx) => {
    const [post] = await tx.select().from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId)));
    if (!post) throw new PostServiceError('Not found', 404);
    if (post.status !== 'failed') throw new PostServiceError('Only failed posts can be retried', 409);

    transitionPost(post.status, 'scheduled'); // validates transition
    const [row] = await tx
      .update(posts)
      .set({
        status: 'scheduled',
        failureReason: null,
        failedAt: null,
        postVersion: sql`${posts.postVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))
      .returning();
    return row;
  });

  // scheduledAt is unchanged; enqueue with delay 0 so the worker picks it up immediately
  await publishQueueService.enqueuePublish(updated.id, updated.postVersion, new Date(), req.correlationId);
  res.json(updated);
});
```

### History endpoint (grouped by retry cycle)

```typescript
// GET /api/posts/:id/history
router.get('/api/posts/:id/history', requireAuth, async (req, res) => {
  const postId = validateUuidParam(req.params.id as string);
  const userId = req.session.userId!;

  // Verify ownership
  const [post] = await db.select({ id: posts.id }).from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)));
  if (!post) return res.status(404).json({ error: 'Not found' });

  const attempts = await db
    .select()
    .from(postAttempts)
    .where(eq(postAttempts.postId, postId))
    .orderBy(postAttempts.startedAt);

  // Group by cycle: when attemptNum resets to 1, start a new cycle
  const cycles: typeof attempts[] = [];
  let currentCycle: typeof attempts = [];
  for (const attempt of attempts) {
    if (attempt.attemptNum === 1 && currentCycle.length > 0) {
      cycles.push(currentCycle);
      currentCycle = [];
    }
    currentCycle.push(attempt);
  }
  if (currentCycle.length > 0) cycles.push(currentCycle);

  res.json({ postId, cycles });
});
```

### Scanner test (fake timers + spy)

```typescript
// packages/worker/src/__tests__/scanner.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('scanner', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('dedupes re-enqueue of the same post during an active delayed job', async () => {
    const publishQueue = { add: vi.fn() };
    // Simulate scanner pass 1
    await runScannerOnce({ db: mockDbWith1DuePost, publishQueue });
    expect(publishQueue.add).toHaveBeenCalledOnce();
    const firstJobId = publishQueue.add.mock.calls[0][2].jobId;

    // Scanner pass 2 — same post
    await runScannerOnce({ db: mockDbWith1DuePost, publishQueue });
    expect(publishQueue.add).toHaveBeenCalledTimes(2);
    const secondJobId = publishQueue.add.mock.calls[1][2].jobId;

    // jobIds match → BullMQ in real life would dedupe;
    // we assert the jobId contract at the unit boundary.
    expect(secondJobId).toBe(firstJobId);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bull (v3) `JobOpts.backoff` with string types | BullMQ v5 `backoffStrategy` function in worker settings | BullMQ 1.x | Function receives `(attemptsMade, type, err, job)` for richer decisions |
| `QueueScheduler` separate process | QueueScheduler merged into Worker | BullMQ 2.0 | No separate scheduler process needed; repeatables and delayed handled by any worker |
| Prisma/TypeORM for lock patterns | Drizzle `sql` template + native FOR UPDATE | Drizzle 0.20+ | Direct SQL with type safety; no ORM query builder quirks around row locks |
| csurf | csrf-csrf | 2022 | Already adopted in Phase 1 |
| `bull` adapter in bull-board | `bullMQAdapter` | bull-board 4.x | New import path: `@bull-board/api/bullMQAdapter` |

**Deprecated/outdated:**
- **`bull` library (not BullMQ):** maintenance-only; do not use.
- **BullMQ `QueueScheduler` as a separate class:** merged into Worker in v2; no longer needed.
- **csurf:** deprecated, replaced by csrf-csrf (already in place).

## Project Constraints (from CLAUDE.md)

### Module Structure (directly relevant to Phase 4)
- **Factory functions only** — `createPublishWorker`, `createPublishQueueService`, `createAdminRouter` all take injected dependencies. No top-level `new Queue(...)` outside a factory.
- **No top-level side effects** — every Queue/Worker construction must be inside a function body, not at module load time.
- **Env vars read inside functions** — `requireEnv('REDIS_URL')` inside `main()`, never at module top.
- **`import.meta.url` + `dirname()`** — never `process.cwd()`.

### Error Handling
- **Every async op has explicit error handling** — the `publishPost` service uses try/catch around the twitter call. The worker's handler re-throws classified errors for BullMQ to retry.
- **Unawaited promises:** heartbeat-style fire-and-forget (with `.catch(logger.error)`) for notification queue emits that happen in a failed-listener — the listener cannot await.
- **Shutdown try-catch per resource:** enforced by the `closeWithTimeout` helper in the modified `main()`.
- **No empty catch blocks** — every catch logs or rethrows.
- **Wrap low-level errors** — `PostLifecycleAbort` wraps the lock-check failures with a typed reason. Network errors wrapped via `classifyTwitterError`.

### Naming
- `isPublishable`, `hasExpectedVersion`, `shouldRetry` — boolean prefix
- `attemptStart` not `start` or `s`
- `classifyTwitterError` not `classify` (domain-specific)
- `publishPost` not `processJob` (domain not library jargon)

### Validation
- New Zod schemas in `packages/shared/src/schemas/` for: rate-limit PATCH body, history response, retry response
- Multi-step DB mutations (lock + transition + attempt insert) → `db.transaction()`

### Type Safety
- `Job<PublishJobPayload>` for the worker handler
- `ApiResponseError` imported from twitter-api-v2 — never narrow with `any`
- `ClassifiedError` as a discriminated union

### Testing
- Security-critical: worker lifecycle service branch coverage (state transitions, lock checks, idempotency) → 100% branch coverage
- Both success AND failure paths for classifier
- Shared test helpers in `packages/worker/src/__tests__/helpers/` and `packages/api/src/__tests__/helpers/`
- `vi.useFakeTimers()` for backoff + scanner interval tests

### Dependencies
- Production deps: tilde `~` (patch-only). Added dependencies: `bullmq ~5.73.0`, `luxon ~3.7.2`, `@bull-board/api ~6.21.0`, `@bull-board/express ~6.21.0`.

### Docker & Infrastructure
- Worker already runs as non-root per Phase 1 Dockerfile
- Redis auth already configured in Phase 1 docker-compose
- Bull-Board should NOT be exposed on `0.0.0.0` — mounted on the API server which nginx fronts

### Anti-patterns to enforce against
- **`cat | grep` shell patterns** — use `rg` in test commands and scripts
- **Dep version bumps not tied to the task** — don't upgrade bullmq from 5.73 to something newer "while we're in there"
- **Namespaces not matching paths** — enforced by monorepo TS config already
- **Refactoring outside task scope** — don't touch Phase 3's post.service.ts beyond the specific additions Phase 4 requires

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@bull-board/api/bullMQAdapter` is the correct subpath import for BullMQ v5 compat | Pattern 9 | LOW — verified via `[CITED: github.com/felixmosh/bull-board tree/master/packages/api]` and package file listing, but not a direct docs link. First task should verify by `tsc` compile check. |
| A2 | `ApiResponseError` in twitter-api-v2 1.29 has the `rateLimitError` + `isAuthError` getters and a `rateLimit` object with a `.reset` field in unix seconds | Pattern 5, Pattern 4 | MEDIUM — doc extraction confirmed the getters exist but didn't show the exact `rateLimit.reset` field type. A task should verify with a 1-line `console.log` in an error path or a test with a mocked error object. |
| A3 | BullMQ `UnrecoverableError` still persists the error message on the `failed` listener | Pattern 3, Pitfall 8 | LOW — the error is still passed to `worker.on('failed', (job, err) => ...)`. Confirmed by BullMQ v5 API docs. Pitfall 8 describes the mitigation regardless. |
| A4 | Postgres unique index on `platform_post_id` already exists from Phase 3 | Pattern 6 | HIGH if wrong — idempotency correctness depends on it. **Verified in this research** by reading `packages/db/src/schema/posts.ts` line with `uniqueIndex('posts_platform_post_id')`. No longer assumed. |
| A5 | BullMQ scanner `removeRepeatableByKey` is safe to call during startup if the key already exists | Pattern 8 | LOW — BullMQ `add` with the same repeat options is idempotent (existing repeatable is updated in place). If not, the scanner will double-trigger for one interval cycle at worst. |
| A6 | 30s backoff for transient errors is long enough for Twitter's API to recover from most blips but short enough to avoid user-perceivable delay | Pattern 4 | LOW — CONTEXT.md D-09 locks this. Not a research claim; user decision. |
| A7 | Bull-Board's Express router is compatible with express-session + csrf-csrf | Pattern 9, Pitfall 6 | MEDIUM — the UI uses standard Express forms. First integration task should click through the UI to verify retry/remove buttons work with CSRF. |
| A8 | Running the scanner worker in the same Node process as the publish worker is safe (they share Redis connection but not the processor loop) | Pattern 8, Pattern 10 | LOW — BullMQ is designed for multi-worker-per-process. The only shared state is ioredis connection, which is thread-safe. |
| A9 | `postgres` driver (already installed in api via devDep `~3.4.9`) is the correct driver for the worker's DB access too | Pattern 6 | MEDIUM — worker currently has no DB client. Needs to promote `postgres` to a dep in worker package, create a `@sms/db` adapter factory, and test connection pool sizing. |

**If this table is empty:** this phase's research was fully verified — every pitfall tested against running code.

## Open Questions

1. **Should the `notification` queue be shared across phases or phase-scoped?**
   - What we know: Phase 4 creates it, Phase 9 consumes it. CONTEXT.md D-04 says Phase 4 creates `publish` and `notification`.
   - What's unclear: whether other producers (rate limit warning, future token expiry events) should use the same queue or dedicated subtypes.
   - Recommendation: one `notification` queue with a typed `kind` field in the payload. Phase 9 fans out by `kind` when it lands. Schema: `{ kind: 'publish_failed' | 'rate_limit_warn' | 'rate_limit_blocked', postId?, profileId, correlationId, at }`.

2. **Does the worker package need its own Drizzle `Db` client, or should it share with API via a shared adapter?**
   - What we know: `packages/db` exists, but the worker has no DB connection yet (only Redis).
   - What's unclear: whether to create a `createDb(url)` factory in `@sms/db` to standardize both packages.
   - Recommendation: add `createDb(url: string)` to `@sms/db` that returns a Drizzle instance. Both api and worker call it during startup with `DATABASE_URL`. This matches the factory-with-DI convention from CLAUDE.md.

3. **Should the scanner horizon (90s) be configurable via env var?**
   - What we know: CONTEXT.md specifics call out 60s interval and 90s horizon as tuned values.
   - What's unclear: whether ops might want to tune them.
   - Recommendation: hard-code for Phase 4, leave a TODO comment. Single-user Proxmox deployment doesn't need knobs yet.

4. **How does Phase 4 surface a Twitter profile that has a revoked token to the user?**
   - What we know: Phase 7 introduces TOKEN-04 (revocation detection via 401) and token health badges.
   - What's unclear: what Phase 4 does about it in the interim. A failed publish with `auth_revoked` error code should leave the post in `failed` and emit a notification — but should it also flip the profile's `isHealthy` flag?
   - Recommendation: Phase 4 writes the `failureReason` with a user-readable message pointing to "reconnect the profile." No profile-level health flag until Phase 7. User sees the failure per-post.

5. **Does Bull-Board need its own route-level CSRF exception, or can it share the existing middleware?**
   - What we know: Bull-Board UI sends standard Express form POSTs for retry/remove actions.
   - What's unclear: whether csrf-csrf will accept them without the cookie double-submit flow.
   - Recommendation: first manual test after implementation. If it breaks, add `/admin/queues` to the ignored routes list.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ~4.1.3 (already installed in all packages) |
| Config file | `packages/{api,worker,shared}/vitest.config.ts` (existing from Phase 1-3) |
| Quick run command | `cd packages/worker && npm test -- --run` and `cd packages/api && npm test -- --run` |
| Full suite command | `npm test --workspaces -- --run` from repo root |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WORKER-01 | Worker starts publish + heartbeat + scanner in separate container | integration | `cd packages/worker && npm test -- --run src/__tests__/index.test.ts` | Wave 0 |
| WORKER-02 | `publish` and `notification` queues are created with correct names | unit | `vitest run src/__tests__/queues.test.ts` | Wave 0 |
| WORKER-03 | Scanner picks up posts where status=scheduled AND scheduledAt <= now+90s | unit | `vitest run src/__tests__/scanner.test.ts` | Wave 0 |
| WORKER-04 | Backoff strategy returns 30000, 300000, 1800000 for attempts 1/2/3 | unit | `vitest run src/__tests__/backoff.test.ts` | Wave 0 |
| WORKER-04 | 429 with rateLimit.reset honors the header over the schedule | unit | `vitest run src/__tests__/backoff.test.ts` | Wave 0 |
| WORKER-04 | Permanent errors throw UnrecoverableError | unit | `vitest run src/__tests__/publish-worker.test.ts` | Wave 0 |
| WORKER-05 | Successful publish writes published_at, platform_post_id, last_published_at | integration | `vitest run src/__tests__/post-lifecycle.test.ts` | Wave 0 |
| WORKER-06 | Post with existing platform_post_id is skipped (idempotency) | unit | `vitest run src/__tests__/post-lifecycle.test.ts` | Wave 0 |
| WORKER-06 | post_version mismatch aborts with version_mismatch | unit | `vitest run src/__tests__/post-lifecycle.test.ts` | Wave 0 |
| WORKER-07 | Exhausted retries emit notification queue event | integration | `vitest run src/__tests__/failed-listener.test.ts` | Wave 0 |
| WORKER-08 | Worker.close() completes within 30s; in-flight job is awaited | integration | `vitest run src/__tests__/shutdown.test.ts` (uses real BullMQ + testcontainer Redis) | Wave 0 |
| SCHED-01 | Polling query returns all posts filtered by status/profile/tag | integration | `vitest run src/__tests__/routes/posts.test.ts` | Wave 0 (extend) |
| SCHED-02 | failureReason column returned in list response | integration | `vitest run src/__tests__/routes/posts.test.ts` | Wave 0 (extend) |
| SCHED-03 | POST /api/posts/:id/retry on a failed post resets status, bumps version, enqueues | integration | `vitest run src/__tests__/routes/retry.test.ts` | Wave 0 |
| SCHED-04 | GET /api/posts/:id/history groups attempts by retry cycle | integration | `vitest run src/__tests__/routes/history.test.ts` | Wave 0 |
| LIMIT-01 | PATCH /api/profiles/:id/rate-limit updates budget | integration | `vitest run src/__tests__/routes/rate-limit.test.ts` | Wave 0 |
| LIMIT-02 | Warn threshold hit emits notification event | integration | `vitest run src/__tests__/services/rate-limit.test.ts` | Wave 0 |
| LIMIT-03 | Worker aborts publish when budget exhausted, post stays in scheduled | integration | `vitest run src/__tests__/post-lifecycle.test.ts` (budget_exhausted branch) | Wave 0 |
| LIMIT-04 | POST /api/posts returns 409 when would-exceed | integration | `vitest run src/__tests__/routes/posts.test.ts` | Wave 0 (extend) |
| LIMIT-04 | Pre-flight counts from posts table with correct status filter | unit | `vitest run src/__tests__/services/rate-limit.test.ts` | Wave 0 |
| LIMIT-05 | checkTwitterBudget accepts additionalPostCount > 1 (CSV reuse) | unit | `vitest run src/__tests__/services/rate-limit.test.ts` | Wave 0 |

### Unit vs Integration Boundaries

**Unit tests (mock everything external):**
- `error-classifier.test.ts` — construct fake `ApiResponseError` objects, assert classification
- `backoff.test.ts` — call `buildBackoffStrategy()(attemptsMade, type, err, job)` directly
- `queues.test.ts` — assert `buildPublishJobId(postId, version)` is stable
- `scanner.test.ts` — mock `db.select` and `publishQueue.add`, use fake timers

**Integration tests (real DB, real Redis via testcontainers):**
- `post-lifecycle.test.ts` — spin up a testcontainer Postgres + Redis, run migrations, exercise `publishPost` end-to-end with a mocked Twitter client
- `shutdown.test.ts` — real BullMQ Worker against testcontainer Redis; enqueue a slow job, send shutdown, assert it drains
- Route tests — supertest against the Express app; DB is a testcontainer Postgres

**Mocked at the HTTP boundary with MSW:**
- Twitter API calls — use MSW to return success, 429 with `x-rate-limit-reset`, 401, 403, 422. Tests can assert classification + worker behavior without touching the twitter-api-v2 internals.

### How to test timezone/DST paths deterministically

```typescript
// Mock the clock BEFORE importing the service
import { DateTime, Settings } from 'luxon';

beforeEach(() => {
  // Pin "now" to 2026-03-08T06:00:00Z (1 hour before US DST spring forward)
  Settings.now = () => new Date('2026-03-08T06:00:00Z').getTime();
});

it('startOf("month") returns March 1 00:00 UTC regardless of host TZ', () => {
  const monthStart = DateTime.utc().startOf('month').toJSDate();
  expect(monthStart.toISOString()).toBe('2026-03-01T00:00:00.000Z');
});

it('rate limit window does not shift at DST boundary', () => {
  Settings.now = () => new Date('2026-03-08T07:30:00Z').getTime(); // after spring forward in NY
  const monthStart = DateTime.utc().startOf('month').toJSDate();
  expect(monthStart.toISOString()).toBe('2026-03-01T00:00:00.000Z');
});
```

**Key:** Luxon's `Settings.now` hook lets all `DateTime.utc()` calls resolve deterministically. Combine with `vi.useFakeTimers()` for BullMQ delay tests.

### How to assert idempotency under race conditions

**Test: worker re-entry with existing platform_post_id is a no-op**

```typescript
it('second worker invocation with platform_post_id set short-circuits', async () => {
  // Seed: post row already has platform_post_id = 'tweet-123' from a prior attempt
  const postId = await seedPost(db, { status: 'publishing', platformPostId: 'tweet-123' });
  const twitterSpy = vi.fn();

  await publishPost(db, {
    postId,
    expectedVersion: 1,
    correlationId: 'corr-1',
    callTwitter: twitterSpy,
    checkBudget: async () => ({ wouldExceed: false }),
  }).catch(err => {
    expect(err).toBeInstanceOf(PostLifecycleAbort);
    expect((err as PostLifecycleAbort).reason).toBe('already_published');
  });

  expect(twitterSpy).not.toHaveBeenCalled();
});
```

**Test: concurrent publish attempts → one succeeds, one hits unique index**

```typescript
it('two workers racing the same post — DB unique index prevents double-post', async () => {
  // Use a real testcontainer Postgres for this test
  const postId = await seedPost(db, { status: 'scheduled', platformPostId: null });
  const twitterSpy = vi.fn().mockResolvedValue({ platformPostId: 'tweet-abc' });

  const [a, b] = await Promise.allSettled([
    publishPost(db, { postId, expectedVersion: 1, callTwitter: twitterSpy, checkBudget: okBudget, correlationId: 'a' }),
    publishPost(db, { postId, expectedVersion: 1, callTwitter: twitterSpy, checkBudget: okBudget, correlationId: 'b' }),
  ]);

  const successes = [a, b].filter(r => r.status === 'fulfilled').length;
  expect(successes).toBeGreaterThanOrEqual(1);
  // Only one real Twitter call should have happened (FOR UPDATE serializes the transaction)
  expect(twitterSpy).toHaveBeenCalledTimes(1);
});
```

### How to assert rate limit counter is atomic

The counter is **not** atomic by design (D-21). The test asserts the bounded-error behavior instead:

```typescript
it('counter is consistent with COUNTED_STATUSES at time of query', async () => {
  await seedPosts(db, profileId, [
    { status: 'published', publishedAt: new Date() },
    { status: 'published', publishedAt: new Date() },
    { status: 'destroyed', publishedAt: new Date() },       // counts
    { status: 'auto_destructing', publishedAt: new Date() }, // counts
    { status: 'failed', publishedAt: new Date() },           // does NOT count
    { status: 'scheduled', publishedAt: null },              // does NOT count
  ]);

  const result = await checkTwitterBudget(db, { profileId, additionalPostCount: 0 });
  expect(result.currentCount).toBe(4);
});

it('month boundary excludes last-month posts', async () => {
  Settings.now = () => new Date('2026-04-01T00:00:01Z').getTime();
  await seedPosts(db, profileId, [
    { status: 'published', publishedAt: new Date('2026-03-31T23:59:59Z') }, // excluded
    { status: 'published', publishedAt: new Date('2026-04-01T00:00:00Z') }, // included
  ]);

  const result = await checkTwitterBudget(db, { profileId, additionalPostCount: 0 });
  expect(result.currentCount).toBe(1);
});
```

### Sampling Rate
- **Per task commit:** `cd packages/worker && npm test -- --run` and `cd packages/api && npm test -- --run`
- **Per wave merge:** `npm test --workspaces -- --run` (whole monorepo)
- **Phase gate:** All tests green + manual Bull-Board click-through + an end-to-end scheduled post that actually publishes to a test Twitter account before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/worker/src/__tests__/helpers/testcontainer.ts` — shared Redis testcontainer helper for integration tests
- [ ] `packages/worker/src/__tests__/helpers/mock-twitter.ts` — MSW handlers returning success/429/401/403/422/500 scenarios
- [ ] `packages/worker/src/__tests__/helpers/seed-post.ts` — DB seed helper for posts in various states
- [ ] `packages/api/src/__tests__/helpers/msw-twitter.ts` — MSW handlers shared with the twitter-publish.service tests
- [ ] `packages/worker/vitest.config.ts` — confirm test file inclusion patterns cover new `*.test.ts` files
- [ ] `packages/api/src/__tests__/helpers/test-db.ts` — testcontainer Postgres factory if not already present from Phase 3
- [ ] Dependency install: `pnpm --filter @sms/api add bullmq~5.73.0 luxon~3.7.2 @bull-board/api~6.21.0 @bull-board/express~6.21.0`
- [ ] Dependency install: `pnpm --filter @sms/worker add luxon~3.7.2 twitter-api-v2~1.29.0 drizzle-orm~0.45.2 postgres~3.4.9`
- [ ] testcontainers dev dep: `pnpm --filter @sms/worker add -D testcontainers@^10`
- [ ] MSW dev dep: `pnpm --filter @sms/worker add -D msw@^2` (Phase 3 may already have it in api)

**Framework install:** Vitest is already installed. No framework gap.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Phase 2 owns user auth; Phase 4 only reuses `requireAuth` middleware for new routes and Bull-Board |
| V3 Session Management | yes | `requireAuth` on all new routes (`POST /api/posts/:id/retry`, `GET /api/posts/:id/history`, `GET|PATCH /api/profiles/:id/rate-limit`, `/admin/queues/*`) — reuses existing express-session + connect-redis |
| V4 Access Control | yes | All routes verify ownership: `WHERE posts.user_id = ?` / `WHERE social_profiles.user_id = ?` before action. Single-user app reduces risk but the check is still required per defense-in-depth. |
| V5 Input Validation | yes | Zod schemas for all request bodies: `rate-limit.schema.ts` (budget 1-10000, warnThresholdPercent 1-99), UUID param validation via existing `validateUuidParam` helper |
| V6 Cryptography | yes | Token decryption uses existing `decrypt()` from `@sms/shared/encryption` (AES-256-GCM). Tokens must be decrypted in-memory, passed to twitter-api-v2, and dereferenced — NEVER logged, cached, or placed in job payload. Job payload holds only `postId + postVersion + correlationId`. |
| V7 Error Handling & Logging | yes | Pino logger with `correlationId` child binding. Redact list already covers Authorization/Cookie headers. New concern: ensure `failureReason` column contains no token fragments (classifier's `twitterDetail` comes from Twitter's error body, which does not echo the user's token). |
| V9 Communications | yes | nginx TLS termination from Phase 1 still applies. `/admin/queues` must NOT be exposed outside nginx. |
| V10 Malicious Code | no | No code uploads in this phase |
| V14 Configuration | yes | New env vars: none (Phase 1's are reused). New columns on `social_profiles` must have safe defaults in migration. |

### Known Threat Patterns for Node.js + BullMQ + Twitter

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token exfiltration via logs | Information Disclosure | Pino redact list + unit test that asserts decrypted token value never appears in any log call during a publish |
| Token in job payload via Redis | Information Disclosure | Job payload contains only `postId` — enforced by `PublishJobPayload` type and test that asserts payload shape after enqueue |
| CSRF on new state-changing routes | Tampering | Existing csrf-csrf middleware covers POST /api/posts/:id/retry and PATCH /api/profiles/:id/rate-limit |
| Cross-user access via ID guessing | Elevation of Privilege | All new queries include `AND user_id = ?` / `AND posts.user_id = ?` — verified in route integration tests |
| Timing attack on user_id check in retry endpoint | Information Disclosure | Low concern in single-user app, but still use the standard "check ownership, return 404 on mismatch" pattern |
| BullMQ UI exposed without auth | Elevation of Privilege | `requireAuth` middleware mounted before Bull-Board router; verified by supertest that unauthenticated requests return 401 |
| Twitter API error body echoes user input | XSS via failureReason display | Frontend already sanitizes text; `failureReason` is treated as plain text in the UI |
| Race between worker publish and user delete | Tampering | State machine: `DELETE` not allowed on posts in `publishing` state (STATE-02 from Phase 3 already enforces this) |
| Replay of stalled job via Redis memory inspection | Tampering | `removeOnComplete: { count: 100 }` keeps only recent success metadata; no tokens in job data |

## Sources

### Primary (HIGH confidence)
- `https://docs.bullmq.io/guide/jobs/delayed` — delay option API
- `https://docs.bullmq.io/guide/retrying-failing-jobs` — attempts, backoff, custom backoffStrategy signature
- `https://docs.bullmq.io/guide/jobs/job-ids` — custom jobId dedup semantics
- `https://docs.bullmq.io/guide/jobs/repeatable` — `repeat.every` interval
- `https://api.docs.bullmq.io/interfaces/v5.WorkerOptions.html` — default values for lockDuration (30000), stalledInterval (30000), maxStalledCount (1), concurrency (1)
- `https://api.docs.bullmq.io/classes/v5.UnrecoverableError.html` — skip retries
- `https://docs.bullmq.io/guide/workers/graceful-shutdown` — `worker.close()` pattern
- `https://github.com/PLhery/node-twitter-api-v2` — ApiResponseError structure, rateLimitError/isAuthError getters
- `https://github.com/felixmosh/bull-board` — @bull-board/express + @bull-board/api integration
- npm registry (`npm view`) — version confirmation for bullmq 5.73.3, luxon 3.7.2, @bull-board/api 6.21.0, @bull-board/express 6.21.0, twitter-api-v2 1.29.0, ioredis 5.10.1 (all verified 2026-04-09)
- Repo files: `packages/db/src/schema/posts.ts` (confirms `posts_platform_post_id` unique index exists), `packages/shared/src/constants/post-states.ts` (confirms `transitionPost` helper is the canonical state machine), `packages/api/src/__tests__/services/twitter.test.ts` (confirms twitter-api-v2 OAuth 1.0a error shape patterns)

### Secondary (MEDIUM confidence)
- Luxon `DateTime.utc().startOf('month')` semantics — extracted from official docs but not tested in our code yet
- BullMQ `maxRetriesPerRequest: null` requirement on ioredis — well-known community gotcha, referenced in BullMQ connections doc

### Tertiary (LOW confidence)
- `BullMQAdapter` path as `@bull-board/api/bullMQAdapter` — extracted from GitHub tree file listing; should be verified by first `tsc` compile in the implementation task (A1)
- Exact fields on twitter-api-v2 `rateLimit.reset` — doc says it exists, but unit type not verified against a live response (A2)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry 2026-04-09, installed packages cross-checked against package.json
- Architecture: HIGH — all patterns grounded in library docs (Context7-equivalent docs fetches), cross-referenced with CONTEXT.md decisions, existing codebase patterns reviewed
- Pitfalls: HIGH — every pitfall ties to a specific library API behavior or existing code constraint. Pitfall 1 (ioredis maxRetriesPerRequest), 3 (idempotency layering), 4 (backoffStrategy placement) are the highest-risk and have concrete mitigations
- Testing strategy: HIGH — unit boundaries, integration boundaries, and deterministic timezone testing all verifiable with installed tools
- Security: MEDIUM — single-user app means some ASVS controls are over-engineered; the concrete controls (ownership checks, token-never-in-payload, requireAuth on admin) are HIGH confidence

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable BullMQ 5.x, stable twitter-api-v2 1.x — 30-day freshness)
