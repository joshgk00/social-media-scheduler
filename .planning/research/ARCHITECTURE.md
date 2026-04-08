# Architecture Research

**Domain:** Self-hosted social media scheduling tool
**Researched:** 2026-04-07
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          nginx (TLS termination)                     │
│                    :443 → web :3000 | OAuth callbacks                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────┐    ┌──────────────────────────┐     │
│  │        Web Service          │    │     Worker Service        │     │
│  │  ┌───────────┐ ┌─────────┐ │    │  ┌────────────────────┐  │     │
│  │  │ Vite/React│ │ Express │ │    │  │  BullMQ Workers    │  │     │
│  │  │   SPA     │ │  API    │ │    │  │  - publish         │  │     │
│  │  │  :5173    │ │  :3000  │ │    │  │  - transcode       │  │     │
│  │  └───────────┘ └────┬────┘ │    │  │  - token-refresh   │  │     │
│  │                     │      │    │  │  - auto-destruct   │  │     │
│  │                     │      │    │  │  - cleanup         │  │     │
│  └─────────────────────┼──────┘    │  └─────────┬──────────┘  │     │
│                        │           │            │              │     │
├────────────────────────┼───────────┼────────────┼──────────────┤     │
│                        │           │            │              │     │
│  ┌─────────────────────▼───────────▼────────────▽──────────┐  │     │
│  │                      Redis :6379                         │  │     │
│  │   BullMQ queues | Session store | Rate limit counters    │  │     │
│  └──────────────────────────────────────────────────────────┘  │     │
│                                                                │     │
│  ┌──────────────────────────────────────────────────────────┐  │     │
│  │                   PostgreSQL :5432                        │  │     │
│  │   Users | Profiles | Posts | Queues | Media | Logs       │  │     │
│  └──────────────────────────────────────────────────────────┘  │     │
│                                                                │     │
│  ┌──────────────────────────────────────────────────────────┐  │     │
│  │              Docker Volume (media storage)               │  │     │
│  │   /data/media/{profile_id}/{year}/{month}/{uuid}.ext     │  │     │
│  └──────────────────────────────────────────────────────────┘  │     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **nginx** | TLS termination, reverse proxy, static asset caching, OAuth callback routing | nginx container with Let's Encrypt or Cloudflare Tunnel |
| **Web Service (Express API)** | REST API, authentication, session management, CSRF, request validation, job enqueueing | Express + TypeScript, serves API routes at `/api/*` |
| **Web Service (React SPA)** | Post creation forms, queue management UI, calendar view, settings | Vite + React, served as static files (built into web container or via nginx) |
| **Worker Service** | Job processing: publish posts, transcode video, refresh tokens, auto-destruct, media cleanup | Standalone Node.js process running BullMQ workers |
| **Redis** | Job queue broker, session store, rate limit counters, worker heartbeat | Redis 7.x with RDB persistence |
| **PostgreSQL** | Primary data store: users, profiles, posts, queues, tags, media metadata, publish logs | PostgreSQL 16 with Drizzle ORM |
| **Docker Volume** | Persistent media file storage (images, video, thumbnails) | Host-mounted volume on Proxmox |

## Recommended Project Structure

