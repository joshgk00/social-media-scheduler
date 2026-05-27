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
// WR-01 fix: cursor advance happens INSIDE the db.transaction alongside
// post selection. BullMQ enqueue happens AFTER the transaction commits.
// If BullMQ fails, the post stays queued and retries on the next cycle
// when cursor wraps. BullMQ jobId dedup (buildPublishJobId) prevents
// double-publish.
//
// Pitfall 6: cursor advancement uses queue_position > cursorPosition,
// not = cursorPosition+1, to handle gaps from deleted posts.

import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { eq, and, gt, asc, lte, sql } from 'drizzle-orm';
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
  planMoveToQueue,
} from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import type { WorkerDb } from './db.js';

const logger = createLogger('queue-scanner');

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
  intervalType: 'fixed' | 'variable';
  intervalValue: number;
  intervalUnit: string;
  daysOfWeek: number[];
  hourSlots: number[];
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
  notificationThrottle: Map<string, number> = new Map(),
): Promise<number> {
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
    .where(and(eq(queues.isPaused, false), lte(queues.nextRunAt, sql`NOW()`)));

  logger.info({ activeQueueCount: activeQueues.length }, 'Queue scanner pass');

  for (const queue of activeQueues as ActiveQueueRow[]) {
    try {
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
      if (!isDayOfWeekAllowed(queue.daysOfWeek, userTimezone, currentNow)) {
        continue;
      }

      // 4. Hour window check
      if (!isWithinHourWindow(queue.hourSlots, userTimezone, currentNow)) {
        continue;
      }

      // 5. Interval elapsed check
      const lastPublishedLuxon = queue.lastPublishedAt
        ? DateTime.fromJSDate(queue.lastPublishedAt)
        : null;
      if (!hasIntervalElapsed(
        queue.intervalType,
        queue.intervalValue,
        queue.intervalUnit,
        lastPublishedLuxon,
        userTimezone,
        currentNow,
      )) {
        continue;
      }

      // Select next post, handle recycling, and advance cursor atomically (WR-01)
      const txResult = await db.transaction(async (tx): Promise<{ post: QueuedPostRow; newCursorPosition: number } | null> => {
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

        let candidate: QueuedPostRow | null = (nextPosts[0] as QueuedPostRow | undefined) ?? null;

        // If no queued post found and recycling is ON: transition published->queued, wrap cursor
        if (!candidate && queue.isRecycling) {
          const recyclePatch = planMoveToQueue({
            status: 'published',
          });

          const recycled = await tx
            .update(posts)
            .set({ status: recyclePatch.status, updatedAt: new Date() })
            .where(
              and(
                eq(posts.queueId, queue.id),
                eq(posts.status, 'published'),
              ),
            )
            .returning({
              id: posts.id,
            });

          if (recycled.length > 0) {
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

            candidate = (minPosts[0] as QueuedPostRow | undefined) ?? null;
          }
        }

        if (!candidate) {
          return null;
        }

        // Advance cursor inside the transaction (WR-01: atomic with post selection)
        await tx
          .update(queues)
          .set({
            cursorPosition: candidate.queuePosition,
            nextRunAt: (() => {
              const next = calculateNextRunAt(
                {
                  intervalType: queue.intervalType,
                  intervalValue: queue.intervalValue,
                  intervalUnit: queue.intervalUnit,
                  hourSlots: queue.hourSlots,
                  daysOfWeek: queue.daysOfWeek,
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

        return { post: candidate, newCursorPosition: candidate.queuePosition };
      });

      // If no post found: emit queue-empty notification (outside tx -- BullMQ calls must not be inside a DB tx)
      if (!txResult) {
        const lastError = notificationThrottle.get(queue.id) ?? 0;
        if (Date.now() - lastError < 60_000) {
          continue;
        }
        await notificationQueue.add(JOB_NAMES.queueEmptyNotification, {
          queueId: queue.id,
          queueName: queue.name,
          profileId: queue.profileId,
          correlationId: randomUUID(),
          occurredAt: currentNow.toJSDate().toISOString(),
        }).catch((err: unknown) => {
          notificationThrottle.set(queue.id, Date.now());
          logger.error({ err, queueId: queue.id }, 'Failed to enqueue queue-empty notification');
        });
        continue;
      }

      const nextQueuedPost = txResult.post;

      // Resolve spinnable text at enqueue time (D-05)
      const resolvedText = nextQueuedPost.hasSpinnableText
        ? resolveSpinnableText(nextQueuedPost.text)
        : undefined;

      const correlationId = randomUUID();
      const jobId = buildPublishJobId(nextQueuedPost.id, nextQueuedPost.postVersion);

      // Enqueue to publish queue AFTER cursor advance (BullMQ jobId dedup prevents double-publish)
      await publishQueue.add(
        JOB_NAMES.publishPost,
        {
          postId: nextQueuedPost.id,
          postVersion: nextQueuedPost.postVersion,
          correlationId,
          ...(resolvedText !== undefined ? { resolvedText } : {}),
        },
        {
          delay: 0,
          jobId,
        },
      );

      enqueuedCount++;
    } catch (queueErr) {
      logger.error({ err: queueErr, queueId: queue.id }, 'Failed to process queue');
      continue;
    }
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
  const notificationThrottle = new Map<string, number>();

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
        await evaluateQueues(db, publishQueue, notificationQueue, undefined, notificationThrottle);
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
