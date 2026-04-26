import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ----- Mocks BEFORE imports ---------------------------------------------

vi.mock('@sms/shared/logger', () => ({
  createLogger: () => ({
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
  }),
}));

// Simple column stub — drizzle operators below return opaque AST nodes
// that downstream code only uses for equality / presence checks.
vi.mock('@sms/db', () => ({
  socialProfiles: {
    id: 'col_id',
    userId: 'col_user_id',
    platform: 'col_platform',
    tokenStatus: 'col_token_status',
    tokenExpiresAt: 'col_token_expires_at',
    updatedAt: 'col_updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ type: 'eq', col, val })),
  ne: vi.fn((col: unknown, val: unknown) => ({ type: 'ne', col, val })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ type: 'inArray', col, vals })),
  sql: Object.assign(
    vi.fn((..._args: unknown[]) => ({ type: 'sql-tag' })),
    { raw: vi.fn((s: string) => ({ type: 'sql-raw', s })) },
  ),
}));

// Capture BullMQ Queue ctor args and expose a programmable add() spy.
const queueInstances: Array<{
  name: string;
  opts: unknown;
  upsertJobScheduler: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}> = [];

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    name: string;
    opts: unknown;
    upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    add = vi.fn().mockResolvedValue({ id: 'mock-job' });
    close = vi.fn().mockResolvedValue(undefined);
    constructor(name: string, opts: unknown) {
      this.name = name;
      this.opts = opts;
      queueInstances.push({
        name,
        opts,
        upsertJobScheduler: this.upsertJobScheduler,
        add: this.add,
        close: this.close,
      });
    }
  },
}));

// ----- End mocks ---------------------------------------------------------

import {
  startTokenRefreshScanner,
  scanTokenHealth,
} from '../token-refresh-scanner.js';
import { JOB_NAMES, QUEUE_NAMES } from '@sms/shared';

type SocialProfileRow = {
  id: string;
  userId: string;
  platform: 'linkedin' | 'facebook';
  tokenStatus: 'active' | 'expiring' | 'expired' | 'needs_reauth';
  tokenExpiresAt: Date | null;
};

/**
 * Build a db mock whose select().from().where() returns the given rows
 * and whose update().set().where().returning() returns a caller-specified
 * list (empty = rowsAffected 0, one row = rowsAffected 1).
 *
 * The update mock also captures the set payload so tests can assert the
 * transition ladder wrote the expected tokenStatus value.
 */
function createScannerMockDb(profiles: SocialProfileRow[]) {
  const updateCalls: Array<{ set: Record<string, unknown>; returning: unknown[] }> = [];

  // By default, every conditional UPDATE "succeeds" (one row affected).
  // Tests override this list by pushing expected returning values in order.
  const returningQueue: unknown[][] = [];

  const selectFn = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(profiles),
    }),
  }));

  const updateFn = vi.fn().mockImplementation(() => {
    const captured: { set: Record<string, unknown>; returning: unknown[] } = {
      set: {},
      returning: [],
    };
    updateCalls.push(captured);
    return {
      set: vi.fn().mockImplementation((patch: Record<string, unknown>) => {
        captured.set = patch;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => {
              const next = returningQueue.shift() ?? [{ id: 'mock-updated' }];
              captured.returning = next;
              return Promise.resolve(next);
            }),
          }),
        };
      }),
    };
  });

  const db = {
    select: selectFn,
    update: updateFn,
  } as never;

  return { db, updateCalls, returningQueue };
}

function makeLinkedInProfile(id: string, expiresIn_days: number, tokenStatus: SocialProfileRow['tokenStatus'] = 'active'): SocialProfileRow {
  return {
    id,
    userId: `user-${id}`,
    platform: 'linkedin',
    tokenStatus,
    tokenExpiresAt: new Date(Date.UTC(2026, 3, 23, 12, 0, 0) + expiresIn_days * 86_400_000),
  };
}