```
social-media-scheduler/
├── packages/
│   ├── shared/                    # Shared types, constants, utilities
│   │   ├── src/
│   │   │   ├── types/             # TypeScript interfaces shared between web + worker
│   │   │   │   ├── post.ts        # Post, PostStatus, PostType
│   │   │   │   ├── queue.ts       # Queue, QueueConfig, ScheduleConfig
│   │   │   │   ├── profile.ts     # SocialProfile, Network, TokenStatus
│   │   │   │   └── jobs.ts        # Job payload types for BullMQ
│   │   │   ├── constants/         # Post states, rate limits, platform constraints
│   │   │   ├── validation/        # Zod schemas shared between API + frontend
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── db/                        # Database schema + migrations (Drizzle)
│   │   ├── src/
│   │   │   ├── schema/            # Drizzle table definitions
│   │   │   │   ├── users.ts
│   │   │   │   ├── profiles.ts
│   │   │   │   ├── posts.ts
│   │   │   │   ├── queues.ts
│   │   │   │   ├── media.ts
│   │   │   │   ├── tags.ts
│   │   │   │   ├── notifications.ts
│   │   │   │   ├── webhooks.ts
│   │   │   │   └── index.ts
│   │   │   ├── migrate.ts         # Migration runner (called on startup)
│   │   │   └── client.ts          # Drizzle client factory
│   │   ├── drizzle/               # Generated SQL migration files
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── api/                       # Express API server
│   │   ├── src/
│   │   │   ├── modules/           # Feature-based modules
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   └── auth.middleware.ts
│   │   │   │   ├── profiles/
│   │   │   │   │   ├── profiles.routes.ts
│   │   │   │   │   ├── profiles.service.ts
│   │   │   │   │   └── platforms/
│   │   │   │   │       ├── twitter.client.ts
│   │   │   │   │       ├── facebook.client.ts
│   │   │   │   │       └── linkedin.client.ts
│   │   │   │   ├── posts/
│   │   │   │   │   ├── posts.routes.ts
│   │   │   │   │   ├── posts.service.ts
│   │   │   │   │   └── spin.service.ts
│   │   │   │   ├── queues/
│   │   │   │   │   ├── queues.routes.ts
│   │   │   │   │   └── queues.service.ts
│   │   │   │   ├── media/
│   │   │   │   │   ├── media.routes.ts
│   │   │   │   │   ├── media.service.ts
│   │   │   │   │   └── storage.adapter.ts
│   │   │   │   ├── tags/
│   │   │   │   ├── webhooks/
│   │   │   │   ├── notifications/
│   │   │   │   └── settings/
│   │   │   ├── middleware/         # Express middleware
│   │   │   │   ├── csrf.ts
│   │   │   │   ├── session.ts
│   │   │   │   ├── error-handler.ts
│   │   │   │   └── correlation-id.ts
│   │   │   ├── lib/               # Cross-cutting concerns
│   │   │   │   ├── encryption.ts  # AES-256-GCM token encrypt/decrypt
│   │   │   │   ├── logger.ts      # Structured JSON logger
│   │   │   │   └── queue.ts       # BullMQ queue producer (adds jobs)
│   │   │   ├── health.ts          # /health endpoint
│   │   │   └── app.ts             # Express app factory
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── worker/                    # BullMQ worker process
│   │   ├── src/
│   │   │   ├── workers/           # One file per job type
│   │   │   │   ├── publish.worker.ts
│   │   │   │   ├── transcode.worker.ts
│   │   │   │   ├── token-refresh.worker.ts
│   │   │   │   ├── auto-destruct.worker.ts
│   │   │   │   ├── media-cleanup.worker.ts
│   │   │   │   └── queue-scheduler.worker.ts
│   │   │   ├── publishers/        # Platform-specific publish logic
│   │   │   │   ├── twitter.publisher.ts
│   │   │   │   ├── facebook.publisher.ts
│   │   │   │   └── linkedin.publisher.ts
│   │   │   ├── lib/
│   │   │   │   ├── heartbeat.ts   # Worker heartbeat to Redis
│   │   │   │   └── idempotency.ts # platform_post_id dedup check
│   │   │   └── main.ts            # Worker entrypoint
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                       # React SPA (Vite)
│       ├── src/
│       │   ├── pages/             # Route-level components
│       │   ├── components/        # Reusable UI components
│       │   ├── hooks/             # Custom React hooks
│       │   ├── api/               # API client (fetch wrappers)
│       │   ├── stores/            # Client state (Zustand or similar)
│       │   └── main.tsx
│       ├── index.html
│       ├── vite.config.ts
│       ├── package.json
│       └── tsconfig.json
│
├── docker/
│   ├── Dockerfile.web             # Builds API + serves SPA static files
│   ├── Dockerfile.worker          # Builds worker process
│   └── nginx.conf                 # nginx reverse proxy config
├── docker-compose.yml
├── docker-compose.dev.yml
├── pnpm-workspace.yaml
├── package.json                   # Root scripts, shared devDeps
└── tsconfig.base.json             # Shared TS config
```

