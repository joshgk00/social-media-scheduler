import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger before any imports that use it
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

vi.mock('@sms/db', () => ({
  postMedia: {
    id: 'mock_id_col',
    deletedAt: 'mock_deleted_at_col',
    postId: 'mock_post_id_col',
    createdAt: 'mock_created_at_col',
    filePath: 'mock_file_path_col',
    thumbnailPath: 'mock_thumbnail_path_col',
  },
}));

vi.mock('@sms/shared/storage', () => ({
  createStorageBackend: vi.fn(),
}));

// Capture the processor function from BullMQ Worker constructor
let capturedProcessor: ((job: unknown) => Promise<void>) | null = null;
let capturedQueueName: string | null = null;

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    name: string;
    opts: unknown;
    constructor(name: string, processor: unknown, opts: unknown) {
      this.name = name;
      this.opts = opts;
      capturedProcessor = processor as (job: unknown) => Promise<void>;
      capturedQueueName = name;
    }
    on() { return this; }
    close() { return Promise.resolve(); }
  },
  Queue: class MockQueue {
    name: string;
    opts: unknown;
    upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    constructor(name: string, opts: unknown) {
      this.name = name;
      this.opts = opts;
    }
  },
}));

// Drizzle operator mocks -- these will be checked by implementation
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNotNull: vi.fn((col: unknown) => ({ type: 'isNotNull', col })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  lt: vi.fn((col: unknown, val: unknown) => ({ type: 'lt', col, val })),
  eq: vi.fn((col: unknown, val: unknown) => ({ type: 'eq', col, val })),
}));

import type { StorageBackend } from '@sms/shared/storage';

function createMockDb() {
  const whereResult = {
    rows: [] as Record<string, unknown>[],
  };

  const deleteFn = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });

  const selectFn = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(whereResult.rows),
    }),
  });

  return {
    db: {
      select: selectFn,
      delete: deleteFn,
    },
    selectFn,
    deleteFn,
    whereResult,
  };
}

function createMockStorage(): StorageBackend & { delete: ReturnType<typeof vi.fn> } {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(Buffer.from('data')),
    delete: vi.fn().mockResolvedValue(undefined),
    getUrl: vi.fn().mockImplementation((key: string) => `/media/${key}`),
    exists: vi.fn().mockResolvedValue(true),
  };
}

describe('createMediaCleanupWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedQueueName = null;
  });

  it('creates a worker consuming the media-cleanup queue', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db } = createMockDb();
    const mockStorage = createMockStorage();

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });
    expect(capturedQueueName).toBe('media-cleanup');
  });

  it('deletes post_media rows with deleted_at older than 30 days', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db, deleteFn } = createMockDb();
    const mockStorage = createMockStorage();

    // Set up expired rows to return from select
    const expiredRows = [
      { id: 'media-1', filePath: 'media/p1/2026/01/abc.jpg', thumbnailPath: 'media/p1/2026/01/abc_thumb.jpg' },
    ];

    // Mock the first select().from().where() call (expired soft-deleted)
    const expiredWhereHandler = vi.fn().mockResolvedValue(expiredRows);
    // Mock the second select().from().where() call (orphans)
    const orphanWhereHandler = vi.fn().mockResolvedValue([]);

    let selectCallCount = 0;
    db.select.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: () => {
          selectCallCount++;
          if (selectCallCount === 1) return expiredWhereHandler();
          return orphanWhereHandler();
        },
      })),
    }));

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });
    expect(capturedProcessor).not.toBeNull();

    await capturedProcessor!({ data: {} });

    expect(deleteFn).toHaveBeenCalled();
  });

  it('calls storage.delete() for both filePath and thumbnailPath', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db } = createMockDb();
    const mockStorage = createMockStorage();

    const expiredRows = [
      { id: 'media-1', filePath: 'media/p1/2026/01/abc.jpg', thumbnailPath: 'media/p1/2026/01/abc_thumb.jpg' },
    ];

    let selectCallCount = 0;
    db.select.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: () => {
          selectCallCount++;
          if (selectCallCount === 1) return Promise.resolve(expiredRows);
          return Promise.resolve([]);
        },
      })),
    }));

    db.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });
    await capturedProcessor!({ data: {} });

    expect(mockStorage.delete).toHaveBeenCalledWith('media/p1/2026/01/abc.jpg');
    expect(mockStorage.delete).toHaveBeenCalledWith('media/p1/2026/01/abc_thumb.jpg');
  });

  it('cleans up orphaned uploads (postId IS NULL, created_at > 24 hours)', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db, deleteFn } = createMockDb();
    const mockStorage = createMockStorage();

    const orphanRows = [
      { id: 'orphan-1', filePath: 'media/p2/2026/01/orphan.mp4', thumbnailPath: null },
    ];

    let selectCallCount = 0;
    db.select.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: () => {
          selectCallCount++;
          if (selectCallCount === 1) return Promise.resolve([]);
          return Promise.resolve(orphanRows);
        },
      })),
    }));

    db.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });
    await capturedProcessor!({ data: {} });

    expect(mockStorage.delete).toHaveBeenCalledWith('media/p2/2026/01/orphan.mp4');
    expect(deleteFn).toHaveBeenCalled();
  });

  it('does NOT delete soft-deleted files newer than 30 days', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db, deleteFn } = createMockDb();
    const mockStorage = createMockStorage();

    // Both queries return empty (no rows match)
    db.select.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    }));

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });
    await capturedProcessor!({ data: {} });

    expect(mockStorage.delete).not.toHaveBeenCalled();
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('handles storage.delete() failure gracefully and continues', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db } = createMockDb();
    const mockStorage = createMockStorage();

    const expiredRows = [
      { id: 'media-1', filePath: 'fail/path.jpg', thumbnailPath: null },
      { id: 'media-2', filePath: 'ok/path.jpg', thumbnailPath: null },
    ];

    let selectCallCount = 0;
    db.select.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: () => {
          selectCallCount++;
          if (selectCallCount === 1) return Promise.resolve(expiredRows);
          return Promise.resolve([]);
        },
      })),
    }));

    db.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    // First call fails, second succeeds
    mockStorage.delete
      .mockRejectedValueOnce(new Error('Storage unreachable'))
      .mockResolvedValue(undefined);

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });

    // Should not throw
    await expect(capturedProcessor!({ data: {} })).resolves.toBeUndefined();

    // Both files attempted
    expect(mockStorage.delete).toHaveBeenCalledWith('fail/path.jpg');
    expect(mockStorage.delete).toHaveBeenCalledWith('ok/path.jpg');
  });
});

describe('startMediaCleanupScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a repeatable job with cron pattern 0 3 * * 0 and tz UTC', async () => {
    const { startMediaCleanupScheduler } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;

    const { cleanupQueue } = await startMediaCleanupScheduler(mockRedis);

    expect(cleanupQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'weekly-media-cleanup',
      { pattern: '0 3 * * 0', tz: 'UTC' },
      { name: 'media-cleanup', data: {} },
    );
  });
});