function makeFacebookProfile(id: string): SocialProfileRow {
  return {
    id,
    userId: `user-${id}`,
    platform: 'facebook',
    tokenStatus: 'active',
    tokenExpiresAt: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-23T12:00:00.000Z'));
  queueInstances.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startTokenRefreshScanner', () => {
  it('creates the token-refresh queue and registers the 03:00 UTC daily scheduler', async () => {
    const mockRedis = {} as never;
    const { tokenRefreshQueue } = await startTokenRefreshScanner({ redis: mockRedis });

    // Queue created with the correct name
    expect(queueInstances.length).toBe(1);
    expect(queueInstances[0]!.name).toBe(QUEUE_NAMES.tokenRefresh);

    // Scheduler registered at 03:00 UTC, daily
    expect(queueInstances[0]!.upsertJobScheduler).toHaveBeenCalledWith(
      'scan-token-health',
      { pattern: '0 3 * * *', tz: 'UTC' },
      expect.objectContaining({ name: JOB_NAMES.scanTokenHealth }),
    );

    // Returns the queue so the caller can enqueue ad-hoc jobs
    expect(tokenRefreshQueue).toBeDefined();
    expect((tokenRefreshQueue as unknown as { name: string }).name).toBe(QUEUE_NAMES.tokenRefresh);
  });
});

