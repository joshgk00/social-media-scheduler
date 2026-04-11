# Phase 5: Queue Engine - Research

**Researched:** 2026-04-10
**Domain:** BullMQ job scheduling, timezone-aware cron, queue CRUD, auto-destruct worker, spinnable text parsing
**Confidence:** HIGH

## Summary

Phase 5 adds the queue engine -- persistent post queues that publish on recurring schedules with timezone-aware timing, post recycling, and auto-destruct. The phase touches all five packages: new `queues` table and `queue_id`/`queue_position` columns on `posts` (db), queue CRUD routes and scheduling service (api), auto-destruct worker and queue scanner (worker), Zod schemas and queue constants (shared), and queue list/detail/post-list pages (web).

The existing Phase 4 infrastructure provides a solid foundation: the scanner pattern, the three-phase publish lifecycle, the worker bootstrap with graceful shutdown, and the post state machine all have clear extension points for Phase 5. BullMQ 5.73.0 already installed supports `upsertJobScheduler` with `tz` and `pattern` options for DST-safe cron, and delayed jobs for auto-destruct timers. The `twitter-api-v2` 1.29.0 library already installed provides `client.v2.deleteTweet(tweetId)` for the auto-destruct delete call.

**Primary recommendation:** Extend the existing 60s scanner pattern with a second scan pass for queue evaluation rather than using per-queue BullMQ Job Schedulers. The scanner approach keeps scheduling logic centralized, testable with fake timers, and consistent with Phase 4's architecture. Use BullMQ delayed jobs for auto-destruct timers (delay = remaining time from `published_at`), mirroring the publish job pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Hour windows use individual hour slot checkboxes (6am through 11pm). Multi-select -- user checks exactly which hours they want posts going out.
- **D-02:** Two interval types: **fixed** (clock-aligned) and **variable** (since-last-publish). Both respect hour windows and day-of-week constraints.
- **D-03:** Seasonal window is a date range restriction with optional annual repeat. Queue auto-pauses outside the window.
- **D-04:** Recycling is per-queue toggle, off by default. Published posts move to bottom of queue; cursor wraps to position 1.
- **D-05:** Spinnable text resolves a new random variant each publish, including on recycles.
- **D-06:** Recycling and auto-destruct are independent concerns.
- **D-07:** Queue tracks progression via position-based cursor.
- **D-08:** One queue per post (via `queue_id` FK). No many-to-many.
- **D-09:** Queue posts created directly from queue's post list view using existing post creation form.
- **D-10:** Queue post form = scheduled post form with fewer scheduling fields. No date/time picker, no "publish now". Button reads "Save to Queue".
- **D-11:** Queue posts appear in both `/posts` list (filterable by status=queued) and queue's dedicated post list.
- **D-12:** Auto-destruct uses 3 retries with exponential backoff. Persistent failures stay in `auto_destructing` with error flag.
- **D-13:** Platform 404 (post already manually deleted) treated as success. Transition to `destroyed`.
- **D-14:** Auto-destruct timer counts from `published_at`, not enqueue time. Delay = autoDestructAfter - (now - publishedAt).

### Claude's Discretion
- Queue scheduling engine architecture (scanner extension vs. per-queue repeatable jobs)
- `queues` table schema design
- Queue position storage (explicit integer column vs. linked list)
- Auto-destruct scanner discovery pattern
- Spinnable text parser implementation
- "View spinnable variants" modal layout
- Queue list/detail page layouts
- Queue detail/edit page schedule builder form
- BullMQ auto-destruct queue concurrency
- Seasonal date storage and evaluation