### Structure Rationale

- **`packages/shared/`:** Both the API and worker need the same TypeScript types for post states, job payloads, and validation schemas. Keeping these in a shared package avoids drift and duplication. Zod schemas here enable runtime validation on both sides.
- **`packages/db/`:** Isolating the database schema and migrations means both the API and worker import the same Drizzle client and table definitions. Migrations live here, versioned and tracked. Neither the API nor worker owns the schema -- they both consume it.
- **`packages/api/`:** Feature-based modules (not layer-based). Each feature folder contains its routes, service logic, and any platform-specific clients. This keeps related code together and makes it straightforward to find where a feature lives. The `lib/` folder holds cross-cutting concerns (encryption, logging, queue producers).
- **`packages/worker/`:** Completely separate Node.js process. No Express, no HTTP. Just BullMQ workers consuming jobs. Each worker file handles one job type. Publishers contain the actual platform API call logic.
- **`packages/web/`:** Standard Vite + React SPA. Pages map to routes. Components are reusable. API client wraps fetch calls. No SSR needed for a self-hosted personal tool.

## Architectural Patterns

### Pattern 1: Producer-Consumer via BullMQ

**What:** The API service (producer) enqueues jobs into Redis-backed BullMQ queues. The worker service (consumer) picks up and processes jobs independently.

**When to use:** Any operation that shouldn't block the HTTP response: publishing posts, transcoding video, refreshing tokens, sending notifications, running bulk operations.

**Trade-offs:**
- Pro: Web requests return fast. Worker crashes don't take down the API. Jobs survive restarts (Redis persistence).
- Con: Adds Redis as a dependency. Debugging job failures requires checking worker logs, not just API logs. Need correlation IDs to trace a request from API through to worker.

**Example:**
```typescript
// API side: enqueue a publish job
import { Queue } from 'bullmq';
import type { PublishJobData } from '@app/shared';

const publishQueue = new Queue('publish', { connection: redisConnection });

await publishQueue.add('publish-post', {
  postId: post.id,
  postVersion: post.postVersion,
  profileId: post.profileId,
  correlationId: req.correlationId,
} satisfies PublishJobData, {
  delay: scheduledAt.getTime() - Date.now(),
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: false,
});
```

```typescript
// Worker side: process the publish job
import { Worker } from 'bullmq';
import type { PublishJobData } from '@app/shared';

const publishWorker = new Worker('publish', async (job) => {
  const data = job.data as PublishJobData;

  // Idempotency check
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, data.postId),
  });
  if (post.platformPostId) return; // Already published

  // Optimistic lock check
  if (post.postVersion !== data.postVersion) {
    throw new Error('Post was edited since job was created');
  }

  // Decrypt token, publish, record result
  const token = decrypt(profile.oauthTokens);
  const platformId = await publishers[profile.network].publish(post, token);
  await db.update(posts).set({
    status: 'published',
    platformPostId: platformId,
    publishedAt: new Date(),
  }).where(eq(posts.id, post.id));
}, { connection: redisConnection, concurrency: 5 });
```

### Pattern 2: Named Queues by Job Type

**What:** Use separate BullMQ queues for each job category rather than one monolithic queue. Each queue has its own worker with appropriate concurrency settings.

**When to use:** Always. Different job types have different performance characteristics, retry strategies, and concurrency needs.

**Trade-offs:**
- Pro: Video transcoding (CPU-heavy, concurrency: 1) doesn't block post publishing (I/O-bound, concurrency: 5). Easier to monitor and debug per-queue.
- Con: More queues to manage. Slightly more setup code.