describe('scanTokenHealth', () => {
  const now = new Date('2026-04-23T12:00:00.000Z');

  it('LinkedIn expiring in 5 days transitions active -> expiring, emits one token_expiring_soon notification, enqueues refresh job', async () => {
    const profile = makeLinkedInProfile('p-li-1', 5, 'active');
    const { db, updateCalls, returningQueue } = createScannerMockDb([profile]);
    // Conditional UPDATE succeeds (rowsAffected = 1)
    returningQueue.push([{ id: profile.id }]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };
    const tokenRefreshQueue = { add: vi.fn().mockResolvedValue({ id: 'r1' }) };

    const result = await scanTokenHealth({
      db,
      tokenRefreshQueue: tokenRefreshQueue as never,
      notificationQueue: notificationQueue as never,
      now,
    });

    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0]!.set.tokenStatus).toBe('expiring');

    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
    expect(notificationQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.tokenExpiringSoon,
      expect.objectContaining({
        eventType: 'token_expiring_soon',
        profileId: profile.id,
        platform: 'linkedin',
      }),
    );

    expect(tokenRefreshQueue.add).toHaveBeenCalledTimes(1);
    expect(tokenRefreshQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.refreshOrPingToken,
      expect.objectContaining({ profileId: profile.id }),
      expect.objectContaining({ jobId: `refresh-${profile.id}-20260423` }),
    );

    expect(result.scanned).toBe(1);
    expect(result.enqueued).toBe(1);
    expect(result.transitionsToExpiring).toBe(1);
  });

  it('LinkedIn already tokenStatus=expiring: no UPDATE (conditional fails), no notification, still enqueues refresh job', async () => {
    const profile = makeLinkedInProfile('p-li-2', 3, 'expiring');
    const { db, updateCalls, returningQueue } = createScannerMockDb([profile]);
    // Conditional UPDATE fails (rowsAffected = 0)
    returningQueue.push([]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };
    const tokenRefreshQueue = { add: vi.fn().mockResolvedValue({ id: 'r1' }) };

    const result = await scanTokenHealth({
      db,
      tokenRefreshQueue: tokenRefreshQueue as never,
      notificationQueue: notificationQueue as never,
      now,
    });

    // UPDATE was attempted (conditional WHERE tokenStatus='active' fails silently)
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0]!.returning.length).toBe(0);
    // No notification emitted
    expect(notificationQueue.add).not.toHaveBeenCalled();
    // But refresh job still enqueued
    expect(tokenRefreshQueue.add).toHaveBeenCalledTimes(1);

    expect(result.transitionsToExpiring).toBe(0);
  });

  it('LinkedIn expired (tokenExpiresAt <= now): UPDATE to expired, emits token_reauth_required, does NOT enqueue refresh', async () => {
    const profile = makeLinkedInProfile('p-li-3', -1, 'active');
    const { db, updateCalls, returningQueue } = createScannerMockDb([profile]);
    returningQueue.push([{ id: profile.id }]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };
    const tokenRefreshQueue = { add: vi.fn().mockResolvedValue({ id: 'r1' }) };

    const result = await scanTokenHealth({
      db,
      tokenRefreshQueue: tokenRefreshQueue as never,
      notificationQueue: notificationQueue as never,
      now,
    });

    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0]!.set.tokenStatus).toBe('expired');

    expect(notificationQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.tokenReauthRequired,
      expect.objectContaining({ eventType: 'token_reauth_required', profileId: profile.id }),
    );
    // No refresh enqueue for expired tokens
    expect(tokenRefreshQueue.add).not.toHaveBeenCalled();

    expect(result.enqueued).toBe(0);
  });

  it('LinkedIn expiring more than 7 days from now: no UPDATE, no enqueue', async () => {
    const profile = makeLinkedInProfile('p-li-4', 30, 'active');
    const { db, updateCalls } = createScannerMockDb([profile]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };
    const tokenRefreshQueue = { add: vi.fn().mockResolvedValue({ id: 'r1' }) };

    const result = await scanTokenHealth({
      db,
      tokenRefreshQueue: tokenRefreshQueue as never,
      notificationQueue: notificationQueue as never,
      now,
    });

    expect(updateCalls.length).toBe(0);
    expect(notificationQueue.add).not.toHaveBeenCalled();
    expect(tokenRefreshQueue.add).not.toHaveBeenCalled();
    expect(result.scanned).toBe(1);
    expect(result.enqueued).toBe(0);
  });

  it('Facebook profile: always enqueues refresh-or-ping regardless of tokenExpiresAt', async () => {
    const profile = makeFacebookProfile('p-fb-1');
    const { db, updateCalls } = createScannerMockDb([profile]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };
    const tokenRefreshQueue = { add: vi.fn().mockResolvedValue({ id: 'r1' }) };

    await scanTokenHealth({
      db,
      tokenRefreshQueue: tokenRefreshQueue as never,
      notificationQueue: notificationQueue as never,
      now,
    });

    // No UPDATE for Facebook (state transitions happen in the worker)
    expect(updateCalls.length).toBe(0);
    expect(tokenRefreshQueue.add).toHaveBeenCalledTimes(1);
    expect(tokenRefreshQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.refreshOrPingToken,
      expect.objectContaining({ profileId: profile.id }),
      expect.objectContaining({ jobId: `refresh-${profile.id}-20260423` }),
    );
  });

  it('stable jobId deduplicates across scanner re-runs on the same UTC day', async () => {
    const profile = makeFacebookProfile('p-fb-dedupe');
    const { db } = createScannerMockDb([profile]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };
    // Second call simulates BullMQ's "duplicate jobId" throw by rejecting.
    const addMock = vi.fn()
      .mockResolvedValueOnce({ id: 'r1' })
      .mockRejectedValueOnce(Object.assign(new Error('Job already exists'), { code: 'DUPLICATE_JOB_ID' }));
    const tokenRefreshQueue = { add: addMock };

    // First pass
    const first = await scanTokenHealth({
      db,
      tokenRefreshQueue: tokenRefreshQueue as never,
      notificationQueue: notificationQueue as never,
      now,
    });
    expect(first.enqueued).toBe(1);

    // Second pass with the SAME `now` — add() rejects but scanner swallows
    const second = await scanTokenHealth({
      db,
      tokenRefreshQueue: tokenRefreshQueue as never,
      notificationQueue: notificationQueue as never,
      now,
    });

    // Both attempts were made (BullMQ gets the second add call with same jobId)
    expect(addMock).toHaveBeenCalledTimes(2);
    expect(addMock.mock.calls[0]![2]).toMatchObject({ jobId: `refresh-${profile.id}-20260423` });
    expect(addMock.mock.calls[1]![2]).toMatchObject({ jobId: `refresh-${profile.id}-20260423` });
    // Second pass reports 0 enqueued because the add was rejected
    expect(second.enqueued).toBe(0);
  });

  it('per-profile error does not abort the batch — other profiles still processed', async () => {
    const p1 = makeFacebookProfile('p-fb-a');
    const p2 = makeFacebookProfile('p-fb-b');
    const p3 = makeFacebookProfile('p-fb-c');
    const { db } = createScannerMockDb([p1, p2, p3]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };
    // Throw on profile 2; succeed on 1 and 3.
    const addMock = vi.fn()
      .mockResolvedValueOnce({ id: 'r1' })
      .mockRejectedValueOnce(new Error('redis blip'))
      .mockResolvedValueOnce({ id: 'r3' });
    const tokenRefreshQueue = { add: addMock };

    const result = await scanTokenHealth({
      db,
      tokenRefreshQueue: tokenRefreshQueue as never,
      notificationQueue: notificationQueue as never,
      now,
    });

    expect(addMock).toHaveBeenCalledTimes(3);
    expect(result.scanned).toBe(3);
    expect(result.enqueued).toBe(2);
  });
});