### Deferred Ideas (OUT OF SCOPE)
- Moving posts between scheduled and queued -- Phase 10
- Bulk queue operations (randomize, purge, copy, text modify, deduplicate) -- Phase 10
- CSV bulk upload to queues -- Phase 10
- Queue empty notification delivery -- Phase 9 (Phase 5 emits event only)
- Cross-queue analytics
- Queue templates
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUEUE-01 | Create queue with name, network, profile, schedule type, interval, days-of-week, hour windows, start date, seasonal window, notes | `queues` table schema, Zod validation, schedule builder form patterns |
| QUEUE-02 | Queue list with name, network, profile, queue ID, post count, last published, next run; filterable by network | TanStack React Table pattern from PostsPage, query hook pattern |
| QUEUE-03 | Per-queue actions: Edit, Copy Configuration, Delete (confirmation), View Posts, View Notes | DropdownMenu pattern from PostActionsMenu, router factory pattern |
| QUEUE-04 | Queue posts list with Edit, View media, Move Up/Down, Delete, View History, View spinnable variants | Position-based reorder API, spinnable text parser, preview modal |
| QUEUE-05 | Queue posts reorderable (move up/down) | Explicit `queue_position` integer column, swap-based reorder API |
| QUEUE-06 | Queue scheduling uses BullMQ with timezone-aware scheduling; DST transitions do not shift times | BullMQ `tz` option via cron-parser, Luxon DST arithmetic, scanner extension |
| WORKER-09 | Auto-destruct worker: after configured time, calls platform delete; transitions `auto_destructing` -> `destroyed` | BullMQ delayed jobs, `client.v2.deleteTweet()`, three-phase lifecycle pattern |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Verified |
|---------|---------|---------|----------|
| BullMQ | 5.73.0 | Job queue, delayed jobs, job schedulers | [VERIFIED: installed in packages/worker/node_modules] |
| ioredis | 5.x | Redis client (BullMQ dependency) | [VERIFIED: installed, used in worker/index.ts] |
| Luxon | 3.7.2 | Timezone-aware date arithmetic, DST handling | [VERIFIED: installed in packages/api, packages/worker] |
| twitter-api-v2 | 1.29.0 | Tweet deletion via `v2.deleteTweet()` | [VERIFIED: installed, method confirmed in dist types] |
| Drizzle ORM | 0.45.x | Database schema, migrations, queries | [VERIFIED: used across db, api, worker packages] |
| Zod | 3.25.x | Request validation schemas | [VERIFIED: used in packages/shared/src/schemas/] |
| TanStack React Table | 5.x | Data tables for queue/post lists | [VERIFIED: used in PostsPage.tsx] |
| React Hook Form | 7.x | Queue creation/edit forms | [VERIFIED: used in NewPostPage.tsx] |
| shadcn/ui | - | UI component library | [VERIFIED: Dialog, Table, Badge, Button, Select all available] |

### No New Dependencies Required

Phase 5 uses only libraries already in the project. No new packages need to be installed.

## Architecture Patterns

### Recommended Project Structure

```
packages/db/src/schema/
  queues.ts                    # New queues table schema

packages/shared/src/
  constants/queues.ts          # Extended with autoDestruct queue + job names
  schemas/queues.ts            # New Zod schemas for queue CRUD
  lib/spinnable-text.ts        # New spin syntax parser

packages/api/src/
  routes/queues.ts             # New queue CRUD + post management routes
  services/queue.service.ts    # Queue business logic
  services/auto-destruct-queue.service.ts  # BullMQ wrapper for auto-destruct jobs

packages/worker/src/
  queue-scanner.ts             # Queue scheduling scanner (mirrors scanner.ts)
  auto-destruct-worker.ts      # BullMQ worker for post deletion
  twitter-delete.service.ts    # Twitter delete API call wrapper

packages/web/src/
  pages/queues/
    QueuesPage.tsx             # Queue list page
    QueueDetailPage.tsx        # Queue create/edit form
    QueuePostsPage.tsx         # Queue posts list with reorder
  hooks/
    use-queues.ts              # TanStack Query hooks for queues
  components/queues/
    QueueActionsMenu.tsx       # Per-queue dropdown
    ScheduleBuilder.tsx        # Hour window + interval + day-of-week form
    SpinnableVariantsDialog.tsx # Preview modal for spin syntax
```

### Pattern 1: Queue Scanner Extension

**What:** A second scanner loop (or extension of the existing one) that runs every 60 seconds, evaluates all active queues against their schedule constraints, and enqueues the next post from each eligible queue into the existing `publish` queue.

**When to use:** This is the recommended approach per Claude's Discretion.

**Why over per-queue Job Schedulers:** The scanner pattern is already proven in Phase 4. Queue schedule evaluation requires complex logic (day-of-week filter, hour window check, interval elapsed check, seasonal window check) that is easier to unit test as pure functions than as BullMQ Job Scheduler callbacks. A single scanner also avoids the proliferation of Redis keys (one Job Scheduler per queue) and makes queue schedule changes instant (the next tick evaluates the new config) instead of requiring upsert/remove of Job Schedulers.

