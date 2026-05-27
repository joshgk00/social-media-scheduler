import { describe, it, expect, vi, beforeEach } from 'vitest';

const logMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock logger before any imports that use it
vi.mock('@sms/shared/logger', () => ({
  createLogger: () => ({
    info: logMocks.info,
    warn: logMocks.warn,
    error: logMocks.error,
    child: () => logMocks,
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

vi.mock('@sms/shared', () => ({
  QUEUE_NAMES: {
    mediaCleanup: 'media-cleanup',
  },
  JOB_NAMES: {
    mediaCleanupScheduler: 'weekly-media-cleanup',
    mediaCleanup: 'media-cleanup',
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
  gt: vi.fn((col: unknown, val: unknown) => ({ type: 'gt', col, val })),
  eq: vi.fn((col: unknown, val: unknown) => ({ type: 'eq', col, val })),
  inArray: vi.fn((col: unknown, vals: unknown[]) => ({ type: 'inArray', col, vals })),
  asc: vi.fn((col: unknown) => ({ type: 'asc', col })),
}));

import type { StorageBackend } from '@sms/shared/storage';

type MockRows = Record<string, unknown>[];

function createSelectQuery(rows: MockRows) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });

  return {
    query: { from },
    from,
    where,
    orderBy,
    limit,
  };
}

function createMockDb() {
  const whereResult = {
    rows: [] as Record<string, unknown>[],
  };

  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const deleteFn = vi.fn().mockReturnValue({
    where: deleteWhere,
  });

  const selectFn = vi.fn(() => createSelectQuery(whereResult.rows).query);

  return {
    db: {
      select: selectFn,
      delete: deleteFn,
    },
    selectFn,
    deleteFn,
    deleteWhere,
    whereResult,
  };
}

function mockSelectBatches(
  db: ReturnType<typeof createMockDb>['db'],
  batches: MockRows[],
) {
  const pendingBatches = [...batches];
  const queries: ReturnType<typeof createSelectQuery>[] = [];

  db.select.mockImplementation(() => {
    const query = createSelectQuery(pendingBatches.shift() ?? []);
    queries.push(query);
    return query.query;
  });

  return queries;
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

    mockSelectBatches(db, [expiredRows, [], []]);

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

    mockSelectBatches(db, [expiredRows, [], []]);

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

    mockSelectBatches(db, [[], orphanRows, []]);

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

    // Both cleanup loops return empty (no rows match)
    mockSelectBatches(db, [[], []]);

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });
    await capturedProcessor!({ data: {} });

    expect(mockStorage.delete).not.toHaveBeenCalled();
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('logs and accepts unreachable storage files after database row deletion succeeds', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db } = createMockDb();
    const mockStorage = createMockStorage();

    const expiredRows = [
      { id: 'media-1', filePath: 'fail/path.jpg', thumbnailPath: null },
      { id: 'media-2', filePath: 'ok/path.jpg', thumbnailPath: null },
    ];

    mockSelectBatches(db, [expiredRows, [], []]);

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });

    // First call fails, second succeeds
    mockStorage.delete
      .mockRejectedValueOnce(new Error('Storage unreachable'))
      .mockResolvedValue(undefined);

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });

    // Should not throw
    await expect(capturedProcessor!({ data: {} })).resolves.toBeUndefined();

    // Both files attempted
    expect(deleteWhere).toHaveBeenCalledWith({
      type: 'inArray',
      col: 'mock_id_col',
      vals: ['media-1', 'media-2'],
    });
    expect(deleteWhere.mock.invocationCallOrder[0]).toBeLessThan(
      mockStorage.delete.mock.invocationCallOrder[0],
    );
    expect(mockStorage.delete).toHaveBeenCalledWith('fail/path.jpg');
    expect(mockStorage.delete).toHaveBeenCalledWith('ok/path.jpg');
    expect(logMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ mediaId: 'media-1', filePath: 'fail/path.jpg' }),
      'Failed to delete file from storage, continuing',
    );
  });

  it('deletes expired media rows in one batch before deleting storage files', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db } = createMockDb();
    const mockStorage = createMockStorage();

    const expiredRows = [
      { id: 'media-1', filePath: 'media/p1/2026/01/abc.jpg', thumbnailPath: null },
      { id: 'media-2', filePath: 'media/p1/2026/01/def.jpg', thumbnailPath: null },
    ];

    mockSelectBatches(db, [expiredRows, [], []]);

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });
    await capturedProcessor!({ data: {} });

    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledWith({
      type: 'inArray',
      col: 'mock_id_col',
      vals: ['media-1', 'media-2'],
    });
    expect(deleteWhere.mock.invocationCallOrder[0]).toBeLessThan(
      mockStorage.delete.mock.invocationCallOrder[0],
    );
    expect(mockStorage.delete).toHaveBeenCalledWith('media/p1/2026/01/abc.jpg');
    expect(mockStorage.delete).toHaveBeenCalledWith('media/p1/2026/01/def.jpg');
  });

  it('uses 200-row id-cursor batches for cleanup selects', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db } = createMockDb();
    const mockStorage = createMockStorage();

    const queries = mockSelectBatches(db, [
      [
        { id: 'media-1', filePath: 'media/p1/2026/01/abc.jpg', thumbnailPath: null },
        { id: 'media-2', filePath: 'media/p1/2026/01/def.jpg', thumbnailPath: null },
      ],
      [],
      [
        { id: 'orphan-1', filePath: 'media/p2/2026/01/orphan-a.jpg', thumbnailPath: null },
        { id: 'orphan-2', filePath: 'media/p2/2026/01/orphan-b.jpg', thumbnailPath: null },
      ],
      [],
    ]);

    db.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });
    await capturedProcessor!({ data: {} });

    expect(queries).toHaveLength(4);
    for (const query of queries) {
      expect(query.limit).toHaveBeenCalledWith(200);
    }
    expect(queries[1].where).toHaveBeenCalledWith(expect.objectContaining({
      args: expect.arrayContaining([
        { type: 'gt', col: 'mock_id_col', val: 'media-2' },
      ]),
    }));
    expect(queries[3].where).toHaveBeenCalledWith(expect.objectContaining({
      args: expect.arrayContaining([
        { type: 'gt', col: 'mock_id_col', val: 'orphan-2' },
      ]),
    }));
  });

  it('continues expired media cleanup when a batch database delete fails', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db } = createMockDb();
    const mockStorage = createMockStorage();

    const expiredRows = [
      { id: 'media-1', filePath: 'batch-1/path-a.jpg', thumbnailPath: null },
      { id: 'media-2', filePath: 'batch-1/path-b.jpg', thumbnailPath: null },
    ];
    const nextExpiredRows = [
      { id: 'media-3', filePath: 'batch-2/path-c.jpg', thumbnailPath: null },
    ];

    mockSelectBatches(db, [expiredRows, nextExpiredRows, [], []]);

    const deleteWhere = vi.fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });

    await expect(capturedProcessor!({ data: {} })).resolves.toBeUndefined();

    expect(deleteWhere).toHaveBeenCalledTimes(2);
    expect(deleteWhere).toHaveBeenNthCalledWith(1, {
      type: 'inArray',
      col: 'mock_id_col',
      vals: ['media-1', 'media-2'],
    });
    expect(deleteWhere).toHaveBeenNthCalledWith(2, {
      type: 'inArray',
      col: 'mock_id_col',
      vals: ['media-3'],
    });
    expect(mockStorage.delete).not.toHaveBeenCalledWith('batch-1/path-a.jpg');
    expect(mockStorage.delete).not.toHaveBeenCalledWith('batch-1/path-b.jpg');
    expect(mockStorage.delete).toHaveBeenCalledWith('batch-2/path-c.jpg');
    expect(logMocks.warn).toHaveBeenCalledWith(
      {
        firstMediaId: 'media-1',
        lastMediaId: 'media-2',
        mediaCount: 2,
      },
      'Skipping expired media batch after database delete failure',
    );
  });

  it('deletes orphan rows in one batch before storage even when storage deletion fails', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db } = createMockDb();
    const mockStorage = createMockStorage();

    const orphanRows = [
      { id: 'orphan-1', filePath: 'fail/orphan.jpg', thumbnailPath: null },
      { id: 'orphan-2', filePath: 'ok/orphan.jpg', thumbnailPath: null },
    ];

    mockSelectBatches(db, [[], orphanRows, []]);

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });
    mockStorage.delete
      .mockRejectedValueOnce(new Error('Storage unreachable'))
      .mockResolvedValue(undefined);

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });

    await expect(capturedProcessor!({ data: {} })).resolves.toBeUndefined();

    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledWith({
      type: 'inArray',
      col: 'mock_id_col',
      vals: ['orphan-1', 'orphan-2'],
    });
    expect(mockStorage.delete).toHaveBeenCalledWith('fail/orphan.jpg');
    expect(mockStorage.delete).toHaveBeenCalledWith('ok/orphan.jpg');
    expect(deleteWhere.mock.invocationCallOrder[0]).toBeLessThan(
      mockStorage.delete.mock.invocationCallOrder[0],
    );
    expect(logMocks.info).toHaveBeenCalledWith(
      { mediaId: 'orphan-1', filePath: 'fail/orphan.jpg' },
      'Permanently deleted orphaned media',
    );
    expect(logMocks.info).toHaveBeenCalledWith(
      { mediaId: 'orphan-2', filePath: 'ok/orphan.jpg' },
      'Permanently deleted orphaned media',
    );
  });

  it('logs skipped orphan cursor range when an orphan batch database delete fails', async () => {
    const { createMediaCleanupWorker } = await import('../media-cleanup-worker.js');
    const mockRedis = {} as never;
    const { db } = createMockDb();
    const mockStorage = createMockStorage();

    const orphanRows = [
      { id: 'orphan-1', filePath: 'batch-1/orphan-a.jpg', thumbnailPath: null },
      { id: 'orphan-2', filePath: 'batch-1/orphan-b.jpg', thumbnailPath: null },
    ];
    const nextOrphanRows = [
      { id: 'orphan-3', filePath: 'batch-2/orphan-c.jpg', thumbnailPath: null },
    ];

    mockSelectBatches(db, [[], orphanRows, nextOrphanRows, []]);

    const deleteWhere = vi.fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });

    createMediaCleanupWorker({ redis: mockRedis, db: db as never, storage: mockStorage });

    await expect(capturedProcessor!({ data: {} })).resolves.toBeUndefined();

    expect(mockStorage.delete).not.toHaveBeenCalledWith('batch-1/orphan-a.jpg');
    expect(mockStorage.delete).not.toHaveBeenCalledWith('batch-1/orphan-b.jpg');
    expect(mockStorage.delete).toHaveBeenCalledWith('batch-2/orphan-c.jpg');
    expect(logMocks.warn).toHaveBeenCalledWith(
      {
        firstMediaId: 'orphan-1',
        lastMediaId: 'orphan-2',
        mediaCount: 2,
      },
      'Skipping orphan media batch after database delete failure',
    );
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