**Recommended queues:**

| Queue Name | Purpose | Concurrency | Retry Strategy |
|------------|---------|-------------|----------------|
| `publish` | Publish posts to social platforms | 5 | 3 attempts, exponential backoff (5s base) |
| `transcode` | Video transcoding via ffmpeg | 1 | 2 attempts, fixed 30s delay |
| `token-refresh` | OAuth token refresh checks | 2 | 3 attempts, exponential backoff |
| `auto-destruct` | Delete published posts after timer | 3 | 3 attempts, exponential backoff |
| `media-cleanup` | Delete soft-deleted media files | 1 | 1 attempt |
| `notification` | Send email notifications via SMTP | 2 | 3 attempts, exponential backoff |
| `bulk` | CSV import, bulk text modify, dedup | 1 | 1 attempt |

### Pattern 3: Optimistic Locking for Publish Safety

**What:** Store a `post_version` integer on each post. Increment on every update. The worker reads the version when picking up a job and verifies it hasn't changed before making the platform API call.

**When to use:** Whenever a background process acts on data that a user might concurrently modify.

**Trade-offs:**
- Pro: Prevents publishing stale content. Simple to implement. No database-level locks needed.
- Con: Requires re-queuing the job if the version changed (the worker aborts and the post will be picked up on its next scheduled run with the correct version).

**Example:**
```typescript
// Before publishing, verify version hasn't changed
const result = await db.update(posts)
  .set({ status: 'publishing' })
  .where(and(
    eq(posts.id, postId),
    eq(posts.postVersion, expectedVersion)
  ))
  .returning();

if (result.length === 0) {
  // Version changed -- post was edited. Abort publish.
  throw new UnrecoverableError('Post version mismatch, aborting publish');
}
```

### Pattern 4: Encryption Service for Token Storage

**What:** All OAuth tokens are encrypted at rest using AES-256-GCM. The encryption key lives in an environment variable. Tokens are decrypted in-memory only during the API call window, then discarded. Never cached in Redis.

**When to use:** Every read/write of OAuth credentials.

**Trade-offs:**
- Pro: Compromised database backup doesn't expose credentials. Key rotation is possible via versioned encryption.
- Con: Every publish requires a decrypt operation (minimal overhead). Lost encryption key means re-authenticating all profiles.

**Example:**
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted: encrypted.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64') };
}

function decrypt(payload: EncryptedPayload, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return decipher.update(Buffer.from(payload.encrypted, 'base64')) + decipher.final('utf8');
}
```

## Data Flow

### Post Creation and Publishing Flow

```
User creates post in React SPA
    |
    v
POST /api/posts  (Express API)
    |
    ├─ Validate input (Zod schema from @app/shared)
    ├─ Check rate limits (Twitter 500/mo pre-flight)
    ├─ Store post in PostgreSQL (status: 'scheduled', post_version: 1)
    ├─ If media attached: upload to Docker volume, create MediaFile record
    │   └─ If video: enqueue 'transcode' job → Worker transcodes via ffmpeg
    ├─ Enqueue 'publish' job to BullMQ with delay = scheduledAt - now
    └─ Return 201 with post data
         |
         v (at scheduled time)
    Worker picks up 'publish' job from Redis
         |
         ├─ Load post from PostgreSQL
         ├─ Check idempotency: platform_post_id already set? → skip
         ├─ Check optimistic lock: post_version matches? → proceed
         ├─ Check media ready: all transcode_status = 'completed'? → proceed
         ├─ SET status = 'publishing' (conditional on version)
         ├─ Decrypt OAuth token from profile
         ├─ Resolve spinnable text: {opt1|opt2} → pick random
         ├─ Call platform API (Twitter/Facebook/LinkedIn)
         ├─ On success:
         │   ├─ SET status = 'published', platform_post_id, published_at
         │   ├─ Record PublishLog entry (success)
         │   ├─ If auto-destruct configured: enqueue 'auto-destruct' job with delay
         │   └─ Discard decrypted token from memory
         └─ On failure (after 3 retries):
             ├─ SET status = 'failed'
             ├─ Record PublishLog entry (failure + error)
             ├─ Enqueue notification job (email + in-app)
             └─ Move to BullMQ dead letter queue