```typescript
// Pseudocode for queue scanner evaluation
async function evaluateQueues(db: WorkerDb, publishQueue: Queue, now: DateTime): Promise<number> {
  const activeQueues = await selectActiveQueues(db);
  let enqueued = 0;

  for (const queue of activeQueues) {
    const userTz = await getUserTimezone(db, queue.userId);
    const localNow = now.setZone(userTz);

    if (!isWithinSeasonalWindow(queue, localNow)) continue;
    if (!isDayOfWeekAllowed(queue, localNow)) continue;
    if (!isWithinHourWindow(queue, localNow)) continue;
    if (!hasIntervalElapsed(queue, localNow)) continue;

    const nextPost = await getNextQueuePost(db, queue.id, queue.cursorPosition);
    if (!nextPost) {
      await emitQueueEmptyNotification(queue);
      continue;
    }

    await enqueueQueuePost(db, publishQueue, queue, nextPost);
    enqueued++;
  }
  return enqueued;
}
```

### Pattern 2: Auto-Destruct Worker (Three-Phase Lifecycle)

**What:** Mirrors the publish worker's three-phase transactional pattern: (1) lock + transition to `auto_destructing`, (2) call Twitter delete API, (3) commit `destroyed` status.

```typescript
// Simplified auto-destruct lifecycle
// Phase 1: transaction - lock post, verify status, transition
const lockedPost = await db.transaction(async (tx) => {
  const [post] = await tx.execute(sql`
    SELECT id, platform_post_id, profile_id, status
    FROM posts WHERE id = ${postId} FOR UPDATE
  `);
  if (post.status !== 'published') throw new AutoDestructAbort('not_published');
  await tx.update(posts).set({ status: 'auto_destructing' }).where(eq(posts.id, postId));
  return post;
});

// Phase 2: Twitter delete call OUTSIDE transaction
try {
  await client.v2.deleteTweet(lockedPost.platform_post_id);
} catch (err) {
  if (is404(err)) { /* treat as success per D-13 */ }
  else throw err;
}

// Phase 3: commit destroyed status
await db.update(posts).set({ status: 'destroyed', destroyedAt: new Date() }).where(eq(posts.id, postId));
```

### Pattern 3: Spinnable Text Parser

**What:** Regex-based parser that resolves `{opt1|opt2|opt3}` syntax to a random variant. Nested braces are not supported (SocialOomph does not support nesting either).

```typescript
const SPIN_REGEX = /\{([^{}]+)\}/g;

export function resolveSpinnableText(text: string): string {
  return text.replace(SPIN_REGEX, (_match, options: string) => {
    const variants = options.split('|');
    return variants[Math.floor(Math.random() * variants.length)];
  });
}

export function extractVariants(text: string): string[][] {
  const groups: string[][] = [];
  let match: RegExpExecArray | null;
  while ((match = SPIN_REGEX.exec(text)) !== null) {
    groups.push(match[1].split('|'));
  }
  return groups;
}

export function countTotalVariants(text: string): number {
  const groups = extractVariants(text);
  if (groups.length === 0) return 1;
  return groups.reduce((total, group) => total * group.length, 1);
}
```

### Pattern 4: Position-Based Reorder

**What:** Explicit `queue_position` integer column on the `posts` table. Reorder via swap: move up swaps position with the previous post, move down swaps with the next. Uses a transaction to ensure atomicity.

```typescript
async function movePostUp(db: Db, queueId: string, postId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [currentPost] = await tx.select({ id: posts.id, position: posts.queuePosition })
      .from(posts).where(and(eq(posts.id, postId), eq(posts.queueId, queueId)));

    if (!currentPost || currentPost.position <= 1) return;

    const [previousPost] = await tx.select({ id: posts.id, position: posts.queuePosition })
      .from(posts)
      .where(and(eq(posts.queueId, queueId), eq(posts.queuePosition, currentPost.position - 1)));

    if (!previousPost) return;

    await tx.update(posts).set({ queuePosition: currentPost.position }).where(eq(posts.id, previousPost.id));
    await tx.update(posts).set({ queuePosition: previousPost.position }).where(eq(posts.id, currentPost.id));
  });
}
```

**Why explicit integer over linked list:** Simpler queries (`ORDER BY queue_position`), predictable cursor tracking (`cursor = position`), no pointer-chasing for display order. Downside: reorder is O(1) for swap but O(n) for insert-at-position. For a single-user tool with queues of 50-200 posts, O(n) is irrelevant.

### Anti-Patterns to Avoid

