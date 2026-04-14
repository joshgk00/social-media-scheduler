// Queue scheduling scanner. Runs every 60s, evaluates all active queues,
// and enqueues the next post from each eligible queue into the publish
// queue. Mirrors the existing scanner.ts pattern (Phase 4) but operates
// on queue-level scheduling rather than individual post scheduling.
//
// Constraint evaluation order (per PLAN):
//   1. startDate -- skip if now < startDate
//   2. Seasonal window
//   3. Day-of-week
//   4. Hour window
//   5. Interval elapsed
//
// Pitfall 2 prevention: nextRunAt updated atomically within a transaction
// before the publish job is enqueued, preventing double-evaluation on the
// next 60s tick.
//
// Pitfall 6: cursor advancement uses queue_position > cursorPosition,
// not = cursorPosition+1, to handle gaps from deleted posts.

import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { eq, and, gt, asc, sql } from 'drizzle-orm';
import { queues, posts, users } from '@sms/db';
import {
  JOB_NAMES,
  buildPublishJobId,
  isWithinHourWindow,
  isDayOfWeekAllowed,
  hasIntervalElapsed,
  isWithinSeasonalWindow,
  resolveSpinnableText,
  calculateNextRunAt,
} from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import type { WorkerDb } from './db.js';

let lastNotificationError: number = 0;

export const QUEUE_SCANNER_QUEUE_NAME = 'queue-scanner';
export const QUEUE_SCAN_INTERVAL_MS = 60_000;

export interface StartQueueScannerResult {
  queueScannerQueue: Queue;
  queueScannerWorker: Worker;
}

interface ActiveQueueRow {
  id: string;
  name: string;
  userId: string;
  profileId: string;
  isPaused: boolean;
  intervalType: string;
  intervalValue: number;
  intervalUnit: string;
  daysOfWeek: unknown;
  hourSlots: unknown;
  seasonalStart: string | null;
  seasonalEnd: string | null;
  seasonalRepeat: boolean;
  isRecycling: boolean;
  cursorPosition: number;
  startDate: Date | null;
  lastPublishedAt: Date | null;
  nextRunAt: Date | null;
  timezone: string;
}

interface QueuedPostRow {
  id: string;
  postVersion: number;
  text: string;
  hasSpinnableText: boolean;
  queuePosition: number;
  status: string;
}