```

### Queue Scheduling Flow

```
Queue schedule fires (repeatable BullMQ job, timezone-aware cron)
    |
    v
Worker: 'queue-scheduler' job
    |
    ├─ Load queue config from PostgreSQL
    ├─ Check: current time within day-of-week window? hour window? seasonal window?
    │   └─ No → skip, return
    ├─ Check: profile token valid?
    │   └─ No → log error, send notification, return
    ├─ Select next QueuePost (by position, status = 'active')
    │   └─ None available → send 'queue empty' notification, return
    ├─ Create a Post record from QueuePost content (status: 'queued')
    ├─ Enqueue 'publish' job (no delay -- publish immediately)
    ├─ If recycle enabled: move QueuePost to end of queue (max position + 1)
    │   Else: mark QueuePost as consumed
    └─ Update queue: last_published_at, next_run_at
```

### OAuth Token Lifecycle Flow

```
Daily cron job (BullMQ repeatable, runs once/day)
    |
    v
Worker: 'token-refresh' job
    |
    ├─ Load all profiles from PostgreSQL
    ├─ For each profile:
    │   ├─ Twitter: tokens don't expire. Check by making a test API call.
    │   │   └─ 401 → flag as 'expired', send notification
    │   ├─ Facebook: check token_expires_at
    │   │   ├─ >7 days out → status: 'valid' (green)
    │   │   ├─ <=7 days out → attempt auto-refresh via Graph API
    │   │   │   ├─ Success → update token, reset expiry, status: 'valid'
    │   │   │   └─ Failure → status: 'expiring', send notification
    │   │   └─ Expired → status: 'expired', send notification
    │   └─ LinkedIn: same as Facebook with LinkedIn refresh endpoint
    └─ Update profile token_status in PostgreSQL
