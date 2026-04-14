// Scanner reconciliation loop. Runs every 60s, looks 90s into the future,
// and re-enqueues any `scheduled` post that doesn't already have a
// `platform_post_id`. The scanner acts as a belt-and-suspenders layer on
// top of the delayed BullMQ jobs the API enqueues directly — if a delayed
// job was lost (Redis restart without persistence, scheduler outage, etc.)
// the scanner catches it on the next pass and pushes the post into the
// publish queue.
//
// BullMQ's custom jobId dedup means an already-pending publish job is
// silently preserved — re-adding with the same jobId is a no-op. So the
// scanner running every 60s against overlapping horizons is safe by
// construction.
//
// WORKER-03 SCOPE SPLIT: this scanner delivers ONLY the
// `scheduledAt <= now + 90s` timing comparison. The queue-recurrence
// portion of WORKER-03 (day-of-week filter, hour window filter, post
// interval enforcement) is owned by Phase 5 (Queue Engine). Both phases
// together deliver WORKER-03 in full — see 04-CONTEXT.md.

import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { and, eq, lte, isNull } from 'drizzle-orm';
import { posts } from '@sms/db';
import { JOB_NAMES, buildPublishJobId } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import { randomUUID } from 'node:crypto';
import type { WorkerDb } from './db.js';

export const SCANNER_QUEUE_NAME = 'scanner';
export const SCAN_INTERVAL_MS = 60_000;
export const SCAN_HORIZON_MS = 90_000;

export interface StartScannerResult {
  scannerQueue: Queue;
  scannerWorker: Worker;
}

export interface DuePost {
  id: string;
  postVersion: number;
  scheduledAt: Date | null;
}

/**
 * Query the `posts` table for entries that are due to publish. Exported so
 * unit tests can exercise the query shape against a mocked db without
 * standing up a real BullMQ Worker. See scanner.test.ts for the assertion
 * that `isNull(posts.platformPostId)` is applied.
 */
export async function selectDuePosts(
  db: WorkerDb,
  horizon: Date,
): Promise<DuePost[]> {
  // WORKER-03 (Phase 4 partial): scheduled_at timing comparison only. Phase 5
  // will add queue-recurrence predicates (day-of-week, hour window, interval)
  // via additional WHERE clauses joined to the queue config table.
  const rows = await db
    .select({
      id: posts.id,
      postVersion: posts.postVersion,
      scheduledAt: posts.scheduledAt,
    })
    .from(posts)
    .where(
      and(
        eq(posts.status, 'scheduled'),
        lte(posts.scheduledAt, horizon),
        // Idempotency belt-and-suspenders: exclude anything that already
        // has a platform_post_id. Uses drizzle's isNull helper — NOT
        // `eq(posts.platformPostId, null)` which does not compile to
        // `IS NULL` in SQL (revision Warning 1).
        isNull(posts.platformPostId),
      ),
    );
  return rows;
}

export interface EnqueueDuePostsDeps {
  db: WorkerDb;
  publishQueue: Queue;
  now?: () => number;
}

export async function enqueueDuePosts(
  deps: EnqueueDuePostsDeps,
): Promise<number> {
  const logger = createLogger('scanner');
  const nowMs = deps.now ? deps.now() : Date.now();
  const horizon = new Date(nowMs + SCAN_HORIZON_MS);

  const duePosts = await selectDuePosts(deps.db, horizon);
  logger.info({ duePostCount: duePosts.length, horizon }, 'Scanner pass');

  for (const post of duePosts) {
    const scheduledEpoch = post.scheduledAt?.getTime() ?? nowMs;
    const delay = Math.max(0, scheduledEpoch - nowMs);
    await deps.publishQueue.add(
      JOB_NAMES.publishPost,
      {
        postId: post.id,
        postVersion: post.postVersion,
        correlationId: randomUUID(),
      },
      {
        delay,
        jobId: buildPublishJobId(post.id, post.postVersion),
      },
    );
  }

  return duePosts.length;
}

export async function startScanner(
  redis: Redis,
  db: WorkerDb,
  publishQueue: Queue,
): Promise<StartScannerResult> {
  const logger = createLogger('scanner');

  const scannerQueue = new Queue(SCANNER_QUEUE_NAME, { connection: redis });

  // Idempotent repeatable registration — BullMQ ignores a duplicate key.
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
    SCANNER_QUEUE_NAME,
    async () => {
      try {
        await enqueueDuePosts({ db, publishQueue });
      } catch (err) {
        logger.error({ err }, 'Scanner pass failed');
        throw err;
      }
    },
    { connection: redis, concurrency: 1 },
  );

  scannerWorker.on('error', (err) => {
    logger.error({ err }, 'Scanner worker error event');
  });

  return { scannerQueue, scannerWorker };
}