export async function evaluateQueues(
  db: WorkerDb,
  publishQueue: Queue,
  notificationQueue: Queue,
  now?: DateTime,
): Promise<number> {
  const logger = createLogger('queue-scanner');
  const currentNow = now ?? DateTime.utc();
  let enqueuedCount = 0;

  const activeQueues = await db
    .select({
      id: queues.id,
      name: queues.name,
      userId: queues.userId,
      profileId: queues.profileId,
      isPaused: queues.isPaused,
      intervalType: queues.intervalType,
      intervalValue: queues.intervalValue,
      intervalUnit: queues.intervalUnit,
      daysOfWeek: queues.daysOfWeek,
      hourSlots: queues.hourSlots,
      seasonalStart: queues.seasonalStart,
      seasonalEnd: queues.seasonalEnd,
      seasonalRepeat: queues.seasonalRepeat,
      isRecycling: queues.isRecycling,
      cursorPosition: queues.cursorPosition,
      startDate: queues.startDate,
      lastPublishedAt: queues.lastPublishedAt,
      nextRunAt: queues.nextRunAt,
      timezone: users.timezone,
    })
    .from(queues)
    .innerJoin(users, eq(queues.userId, users.id))
    .where(eq(queues.isPaused, false));

  logger.info({ activeQueueCount: activeQueues.length }, 'Queue scanner pass');

  for (const queue of activeQueues as ActiveQueueRow[]) {
    const userTimezone = queue.timezone || 'UTC';

    // 1. startDate check
    if (queue.startDate) {
      const startDateTime = DateTime.fromJSDate(queue.startDate);
      if (currentNow < startDateTime) {
        continue;
      }
    }

    // 2. Seasonal window check (timezone-adjusted so near-midnight evaluations use correct local date)
    if (!isWithinSeasonalWindow(
      queue.seasonalStart,
      queue.seasonalEnd,
      currentNow.setZone(userTimezone),
    )) {
      continue;
    }

    // 3. Day-of-week check
    if (!isDayOfWeekAllowed(queue.daysOfWeek as number[], userTimezone, currentNow)) {
      continue;
    }

    // 4. Hour window check
    if (!isWithinHourWindow(queue.hourSlots as number[], userTimezone, currentNow)) {
      continue;
    }

    // 5. Interval elapsed check
    const lastPublishedLuxon = queue.lastPublishedAt
      ? DateTime.fromJSDate(queue.lastPublishedAt)
      : null;
    if (!hasIntervalElapsed(
      queue.intervalType as 'fixed' | 'variable',
      queue.intervalValue,
      queue.intervalUnit,
      lastPublishedLuxon,
      userTimezone,
      currentNow,
    )) {
      continue;
    }

    // Pitfall 2: All post selection, recycling, and cursor advance in one transaction
    const nextPost = await db.transaction(async (tx): Promise<QueuedPostRow | null> => {
      // Find next queued post: queue_position > cursor (Pitfall 6: gap-safe)
      const nextPosts = await tx
        .select({
          id: posts.id,
          postVersion: posts.postVersion,
          text: posts.text,
          hasSpinnableText: posts.hasSpinnableText,
          queuePosition: posts.queuePosition,
          status: posts.status,
        })
        .from(posts)
        .where(
          and(
            eq(posts.queueId, queue.id),
            gt(posts.queuePosition, queue.cursorPosition),
            eq(posts.status, 'queued'),
          ),
        )
        .orderBy(asc(posts.queuePosition))
        .limit(1);

      let result: QueuedPostRow | null = (nextPosts[0] as QueuedPostRow | undefined) ?? null;

      // If no queued post found and recycling is ON: transition published->queued, wrap cursor
      if (!result && queue.isRecycling) {
        const publishedPosts = await tx
          .select({ id: posts.id })
          .from(posts)
          .where(
            and(
              eq(posts.queueId, queue.id),
              eq(posts.status, 'published'),
            ),
          );

        if (publishedPosts.length > 0) {
          await tx
            .update(posts)
            .set({ status: 'queued', updatedAt: new Date() })
            .where(
              and(
                eq(posts.queueId, queue.id),
                eq(posts.status, 'published'),
              ),
            );

          const minPosts = await tx
            .select({
              id: posts.id,
              postVersion: posts.postVersion,
              text: posts.text,
              hasSpinnableText: posts.hasSpinnableText,
              queuePosition: posts.queuePosition,
              status: posts.status,
            })
            .from(posts)
            .where(
              and(
                eq(posts.queueId, queue.id),
                eq(posts.status, 'queued'),
              ),
            )
            .orderBy(asc(posts.queuePosition))
            .limit(1);

          result = (minPosts[0] as QueuedPostRow | undefined) ?? null;
        }
      }

      if (result) {
        // Advance cursor to the selected post's position
        await tx
          .update(queues)
          .set({
            cursorPosition: result.queuePosition,
            nextRunAt: (() => {
              const next = calculateNextRunAt(
                {
                  intervalType: queue.intervalType,
                  intervalValue: queue.intervalValue,
                  intervalUnit: queue.intervalUnit,
                  hourSlots: queue.hourSlots as number[],
                  daysOfWeek: queue.daysOfWeek as number[],
                  lastPublishedAt: queue.lastPublishedAt,
                  startDate: queue.startDate,
                },
                userTimezone,
                currentNow,
              );
              return next ? new Date(next.toMillis()) : new Date(currentNow.plus({ minutes: 5 }).toMillis());
            })(),
            updatedAt: new Date(),
          })
          .where(eq(queues.id, queue.id));
      }

      return result;
    });

    // If no post found: emit queue-empty notification (outside tx — BullMQ calls must not be inside a DB tx)
    if (!nextPost) {
      if (Date.now() - lastNotificationError < 60_000) {
        continue;
      }
      await notificationQueue.add(JOB_NAMES.queueEmptyNotification, {
        kind: 'queue_empty',
        queueId: queue.id,
        queueName: queue.name,
        at: new Date().toISOString(),
      }).catch((err: unknown) => {
        lastNotificationError = Date.now();
        logger.error({ err, queueId: queue.id }, 'Failed to enqueue queue-empty notification');
      });
      continue;
    }

    // Resolve spinnable text at enqueue time (D-05)
    const resolvedText = nextPost.hasSpinnableText
      ? resolveSpinnableText(nextPost.text)
      : undefined;

    const correlationId = randomUUID();
    const jobId = buildPublishJobId(nextPost.id, nextPost.postVersion);

    // Enqueue to publish queue
    await publishQueue.add(
      JOB_NAMES.publishPost,
      {
        postId: nextPost.id,
        postVersion: nextPost.postVersion,
        correlationId,
        ...(resolvedText !== undefined ? { resolvedText } : {}),
      },
      {
        delay: 0,
        jobId,
      },
    );

    enqueuedCount++;
  }

  if (enqueuedCount === 0) {
    logger.debug({ activeCount: activeQueues.length }, 'No queues eligible for publish this tick');
  }

  return enqueuedCount;
}

export async function startQueueScanner(
  redis: Redis,
  db: WorkerDb,
  publishQueue: Queue,
  notificationQueue: Queue,
): Promise<StartQueueScannerResult> {
  const logger = createLogger('queue-scanner');

  const queueScannerQueue = new Queue(QUEUE_SCANNER_QUEUE_NAME, {
    connection: redis,
  });

  // Idempotent repeatable registration
  await queueScannerQueue.add(
    JOB_NAMES.scanQueues,
    {},
    {
      repeat: { every: QUEUE_SCAN_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );

  const queueScannerWorker = new Worker(
    QUEUE_SCANNER_QUEUE_NAME,
    async () => {
      try {
        await evaluateQueues(db, publishQueue, notificationQueue);
      } catch (err) {
        logger.error({ err }, 'Queue scanner pass failed');
        throw err;
      }
    },
    { connection: redis, concurrency: 1 },
  );

  queueScannerWorker.on('error', (err) => {
    logger.error({ err }, 'Queue scanner worker error event');
  });

  return { queueScannerQueue, queueScannerWorker };
}