- **Per-queue BullMQ Job Schedulers for variable intervals:** Variable intervals (since-last-publish) cannot use cron expressions because the next fire time depends on when the last post actually published, not a fixed schedule. A Job Scheduler with `every: N` would drift from the desired behavior. The scanner approach naturally handles this.
- **Storing resolved spinnable text:** Never persist the resolved text. Always store the spin syntax and resolve at publish time (D-05). The resolution is cheap and ensures each publish (including recycles) gets a fresh variant.
- **Coupling auto-destruct to recycling:** D-06 explicitly says they are independent. A recycled post has a new platform_post_id each cycle; the auto-destruct for the previous cycle's platform_post_id runs on its own timer. The auto-destruct job must carry the specific `platform_post_id` to delete, not look it up from the post row (which may have been overwritten by a new publish).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timezone-aware date arithmetic | Manual UTC offset math | Luxon `DateTime.setZone()` + `.hour`, `.weekday` | DST transitions create gaps/overlaps that manual offset math gets wrong |
| Cron expression parsing | Custom interval calculator | BullMQ's built-in cron-parser 4.9.0 (via `RepeatOptions.pattern` + `.tz`) | Handles DST, leap seconds, edge cases |
| Tweet deletion API | Raw HTTP fetch to Twitter | `twitter-api-v2` `client.v2.deleteTweet(tweetId)` | Handles OAuth 1.0a signing, error types, rate limit headers |
| Position gap management | Gap-free position renumbering | Accept gaps, compact lazily | Gaps in position integers are harmless for ordering; compacting on every delete is wasteful |
| Spin syntax parsing | Character-by-character parser | Regex `/\{([^{}]+)\}/g` with `split('|')` | Flat (non-nested) spin syntax is a single regex; nesting is out of scope per SocialOomph behavior |

## Common Pitfalls

### Pitfall 1: Auto-Destruct Job Carries Stale platform_post_id

**What goes wrong:** The auto-destruct job reads `platform_post_id` from the post row at execution time, but recycling may have overwritten it with a new tweet's ID. The wrong tweet gets deleted.

**Why it happens:** Recycling publishes the same post row multiple times, each time writing a new `platform_post_id`. If the auto-destruct job for cycle N reads the row after cycle N+1 has published, it deletes cycle N+1's tweet.

**How to avoid:** The auto-destruct BullMQ job payload MUST include the specific `platformPostId` to delete, captured at the moment the publish succeeds. The worker uses the payload value, never re-reads from the DB for the target tweet ID.

**Warning signs:** Auto-destruct deleting tweets that were just published; users reporting "my tweet disappeared immediately."

### Pitfall 2: Variable Interval Drift with Fixed-Tick Scanner

**What goes wrong:** A 4-hour variable interval on a 60-second scanner tick evaluates to "eligible" every tick after the 4 hours have passed, potentially enqueuing multiple posts in rapid succession if the publish is slow.

**Why it happens:** The scanner runs every 60s. Once the interval has elapsed, every subsequent tick also passes the check until a post is actually published and `last_published_at` is updated.

**How to avoid:** Use an optimistic lock or "pending publish" flag on the queue row. When the scanner selects a post for publishing, immediately update `next_run_at` or set a `is_publishing` flag within the same transaction. The next scanner tick sees the updated value and skips the queue.

**Warning signs:** Burst of queue posts published within seconds of each other; multiple publish jobs for the same queue in the BullMQ dashboard.

### Pitfall 3: DST Gap Hours and Queue Scheduling

**What goes wrong:** User has hour window including 2am in a timezone that springs forward (2am -> 3am). The scanner evaluates at 2:30am local, which doesn't exist. Luxon returns an adjusted time, but the hour check may pass or fail unexpectedly.

**Why it happens:** During spring-forward DST transitions, certain local hours are skipped. `DateTime.now().setZone('America/New_York').hour` will never be 2 during the spring-forward night.

**How to avoid:** Hour window evaluation uses the local hour of the current moment (`localNow.hour`). If the hour doesn't exist (spring forward), it naturally skips because `localNow.hour` jumps from 1 to 3. Fall-back (repeated hour) is handled by Luxon resolving to the first occurrence. Document this behavior for users.

**Warning signs:** Posts not publishing during DST transition nights; user reports that "2am slot was skipped."

### Pitfall 4: Queue Scanner Must Not Re-Enqueue Already-Publishing Posts

