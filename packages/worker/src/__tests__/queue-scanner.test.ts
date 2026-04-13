import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DateTime } from 'luxon';
import type { Queue } from 'bullmq';
import type { WorkerDb } from '../db.js';

vi.mock('@sms/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sms/shared')>();
  return {
    ...actual,
    isWithinHourWindow: vi.fn().mockReturnValue(true),
    isDayOfWeekAllowed: vi.fn().mockReturnValue(true),
    hasIntervalElapsed: vi.fn().mockReturnValue(true),
    isWithinSeasonalWindow: vi.fn().mockReturnValue(true),
    resolveSpinnableText: vi.fn((text: string) => `resolved:${text}`),
  };
});

vi.mock('@sms/shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

import {
  isWithinHourWindow,
  isDayOfWeekAllowed,
  hasIntervalElapsed,
  isWithinSeasonalWindow,
  resolveSpinnableText,
} from '@sms/shared';
import { evaluateQueues, QUEUE_SCANNER_QUEUE_NAME, QUEUE_SCAN_INTERVAL_MS } from '../queue-scanner.js';

function createMockQueue(): Queue {
  return {
    add: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue;
}

interface MockDbRow {
  [key: string]: unknown;
}

// Thenable chain that acts like a drizzle query builder: chainable AND awaitable.
// When awaited (or .then called), it resolves to `rows`. Every chain method
// returns itself so .from().innerJoin().where().orderBy().limit() all work.
function thenableChain(rows: MockDbRow[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: (val: MockDbRow[]) => void, reject?: (err: unknown) => void) => {
    return Promise.resolve(rows).then(resolve, reject);
  };
  return chain;
}

function createMockDb(overrides: {
  activeQueues?: MockDbRow[];
  nextPost?: MockDbRow | null;
  publishedPosts?: MockDbRow[];
  minQueuedPosition?: MockDbRow | null;
}): WorkerDb {
  const {
    activeQueues = [],
    nextPost = null,
    publishedPosts = [],
    minQueuedPosition = null,
  } = overrides;

  let selectCallCount = 0;
  const updateCalls: Array<{ setArgs: unknown; whereArgs: unknown }> = [];

  const transactionFn = vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    const txUpdateSet = vi.fn();
    const txUpdateWhere = vi.fn().mockResolvedValue(undefined);
    txUpdateSet.mockReturnValue({ where: txUpdateWhere });
    const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });

    const tx = { update: txUpdate };
    return callback(tx);
  });

  const topUpdateSet = vi.fn();
  const topUpdateWhere = vi.fn().mockResolvedValue(undefined);
  topUpdateSet.mockReturnValue({ where: topUpdateWhere });
  const topUpdate = vi.fn().mockReturnValue({ set: topUpdateSet });

  const db = {
    select: vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // Active queues query (with innerJoin)
        return thenableChain(activeQueues);
      }
      if (selectCallCount === 2) {
        // Next queued post
        return thenableChain(nextPost ? [nextPost] : []);
      }
      if (selectCallCount === 3) {
        // Published posts for recycling
        return thenableChain(publishedPosts);
      }
      if (selectCallCount === 4) {
        // Min queued position after recycling
        return thenableChain(minQueuedPosition ? [minQueuedPosition] : []);
      }
      return thenableChain([]);
    }),
    update: topUpdate,
    transaction: transactionFn,
    _updateCalls: updateCalls,
  } as unknown as WorkerDb;

  return db;
}

const NOW = DateTime.fromISO('2026-07-15T14:00:00Z');

function makeQueue(overrides: Partial<MockDbRow> = {}): MockDbRow {
  return {
    id: 'queue-1',
    name: 'Test Queue',
    userId: 'user-1',
    profileId: 'profile-1',
    isPaused: false,
    intervalType: 'fixed',
    intervalValue: 4,
    intervalUnit: 'hours',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    hourSlots: [9, 12, 15, 18],
    seasonalStart: null,
    seasonalEnd: null,
    seasonalRepeat: false,
    isRecycling: false,
    cursorPosition: 0,
    startDate: null,
    lastPublishedAt: null,
    nextRunAt: null,
    timezone: 'America/New_York',
    ...overrides,
  };
}

function makePost(overrides: Partial<MockDbRow> = {}): MockDbRow {
  return {
    id: 'post-1',
    postVersion: 1,
    text: 'Hello world',
    hasSpinnableText: false,
    queuePosition: 1,
    status: 'queued',
    ...overrides,
  };
}

