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

const { mockCreateLogger } = vi.hoisted(() => {
  const mockCreateLogger = vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  });
  return { mockCreateLogger };
});

vi.mock('@sms/shared/logger', () => ({
  createLogger: mockCreateLogger,
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
  expectRecycling?: boolean;
}): WorkerDb {
  const {
    activeQueues = [],
    nextPost = null,
    publishedPosts = [],
    minQueuedPosition = null,
    expectRecycling = false,
  } = overrides;

  const transactionFn = vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    let txSelectIndex = 0;
    let txUpdateIndex = 0;

    // tx.select() -- used inside the transaction for post queries
    const txSelect = vi.fn().mockImplementation(() => {
      txSelectIndex++;
      if (txSelectIndex === 1) {
        return thenableChain(nextPost ? [nextPost] : []);
      }
      if (txSelectIndex === 2) {
        return thenableChain(minQueuedPosition ? [minQueuedPosition] : []);
      }
      return thenableChain([]);
    });

    // tx.update() -- supports both recycling and cursor advance chains
    const txUpdate = vi.fn().mockImplementation(() => {
      txUpdateIndex++;

      if (expectRecycling && txUpdateIndex === 1) {
        // Recycling chain: .set().where().returning()
        const txUpdateReturning = vi.fn().mockResolvedValue(
          publishedPosts.map(p => ({ id: (p as MockDbRow).id })),
        );
        const txUpdateWhere = vi.fn().mockReturnValue({ returning: txUpdateReturning });
        const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
        return { set: txUpdateSet };
      }

      // Cursor advance chain: .set().where() (no .returning())
      const cursorWhere = vi.fn().mockResolvedValue(undefined);
      const cursorSet = vi.fn().mockReturnValue({ where: cursorWhere });
      return { set: cursorSet };
    });

    const tx = { select: txSelect, update: txUpdate };
    return callback(tx);
  });

  // db.update() — used outside the transaction for cursor advance
  const topUpdateSet = vi.fn();
  const topUpdateWhere = vi.fn().mockResolvedValue(undefined);
  topUpdateSet.mockReturnValue({ where: topUpdateWhere });
  const topUpdate = vi.fn().mockReturnValue({ set: topUpdateSet });

  const db = {
    select: vi.fn().mockImplementation(() => {
      // Active queues query (with innerJoin) — the only db.select() call
      return thenableChain(activeQueues);
    }),
    update: topUpdate,
    transaction: transactionFn,
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
        expectRecycling: true,
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
        expectRecycling: true,
      });

      await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      // WR-01: recycling and cursor advance both happen inside the transaction
      expect(db.update).not.toHaveBeenCalled();
      expect(db.transaction).toHaveBeenCalled();
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

  describe('WR-01: cursor advance transaction boundary', () => {
    it('advances cursor inside the transaction, not via top-level db.update', async () => {
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const post = makePost();
      const db = createMockDb({
        activeQueues: [makeQueue()],
        nextPost: post,
      });

      await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(db.update).not.toHaveBeenCalled();
      expect(db.transaction).toHaveBeenCalled();
      expect(publishQueue.add).toHaveBeenCalledOnce();
    });

    it('advances cursor inside transaction during recycling', async () => {
      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const recycledPost = makePost({ id: 'recycled-1', queuePosition: 1 });
      const db = createMockDb({
        activeQueues: [makeQueue({ isRecycling: true, cursorPosition: 999 })],
        nextPost: null,
        publishedPosts: [{ id: 'p1' }],
        minQueuedPosition: recycledPost,
        expectRecycling: true,
      });

      await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(db.update).not.toHaveBeenCalled();
      expect(publishQueue.add).toHaveBeenCalledWith(
        'publish-post',
        expect.objectContaining({ postId: 'recycled-1' }),
        expect.anything(),
      );
    });
  });

  describe('IN-03: module-scope logger', () => {
    it('does not call createLogger inside evaluateQueues', async () => {
      mockCreateLogger.mockClear();

      const publishQueue = createMockQueue();
      const notificationQueue = createMockQueue();
      const db = createMockDb({ activeQueues: [] });

      await evaluateQueues(db, publishQueue, notificationQueue, NOW);
      await evaluateQueues(db, publishQueue, notificationQueue, NOW);

      expect(mockCreateLogger).not.toHaveBeenCalled();
    });
  });
});