```

### Key Data Flows

1. **Request → Job → Result:** API validates and stores data, enqueues a job, returns immediately. Worker processes the job asynchronously. Results are written to PostgreSQL and surfaced on the next UI poll or page load.
2. **Correlation chain:** Every HTTP request gets a UUID correlation ID (middleware). This ID is passed into BullMQ job data. Worker logs include it. This makes tracing a user action through API → queue → worker → platform API call possible from logs alone.
3. **Token flow:** Encrypted tokens live in PostgreSQL. They travel from PostgreSQL → worker memory (decrypted) → platform API call → discarded. They never touch Redis, never appear in logs, never leave the worker process memory except as ciphertext.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user, <10 profiles | Current architecture is heavily overkill. Single-user, local network. No changes needed. |
| 1 user, 50+ profiles | Increase worker concurrency. Possibly run 2 worker containers. Stagger queue schedules to avoid burst. |
| Multiple users (out of scope) | Would need: auth rework, per-user queues, tenant isolation, connection pooling. Not building this. |

### Scaling Priorities

1. **First bottleneck:** Worker publish throughput. If many queues fire at the same minute, the worker needs enough concurrency to handle the burst. Solution: increase concurrency on the publish worker, or run multiple worker replicas (BullMQ supports this natively -- all workers compete for the same Redis queue).
2. **Second bottleneck:** Platform rate limits, not system resources. Twitter's 500/mo limit will hit before any infrastructure limit. The pre-flight check and rate limit tracking address this at the application layer.

## Anti-Patterns

### Anti-Pattern 1: Cron Inside the Web Container

**What people do:** Run `node-cron` or `setInterval` inside the Express process to check for posts to publish.
**Why it's wrong:** If the web container restarts, scheduled checks are lost. If multiple web containers run (unlikely here, but still), duplicate publishes occur. No retry semantics, no dead letter queue, no stalled job detection.
**Do this instead:** Separate worker process with BullMQ. The PRD specifies this, and for good reason.

### Anti-Pattern 2: Storing Decrypted Tokens in Redis

**What people do:** Cache decrypted OAuth tokens in Redis to avoid repeated decryption overhead.
**Why it's wrong:** Redis is not encrypted at rest by default. A Redis dump or MONITOR command exposes all tokens. Violates the security architecture.
**Do this instead:** Decrypt from PostgreSQL on every use. The overhead of AES-256-GCM decryption is microseconds -- irrelevant compared to the HTTP round-trip to the platform API.

### Anti-Pattern 3: Single Monolithic Queue

**What people do:** Put all job types (publish, transcode, notify, cleanup) into one BullMQ queue.
**Why it's wrong:** A slow ffmpeg transcode job blocks the entire queue. You can't set different concurrency or retry strategies per job type. Monitoring becomes harder.
**Do this instead:** Named queues per job type (see Pattern 2 above).

### Anti-Pattern 4: Polling PostgreSQL for Due Posts

**What people do:** Run a loop every N seconds that queries PostgreSQL for posts where `scheduled_at <= NOW()`.
**Why it's wrong:** Wasteful polling. Race conditions if multiple workers poll simultaneously. No built-in retry or delay semantics. Harder to handle exactly-once delivery.
**Do this instead:** Enqueue a delayed BullMQ job at the time the post is created. The job fires at the right time with BullMQ handling the delay internally via Redis sorted sets.

### Anti-Pattern 5: Shared Mutable State Between API and Worker

**What people do:** Import the same in-memory singleton (rate limiter, cache, config) in both the API and worker, assuming they share memory.
**Why it's wrong:** They're separate Docker containers with separate processes. In-memory state is not shared.
**Do this instead:** Use Redis for any state that must be shared between API and worker (rate limit counters, worker heartbeat, session data). Use PostgreSQL for persistent shared state (posts, profiles, queue configs).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Twitter/X API v2 | OAuth 1.1, REST calls from worker | User supplies own Developer App creds. Free tier: 500 tweets/mo. Tokens don't expire but can be revoked. |
| Facebook Graph API | OAuth 2.0, REST calls from worker | Pages only. Short-lived tokens exchanged for long-lived (~60 days). Auto-refresh 7 days before expiry. Rate limit: 200 calls/user/hour. |
| LinkedIn API v2 | OAuth 2.0, REST calls from worker | Personal + Company Page. Tokens expire 60 days. Refresh tokens last 365 days. Daily API call limits. |
| OpenAI API | REST call from API server (synchronous) | User passes API key per-request. Never stored. Used for AI post generation. |
| SMTP server | Email from worker/API via nodemailer | Configured via env vars. Used for failure notifications, token expiry alerts. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| API ↔ Worker | BullMQ (Redis-backed queues) | API adds jobs, worker consumes. No direct HTTP calls between them. |
| API ↔ PostgreSQL | Drizzle ORM queries | All data reads/writes go through the `@app/db` package. |
| Worker ↔ PostgreSQL | Drizzle ORM queries | Worker reads posts, profiles, queues. Writes status updates, publish logs. |
| API ↔ Redis | ioredis (via BullMQ + express-session) | Session store, rate limit counters, job enqueuing. |
| Worker ↔ Redis | ioredis (via BullMQ) | Job consumption, heartbeat writes. |
| React SPA ↔ API | HTTP REST (JSON) | All data flows through `/api/*` endpoints. No direct DB access from frontend. |
| nginx ↔ API | HTTP reverse proxy | nginx forwards `/api/*` to Express, serves SPA static files directly. |

## Database Migration Strategy

**Use Drizzle ORM with drizzle-kit for migrations.** The schema is defined in TypeScript in `packages/db/src/schema/`, and `drizzle-kit generate` produces SQL migration files in `packages/db/drizzle/`.

**Why Drizzle over Prisma:** Smaller runtime (no engine binary), faster cold starts, TypeScript-native schema definitions (no separate .prisma language), SQL-transparent queries. For a single-user self-hosted app, Drizzle's leaner footprint is a better fit than Prisma's heavier toolchain.

**Migration execution strategy:**
1. `drizzle-kit generate` during development to produce SQL files
2. SQL files committed to version control alongside schema changes
3. On container startup, the web service runs `migrate()` from Drizzle before accepting HTTP traffic
4. Use PostgreSQL advisory locks (`pg_advisory_lock`) to prevent concurrent migration execution if both web and worker start simultaneously

```typescript
// packages/db/src/migrate.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export async function runMigrations() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Advisory lock to prevent concurrent migrations
  const client = await pool.connect();
  await client.query('SELECT pg_advisory_lock(1)');

  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: './drizzle' });
  } finally {
    await client.query('SELECT pg_advisory_unlock(1)');
    client.release();
    await pool.end();
  }
}
```

**Migration ordering:** Run migrations from the web service entrypoint only. The worker should wait for migrations to complete before starting (use a Docker Compose healthcheck or a startup probe that checks for the migration lock).

## Build Order Recommendations

The component dependencies dictate a natural build order:

```
Phase 1: Foundation
    packages/shared  →  packages/db  →  packages/api (skeleton)  →  Docker Compose infra
    (types + schemas)  (schema + migrations)  (Express + health endpoint)  (PG, Redis, nginx)

Phase 2: Core Scheduling
    Auth module  →  Profile management (Twitter)  →  Post CRUD  →  Worker (publish)
    (session, CSRF)  (OAuth, encryption)            (create, list)  (BullMQ consumer)

Phase 3: Queue Engine
    Queue CRUD  →  Queue scheduler worker  →  Recycle logic  →  Bulk operations

Phase 4: Media + Polish
    Media upload  →  Transcode worker  →  Post preview  →  Calendar view

Phase 5: Additional Platforms
    Facebook integration  →  LinkedIn integration  →  Rate limit tracking

Phase 6: Advanced Features
    Notifications  →  Webhooks  →  AI generation  →  Search
```

Each phase produces a working, deployable system. Phase 1 gives you a running Docker stack with a health endpoint. Phase 2 gives you the ability to schedule and publish a tweet. Phase 3 adds the queue automation engine. This ordering means you can validate the most complex piece (the scheduling engine + BullMQ worker) early, before investing in additional platforms.

## Sources

- [BullMQ Official Documentation](https://docs.bullmq.io/)
- [BullMQ Workers Guide](https://docs.bullmq.io/guide/workers)
- [BullMQ Stalled Jobs](https://docs.bullmq.io/guide/workers/stalled-jobs)
- [BullMQ Sandboxed Processors](https://docs.bullmq.io/guide/workers/sandboxed-processors)
- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle ORM PostgreSQL Setup](https://orm.drizzle.team/docs/get-started/postgresql-new)
- [Drizzle vs Prisma Comparison (Bytebase)](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [Drizzle vs Prisma Comparison (MakerKit)](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)
- [Postiz Architecture (GitHub)](https://github.com/gitroomhq/postiz-app)
- [Bulletproof Node.js Project Architecture](https://softwareontheroad.com/ideal-nodejs-project-structure)
- [Express Modular vs Layered Architecture (Medium)](https://medium.com/@branimir.ilic93/express-js-best-practices-modular-vs-layered-approach-for-medium-and-large-appsintroduction-626e61cc908d)
- [pnpm Workspaces Monorepo Guide (Wisp CMS)](https://www.wisp.blog/blog/how-to-bootstrap-a-monorepo-with-pnpm-a-complete-guide)

---
*Architecture research for: Self-hosted social media scheduler*
*Researched: 2026-04-07*