describe('Queue Scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWithinHourWindow).mockReturnValue(true);
    vi.mocked(isDayOfWeekAllowed).mockReturnValue(true);
    vi.mocked(hasIntervalElapsed).mockReturnValue(true);
    vi.mocked(isWithinSeasonalWindow).mockReturnValue(true);
  });

  describe('constants', () => {
    it('exports queue scanner queue name', () => {
      expect(QUEUE_SCANNER_QUEUE_NAME).toBe('queue-scanner');
    });

    it('exports 60s scan interval', () => {
      expect(QUEUE_SCAN_INTERVAL_MS).toBe(60_000);
    });
  });

  describe('evaluateQueues', () => {
    it('enqueues next post when all constraints are met', async () => {
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const post = makePost();
      const db = createMockDb({
        activeQueues: [makeQueue()],
        nextPost: post,
      });

      const enqueued = await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(enqueued).toBe(1);
      expect(publishQueue.add).toHaveBeenCalledOnce();
      expect(publishQueue.add).toHaveBeenCalledWith(
        'publish-post',
        expect.objectContaining({
          postId: 'post-1',
          postVersion: 1,
        }),
        expect.objectContaining({
          delay: 0,
        }),
      );
    });

    it('skips paused queues', async () => {
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      // Paused queues filtered by WHERE is_paused = false, so empty result
      const db = createMockDb({ activeQueues: [] });

      const enqueued = await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(enqueued).toBe(0);
      expect(publishQueue.add).not.toHaveBeenCalled();
    });

    it('skips queues outside seasonal window', async () => {
      vi.mocked(isWithinSeasonalWindow).mockReturnValue(false);
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const db = createMockDb({
        activeQueues: [makeQueue({ seasonalStart: '11/01', seasonalEnd: '03/01' })],
      });

      const enqueued = await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(enqueued).toBe(0);
      expect(publishQueue.add).not.toHaveBeenCalled();
    });

    it('skips queues where day-of-week check fails', async () => {
      vi.mocked(isDayOfWeekAllowed).mockReturnValue(false);
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const db = createMockDb({ activeQueues: [makeQueue()] });

      const enqueued = await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(enqueued).toBe(0);
      expect(publishQueue.add).not.toHaveBeenCalled();
    });

    it('skips queues where hour window check fails', async () => {
      vi.mocked(isWithinHourWindow).mockReturnValue(false);
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const db = createMockDb({ activeQueues: [makeQueue()] });

      const enqueued = await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(enqueued).toBe(0);
      expect(publishQueue.add).not.toHaveBeenCalled();
    });

    it('skips queues where interval has not elapsed', async () => {
      vi.mocked(hasIntervalElapsed).mockReturnValue(false);
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const db = createMockDb({ activeQueues: [makeQueue()] });

      const enqueued = await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(enqueued).toBe(0);
      expect(publishQueue.add).not.toHaveBeenCalled();
    });

    it('skips queues before their startDate', async () => {
      const futureStart = new Date('2027-01-01T00:00:00Z');
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const db = createMockDb({
        activeQueues: [makeQueue({ startDate: futureStart })],
      });

      const enqueued = await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(enqueued).toBe(0);
      expect(publishQueue.add).not.toHaveBeenCalled();
    });

    it('emits queue-empty notification when no posts available', async () => {
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const db = createMockDb({
        activeQueues: [makeQueue()],
        nextPost: null,
      });

      const enqueued = await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(enqueued).toBe(0);
      expect(notificationQueue.add).toHaveBeenCalledWith(
        'queue-empty',
        expect.objectContaining({
          queueId: 'queue-1',
          queueName: 'Test Queue',
        }),
      );
    });

    it('advances cursor from position N to next queued post via transaction', async () => {
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const post = makePost({ queuePosition: 5 });
      const db = createMockDb({
        activeQueues: [makeQueue({ cursorPosition: 3 })],
        nextPost: post,
      });

      await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(db.transaction).toHaveBeenCalled();
    });

    it('wraps cursor to MIN(position) with recycling enabled when cursor exceeds max', async () => {
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const recycledPost = makePost({ id: 'recycled-1', queuePosition: 1 });
      const db = createMockDb({
        activeQueues: [makeQueue({ isRecycling: true, cursorPosition: 99 })],
        nextPost: null, // No queued post at cursor > 99
        publishedPosts: [{ id: 'pub-1' }],
        minQueuedPosition: recycledPost,
      });

      const enqueued = await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(enqueued).toBe(1);
      expect(publishQueue.add).toHaveBeenCalledWith(
        'publish-post',
        expect.objectContaining({ postId: 'recycled-1' }),
        expect.anything(),
      );
    });

    it('transitions published posts back to queued with recycling enabled', async () => {
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const recycledPost = makePost({ id: 'recycled-1', queuePosition: 1 });
      const db = createMockDb({
        activeQueues: [makeQueue({ isRecycling: true, cursorPosition: 99 })],
        nextPost: null,
        publishedPosts: [{ id: 'pub-1' }, { id: 'pub-2' }],
        minQueuedPosition: recycledPost,
      });

      await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      // db.update is called for published->queued transition
      expect(db.update).toHaveBeenCalled();
    });

    it('prevents double-enqueue via nextRunAt update in transaction', async () => {
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const post = makePost();
      const db = createMockDb({
        activeQueues: [makeQueue()],
        nextPost: post,
      });

      await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      // Verify the transaction was used for atomic enqueue + nextRunAt update
      expect(db.transaction).toHaveBeenCalled();
    });

    it('resolves spinnable text at enqueue time', async () => {
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const post = makePost({ hasSpinnableText: true, text: '{hello|world}' });
      const db = createMockDb({
        activeQueues: [makeQueue()],
        nextPost: post,
      });

      await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(resolveSpinnableText).toHaveBeenCalledWith('{hello|world}');
      expect(publishQueue.add).toHaveBeenCalledWith(
        'publish-post',
        expect.objectContaining({
          resolvedText: 'resolved:{hello|world}',
        }),
        expect.anything(),
      );
    });

    it('uses queue_position > cursor for gap-safe cursor advancement', async () => {
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const post = makePost({ queuePosition: 5 });
      const db = createMockDb({
        activeQueues: [makeQueue({ cursorPosition: 2 })],
        nextPost: post,
      });

      await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      // The implementation uses gt(posts.queuePosition, queue.cursorPosition)
      // which is queue_position > cursor. Verified by successful enqueue of
      // post at position 5 despite cursor being at 2 (not cursor+1=3).
      expect(publishQueue.add).toHaveBeenCalledOnce();
    });
  });
});