**What goes wrong:** The scanner picks the next post from a queue, but it is already in `publishing` state from a previous scanner tick (the publish worker hasn't finished yet). The scanner enqueues it again, causing a duplicate publish attempt.

**Why it happens:** The queue cursor points to a post that is mid-publish. The scanner doesn't check the post's status before enqueuing.

**How to avoid:** The queue scanner must filter by `status = 'queued'` when selecting the next post. Posts that have transitioned to `publishing` are excluded. Additionally, use BullMQ's jobId deduplication (`post-{id}-v{version}`) to prevent duplicate jobs even if the query has a race.

**Warning signs:** Same post published twice from a queue in quick succession.

### Pitfall 5: Auto-Destruct Delay Calculation Goes Negative

**What goes wrong:** Worker was down or lagged. When the auto-destruct scanner picks up a published post, `now - publishedAt` exceeds the configured auto-destruct duration. The delay calculation produces a negative number.

**Why it happens:** `delay = autoDestructAfter - (now - publishedAt)` can go negative if time has passed.

**How to avoid:** Clamp delay to `Math.max(0, ...)`. A zero delay means "delete immediately" -- the correct behavior because the destruct time has already passed. This matches the Phase 4 publish queue's delay clamping pattern in `publish-queue.service.ts`.

**Warning signs:** BullMQ rejecting negative delay values; auto-destruct jobs never firing for posts published during worker downtime.

### Pitfall 6: Queue Cursor vs. Post Deletion Race

**What goes wrong:** User deletes a post at position 5 while the cursor is at position 4. After publish, cursor advances to 5, which no longer exists. The queue stalls.

**Why it happens:** Position-based cursor assumes contiguous positions, but deletions create gaps.

**How to avoid:** The cursor advancement query should find the next post with `queue_position > current_cursor` rather than `queue_position = current_cursor + 1`. This naturally skips gaps. For recycling wrap, find `MIN(queue_position)` rather than assuming position 1 exists.

**Warning signs:** Queue stops publishing even though it has posts; cursor points to a non-existent position.

## Code Examples

### Queue Table Schema (Drizzle)

```typescript
// packages/db/src/schema/queues.ts
import { pgTable, uuid, varchar, text, boolean, integer, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { socialProfiles } from './social-profiles.js';

export const queues = pgTable('queues', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => socialProfiles.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),

  // Schedule configuration
  intervalType: varchar('interval_type', { length: 10 }).notNull().default('fixed'), // 'fixed' | 'variable'
  intervalValue: integer('interval_value').notNull().default(4),
  intervalUnit: varchar('interval_unit', { length: 10 }).notNull().default('hours'),
  daysOfWeek: jsonb('days_of_week').notNull().default([0, 1, 2, 3, 4, 5, 6]), // 0=Sun..6=Sat
  hourSlots: jsonb('hour_slots').notNull().default([9, 12, 15, 18]), // hour integers 6-23

  // Seasonal window (optional)
  seasonalStart: varchar('seasonal_start', { length: 5 }), // 'MM-DD' format
  seasonalEnd: varchar('seasonal_end', { length: 5 }),     // 'MM-DD' format
  seasonalRepeat: boolean('seasonal_repeat').notNull().default(false),

  // Queue state
  isRecycling: boolean('is_recycling').notNull().default(false),
  isPaused: boolean('is_paused').notNull().default(false),
  cursorPosition: integer('cursor_position').notNull().default(0),
  startDate: timestamp('start_date', { withTimezone: true }),
  lastPublishedAt: timestamp('last_published_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),

  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('queues_user_id').on(table.userId),
  index('queues_profile_id').on(table.profileId),
  index('queues_next_run').on(table.nextRunAt),
]);
```

### Posts Table Extension

```typescript
// Add to packages/db/src/schema/posts.ts
import { queues } from './queues.js';

// New columns on posts table:
queueId: uuid('queue_id').references(() => queues.id, { onDelete: 'set null' }),
queuePosition: integer('queue_position'),
destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
```

### Queue Constants Extension

```typescript
// packages/shared/src/constants/queues.ts - additions
export const QUEUE_NAMES = {
  publish: 'publish',
  notification: 'notification',
  autoDestruct: 'auto-destruct',    // NEW
} as const;

export const JOB_NAMES = {
  publishPost: 'publish-post',
  scanScheduled: 'scan-scheduled',
  scanQueues: 'scan-queues',                      // NEW
  autoDestructPost: 'auto-destruct-post',          // NEW
  scanAutoDestruct: 'scan-auto-destruct',          // NEW
  publishFailedNotification: 'publish-failed',
  rateLimitWarnNotification: 'rate-limit-warn',
  queueEmptyNotification: 'queue-empty',           // NEW
  autoDestructFailedNotification: 'auto-destruct-failed', // NEW
} as const;
```

### Tweet Deletion Service

```typescript
// packages/worker/src/twitter-delete.service.ts
// Source: [VERIFIED: twitter-api-v2 dist/cjs/v2/client.v2.write.d.ts]
import { TwitterApi, ApiResponseError } from 'twitter-api-v2';
import { decrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { createLogger } from '@sms/shared/logger';
import type { socialProfiles } from '@sms/db';

const logger = createLogger('twitter-delete');

export interface DeleteTweetArgs {
  profile: typeof socialProfiles.$inferSelect;
  platformPostId: string;
  correlationId: string;
}

export async function deleteTweet(args: DeleteTweetArgs): Promise<{ deleted: boolean }> {
  // Same credential decryption pattern as twitter-publish.service.ts
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) throw new Error('ENCRYPTION_KEY env var not set');
  const encryptionKey = validateEncryptionKey(rawKey);

  // ... decrypt credentials (same as publish service) ...

  const client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });

  logger.info(
    { profileId: args.profile.id, platformPostId: args.platformPostId, correlationId: args.correlationId },
    'Calling Twitter v2.deleteTweet',
  );

  const result = await client.v2.deleteTweet(args.platformPostId);
  return { deleted: result.data.deleted };
}
```

### Timezone-Aware Schedule Evaluation (Luxon)

```typescript
// Source: [VERIFIED: Luxon 3.7.2 installed, DateTime API]
import { DateTime } from 'luxon';

export function isWithinHourWindow(hourSlots: number[], userTimezone: string, now?: DateTime): boolean {
  const localNow = (now ?? DateTime.utc()).setZone(userTimezone);
  return hourSlots.includes(localNow.hour);
}

export function isDayOfWeekAllowed(daysOfWeek: number[], userTimezone: string, now?: DateTime): boolean {
  const localNow = (now ?? DateTime.utc()).setZone(userTimezone);
  // Luxon weekday: 1=Mon..7=Sun. Convert to 0=Sun..6=Sat for SocialOomph compat.
  const localDow = localNow.weekday === 7 ? 0 : localNow.weekday;
  return daysOfWeek.includes(localDow);
}

export function hasFixedIntervalElapsed(
  intervalValue: number,
  intervalUnit: string,
  lastPublishedAt: DateTime | null,
  userTimezone: string,
  now?: DateTime,
): boolean {
  const localNow = (now ?? DateTime.utc()).setZone(userTimezone);
  if (!lastPublishedAt) return true; // First publish ever
  const localLast = lastPublishedAt.setZone(userTimezone);
  const elapsed = localNow.diff(localLast, intervalUnit as any);
  return elapsed.as(intervalUnit as any) >= intervalValue;
}
```

### Auto-Destruct Delay Calculation

```typescript
// Source: Pattern mirrors publish-queue.service.ts delay clamping
export function calculateAutoDestructDelay(
  publishedAt: Date,
  autoDestructAfter: string, // e.g., "24 hours", "7 days"
): number {
  const [valueStr, unit] = autoDestructAfter.split(' ');
  const value = parseInt(valueStr, 10);
  const ms = durationToMs(value, unit);
  const targetTime = publishedAt.getTime() + ms;
  return Math.max(0, targetTime - Date.now());
}

function durationToMs(value: number, unit: string): number {
  const multipliers: Record<string, number> = {
    minutes: 60_000, minute: 60_000,
    hours: 3_600_000, hour: 3_600_000,
    days: 86_400_000, day: 86_400_000,
    weeks: 604_800_000, week: 604_800_000,
    months: 2_592_000_000, month: 2_592_000_000, // 30 days
    years: 31_536_000_000, year: 31_536_000_000,  // 365 days
  };
  return value * (multipliers[unit] ?? 0);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BullMQ `Queue.add()` with `repeat` option | `Queue.upsertJobScheduler()` | BullMQ 5.x (2024) | Job Schedulers are the recommended way to manage recurring jobs. The old `repeat` API still works but Job Schedulers are more robust for upsert/update semantics. |
| `QueueScheduler` class | Removed in BullMQ 4.x+ | BullMQ 4.0 | QueueScheduler is no longer needed. Delayed job promotion is handled automatically by the Worker. |
| `csurf` for CSRF | `csrf-csrf` | 2022 | csurf deprecated with security vulnerabilities |

**Note:** For this phase, we use the scanner pattern (not Job Schedulers) because queue evaluation logic is complex and varies per queue. The BullMQ scanner repeatable job is the mechanism (via `Queue.add` with `repeat.every`), not `upsertJobScheduler`. This matches the Phase 4 scanner pattern exactly. [VERIFIED: scanner.ts line 127-132 uses `Queue.add` with `repeat.every`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `twitter-api-v2` `deleteTweet()` works with OAuth 1.0a user context (not just OAuth 2.0) | Code Examples | If delete requires OAuth 2.0 only, would need separate auth flow or v1.1 endpoint. LOW risk -- v2 manage-tweets endpoints support user context auth. |
| A2 | Seasonal window using MM-DD string comparison is sufficient | Architecture | If users need cross-year windows (e.g., Dec 15 - Jan 15), simple string comparison fails. MEDIUM risk -- mitigated by checking if start > end and wrapping the comparison. |
| A3 | `autoDestructAfter` regex in posts schema supports months/years | Code Examples | Current regex allows `minutes|hours|days|weeks` only. Phase 5 needs to extend it for months/years per QUEUE-01 spec. LOW risk -- regex update is trivial. |
| A4 | Luxon weekday mapping (1=Mon..7=Sun) is stable | Code Examples | If Luxon changes weekday mapping, day-of-week filter breaks. LOW risk -- this is ISO 8601 standard, Luxon documents it explicitly. |

## Open Questions

1. **Fixed interval alignment behavior**
   - What we know: D-02 says fixed intervals are "clock-aligned" (e.g., every 4h = 8am, 12pm, 4pm, 8pm)
   - What's unclear: What is the alignment base? Does "every 4 hours" mean starting from midnight, or from the queue's start time, or from the first allowed hour slot?
   - Recommendation: Align to midnight in the user's timezone. This is the SocialOomph behavior and the most intuitive for users. The hour window further constrains which aligned slots actually fire.

2. **Queue cursor behavior when all posts are in non-queued states**
   - What we know: Cursor advances based on position. Posts transition through publishing/published states.
   - What's unclear: When recycling wraps and all posts are in `published` state, do they need to be re-queued first?
   - Recommendation: For recycling, after publishing position N, the post stays in `published` state (or transitions back to `queued` if recycling is on). The cursor wraps to `MIN(queue_position)` where the post is in `queued` state. This means recycling requires transitioning published posts back to `queued`.

3. **Auto-destruct scanner vs. direct delayed job from publish worker**
   - What we know: D-14 says timer counts from `published_at`. The publish worker knows the exact `published_at` moment.
   - What's unclear: Should auto-destruct jobs be enqueued directly by the publish worker (immediate, precise delay) or discovered by a periodic scanner?
   - Recommendation: Hybrid approach. The publish worker enqueues the delayed auto-destruct job immediately after successful publish (precise delay). A separate scanner runs every 5 minutes to catch posts that were published during worker downtime and don't have a pending auto-destruct job. This mirrors the Phase 4 approach (API enqueues + scanner catches misses).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `packages/worker/vitest.config.ts`, `packages/api/vitest.config.ts`, `packages/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @sms/worker test -- --run` |
| Full suite command | `pnpm -r test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUEUE-01 | Queue CRUD with schedule config | unit + integration | `pnpm --filter @sms/api test -- --run -t "queue"` | Wave 0 |
| QUEUE-02 | Queue list query with filters | unit | `pnpm --filter @sms/api test -- --run -t "queue list"` | Wave 0 |
| QUEUE-03 | Queue actions (edit, copy, delete) | unit | `pnpm --filter @sms/api test -- --run -t "queue action"` | Wave 0 |
| QUEUE-04 | Queue posts list with actions | unit | `pnpm --filter @sms/api test -- --run -t "queue posts"` | Wave 0 |
| QUEUE-05 | Post reorder (move up/down) | unit | `pnpm --filter @sms/api test -- --run -t "reorder"` | Wave 0 |
| QUEUE-06 | Timezone-aware scheduling | unit | `pnpm --filter @sms/worker test -- --run -t "queue-scanner"` | Wave 0 |
| WORKER-09 | Auto-destruct lifecycle | unit | `pnpm --filter @sms/worker test -- --run -t "auto-destruct"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @sms/{package} test -- --run`
- **Per wave merge:** `pnpm -r test -- --run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/worker/src/__tests__/queue-scanner.test.ts` -- covers QUEUE-06 schedule evaluation, DST handling
- [ ] `packages/worker/src/__tests__/auto-destruct-worker.test.ts` -- covers WORKER-09 lifecycle, 404-as-success
- [ ] `packages/api/src/__tests__/routes/queues.test.ts` -- covers QUEUE-01 through QUEUE-05 API routes
- [ ] `packages/shared/src/__tests__/spinnable-text.test.ts` -- covers spinnable text parsing and resolution
- [ ] `packages/shared/src/__tests__/schedule-evaluation.test.ts` -- covers hour window, day-of-week, interval, seasonal checks

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Session auth already enforced via `requireAuth` middleware |
| V3 Session Management | no | Already handled by Phase 2 |
| V4 Access Control | yes | Queue ownership enforced via `userId` FK; all queries filter by `req.session.userId` |
| V5 Input Validation | yes | Zod schemas for all queue CRUD inputs; hour slots validated as 6-23 range; interval bounds checked |
| V6 Cryptography | no | Token decryption reuses existing Phase 1 encryption module |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Queue ID enumeration | Information Disclosure | All queue queries filter by `userId`; 404 on ownership mismatch (timing-safe) |
| Position manipulation via API | Tampering | Validate move-up/move-down targets are within the same queue; transaction isolation |
| Auto-destruct job injection | Tampering | Job payload integrity -- auto-destruct jobs only enqueued by the publish worker or scanner, never by the API directly from user input |
| Credential exposure in auto-destruct logs | Information Disclosure | Same credential discipline as publish -- decrypt in worker scope, never log tokens |

## Sources

### Primary (HIGH confidence)
- BullMQ installed source: `packages/worker/node_modules/bullmq/dist/esm/interfaces/repeatable-options.d.ts` -- confirmed `tz?: string` parameter
- BullMQ installed source: `packages/worker/node_modules/bullmq/dist/esm/classes/queue.d.ts` -- confirmed `upsertJobScheduler` signature
- twitter-api-v2 installed source: `dist/cjs/v2/client.v2.write.d.ts` -- confirmed `deleteTweet(tweetId: string): Promise<TweetV2DeleteTweetResult>` returning `{ data: { deleted: boolean } }`
- cron-parser 4.9.0 bundled with BullMQ -- `ParserOptions` includes `tz?: string` for IANA timezone
- Luxon 3.7.2 installed -- `DateTime.setZone()`, `.hour`, `.weekday` for timezone-aware evaluation
- Existing codebase: `packages/worker/src/scanner.ts` -- 60s repeatable scanner pattern
- Existing codebase: `packages/worker/src/post-lifecycle.service.ts` -- three-phase lifecycle pattern
- Existing codebase: `packages/shared/src/constants/post-states.ts` -- state machine with `queued`, `auto_destructing`, `destroyed` states already defined

### Secondary (MEDIUM confidence)
- [BullMQ Job Schedulers docs](https://docs.bullmq.io/guide/job-schedulers) -- upsertJobScheduler API, template options
- [BullMQ Repeat Strategies docs](https://docs.bullmq.io/guide/job-schedulers/repeat-strategies) -- cron strategy with timezone, DST handling
- [BullMQ Delayed Jobs docs](https://docs.bullmq.io/guide/jobs/delayed) -- delay in ms, changeDelay(), timing accuracy caveat
- [BullMQ Repeat Options docs](https://docs.bullmq.io/guide/job-schedulers/repeat-options) -- startDate, endDate, limit options
- [Twitter API v2 Delete Tweet docs](https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/delete-tweets-id) -- DELETE /2/tweets/:id endpoint
- [twitter-api-v2 v2 docs](https://github.com/plhery/node-twitter-api-v2/blob/master/doc/v2.md) -- deleteTweet method

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and verified in node_modules
- Architecture: HIGH - patterns extend proven Phase 4 scanner and lifecycle code with clear integration points
- Pitfalls: HIGH - identified from codebase analysis and timezone/concurrency domain knowledge
- Queue scheduling: MEDIUM - fixed interval alignment base (midnight vs start time) needs user confirmation if ambiguous

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain -- BullMQ, Luxon, and twitter-api-v2 APIs unlikely to change)
