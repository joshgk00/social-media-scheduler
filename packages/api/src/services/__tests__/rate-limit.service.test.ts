import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Settings } from 'luxon';

// Mock @sms/db so we can hand-craft the select chain. Drizzle's query builder
// is chainable, so each test builds the exact pipeline it needs.
// vi.mock is hoisted above imports, so table stubs must be built inside
// the factory to avoid ReferenceErrors during hoisting.
vi.mock('@sms/db', () => {
  function makeColumnStub(name: string) {
    return { name, fieldAlias: name };
  }
  function makeTableStub(tableName: string, columns: string[]) {
    const table: Record<string, unknown> = { _: { name: tableName } };
    for (const col of columns) {
      table[col] = makeColumnStub(col);
    }
    return table;
  }
  return {
    socialProfiles: makeTableStub('social_profiles', [
      'id',
      'monthlyTweetBudget',
      'warnThresholdPercent',
    ]),
    posts: makeTableStub('posts', [
      'id',
      'profileId',
      'status',
      'publishedAt',
    ]),
  };
});

// Import under test AFTER mocks are declared.
import {
  loadTwitterUsage,
  checkTwitterBudgetWithDb,
  checkBulkBudgetWithDb,
} from '../rate-limit.service.js';

// -----------------------------------------------------------------------------
// Helpers: build a mocked Drizzle `db.select().from().where()` pipeline where
// the first select resolves to `profileRows` and the second resolves to
// `postsCountRows`. Returns a `db` object that satisfies the two chained
// selects inside `loadTwitterUsage`.
// -----------------------------------------------------------------------------
interface MockDbOptions {
  profileRows: Array<{ monthlyBudget: number; warnThresholdPercent: number }>;
  countRows: Array<{ publishedCount: number }>;
}

function createMockDb(options: MockDbOptions) {
  let selectCallCount = 0;

  function makeSelectChain(resolved: unknown[]) {
    const chain: Record<string, unknown> = {};
    // Drizzle chains: .from().where() — each returns the chain, and the
    // chain is thenable so `await` resolves with the row array.
    (chain as { from: () => unknown }).from = vi.fn().mockReturnValue(chain);
    (chain as { where: () => unknown }).where = vi.fn().mockReturnValue(chain);
    (chain as { then: (resolve: (v: unknown) => void) => void }).then = (
      resolve,
    ) => resolve(resolved);
    return chain;
  }

  const select = vi.fn().mockImplementation(() => {
    selectCallCount += 1;
    if (selectCallCount === 1) {
      return makeSelectChain(options.profileRows);
    }
    return makeSelectChain(options.countRows);
  });

  return {
    select,
    // Expose for assertions if a test wants them.
    _selectCallCount: () => selectCallCount,
  } as unknown as Parameters<typeof loadTwitterUsage>[0] & {
    _selectCallCount: () => number;
  };
}

describe('rate-limit service', () => {
  // Pin clock to 2026-04-15 12:00 UTC so every test sees the same month boundary
  // (2026-04-01 00:00 UTC).
  const PINNED_NOW = new Date('2026-04-15T12:00:00Z').getTime();

  beforeEach(() => {
    Settings.now = () => PINNED_NOW;
  });

  afterEach(() => {
    Settings.now = () => Date.now();
    vi.clearAllMocks();
  });

  describe('loadTwitterUsage', () => {
    it('returns currentUsage 0 when no matching posts exist', async () => {
      const db = createMockDb({
        profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
        countRows: [{ publishedCount: 0 }],
      });

      const snapshot = await loadTwitterUsage(db, 'profile-uuid');

      expect(snapshot.currentUsage).toBe(0);
      expect(snapshot.monthlyBudget).toBe(500);
      expect(snapshot.warnThresholdPercent).toBe(80);
      expect(snapshot.monthStartUtc).toEqual(new Date('2026-04-01T00:00:00Z'));
    });

    it('throws when the profile does not exist', async () => {
      const db = createMockDb({
        profileRows: [],
        countRows: [],
      });

      await expect(loadTwitterUsage(db, 'missing-profile')).rejects.toThrow(
        /Profile missing-profile not found/,
      );
    });

    // Issue #35 regression coverage. The Twitter monthly window is a UTC
    // calendar month; the reset date is the start of the NEXT calendar month
    // and must always be strictly in the future relative to `now`.
    describe('monthResetAtUtc (issue #35)', () => {
      it('mid-month: returns the start of the next month', async () => {
        const db = createMockDb({
          profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
          countRows: [{ publishedCount: 0 }],
        });
        const now = new Date('2026-05-13T12:00:00Z');

        const snapshot = await loadTwitterUsage(db, 'profile-uuid', now);

        expect(snapshot.monthStartUtc).toEqual(new Date('2026-05-01T00:00:00Z'));
        expect(snapshot.monthResetAtUtc).toEqual(
          new Date('2026-06-01T00:00:00Z'),
        );
        expect(snapshot.monthResetAtUtc.getTime()).toBeGreaterThan(now.getTime());
      });

      it('last day of month: returns the first of the following month', async () => {
        const db = createMockDb({
          profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
          countRows: [{ publishedCount: 0 }],
        });
        // 23:59:59 on the last day of March — last possible moment of the
        // March window. Reset must still be the start of April, not March.
        const now = new Date('2026-03-31T23:59:59Z');

        const snapshot = await loadTwitterUsage(db, 'profile-uuid', now);

        expect(snapshot.monthStartUtc).toEqual(new Date('2026-03-01T00:00:00Z'));
        expect(snapshot.monthResetAtUtc).toEqual(
          new Date('2026-04-01T00:00:00Z'),
        );
        expect(snapshot.monthResetAtUtc.getTime()).toBeGreaterThan(now.getTime());
      });

      it('just past a prior month boundary: reset is current month\'s end, not the boundary that just passed', async () => {
        const db = createMockDb({
          profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
          countRows: [{ publishedCount: 0 }],
        });
        // One second after the May boundary. Reset must roll forward to
        // June — the prior boundary (May 1) is already in the past and must
        // never be reported as the next reset.
        const now = new Date('2026-05-01T00:00:01Z');

        const snapshot = await loadTwitterUsage(db, 'profile-uuid', now);

        expect(snapshot.monthStartUtc).toEqual(new Date('2026-05-01T00:00:00Z'));
        expect(snapshot.monthResetAtUtc).toEqual(
          new Date('2026-06-01T00:00:00Z'),
        );
        expect(snapshot.monthResetAtUtc.getTime()).toBeGreaterThan(now.getTime());
      });

      it('rolls over December → January of next year', async () => {
        const db = createMockDb({
          profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
          countRows: [{ publishedCount: 0 }],
        });
        const now = new Date('2026-12-15T08:00:00Z');

        const snapshot = await loadTwitterUsage(db, 'profile-uuid', now);

        expect(snapshot.monthStartUtc).toEqual(new Date('2026-12-01T00:00:00Z'));
        expect(snapshot.monthResetAtUtc).toEqual(
          new Date('2027-01-01T00:00:00Z'),
        );
      });

      it('propagates monthResetAtUtc through checkTwitterBudgetWithDb', async () => {
        const db = createMockDb({
          profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
          countRows: [{ publishedCount: 10 }],
        });
        const now = new Date('2026-05-13T12:00:00Z');

        const result = await checkTwitterBudgetWithDb(db, {
          profileId: 'profile-uuid',
          additionalPostCount: 1,
          now,
        });

        expect(result.monthResetAtUtc).toEqual(new Date('2026-06-01T00:00:00Z'));
        expect(result.monthResetAtUtc.getTime()).toBeGreaterThan(now.getTime());
      });
    });
  });

  describe('checkTwitterBudgetWithDb', () => {
    it('returns wouldExceed + blockThresholdHit when currentUsage >= budget', async () => {
      const db = createMockDb({
        profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
        countRows: [{ publishedCount: 500 }],
      });

      const result = await checkTwitterBudgetWithDb(db, {
        profileId: 'profile-uuid',
        additionalPostCount: 1,
      });

      expect(result.wouldExceed).toBe(true);
      expect(result.blockThresholdHit).toBe(true);
      expect(result.currentUsage).toBe(500);
      expect(result.projectedCount).toBe(501);
      expect(result.monthStartUtc).toEqual(new Date('2026-04-01T00:00:00Z'));
    });

    it('returns warnThresholdHit but not block in the warn band', async () => {
      const db = createMockDb({
        profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
        // 80% of 500 = 400 warn threshold; 450 > 400 so warn hits but 451 < 500
        // so block does not.
        countRows: [{ publishedCount: 450 }],
      });

      const result = await checkTwitterBudgetWithDb(db, {
        profileId: 'profile-uuid',
        additionalPostCount: 1,
      });

      expect(result.warnThresholdHit).toBe(true);
      expect(result.blockThresholdHit).toBe(false);
      expect(result.wouldExceed).toBe(false);
      expect(result.remainingBudget).toBe(50);
    });

    it('projects correctly when additionalPostCount > 1', async () => {
      const db = createMockDb({
        profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
        countRows: [{ publishedCount: 100 }],
      });

      const result = await checkTwitterBudgetWithDb(db, {
        profileId: 'profile-uuid',
        additionalPostCount: 2,
      });

      expect(result.currentUsage).toBe(100);
      expect(result.projectedCount).toBe(102);
      expect(result.wouldExceed).toBe(false);
    });

    it('uses the pinned month boundary for monthStartUtc', async () => {
      const db = createMockDb({
        profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
        countRows: [{ publishedCount: 10 }],
      });

      const result = await checkTwitterBudgetWithDb(db, {
        profileId: 'profile-uuid',
        additionalPostCount: 1,
      });

      // Month start for 2026-04-15 UTC is 2026-04-01 00:00:00 UTC.
      expect(result.monthStartUtc).toEqual(new Date('2026-04-01T00:00:00Z'));
    });

    it('relies on the query to filter by counted statuses (status filter integration)', async () => {
      // The actual status filter happens in SQL via inArray. This test
      // documents the contract: the service trusts the query's filter, so
      // the countRow returned by the mock is already the filtered count.
      // Passing a published count of 3 while there are "really" many other
      // non-counted posts proves the service does not post-process.
      const db = createMockDb({
        profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
        countRows: [{ publishedCount: 3 }],
      });

      const result = await checkTwitterBudgetWithDb(db, {
        profileId: 'profile-uuid',
        additionalPostCount: 1,
      });

      expect(result.currentUsage).toBe(3);
      expect(result.projectedCount).toBe(4);
      expect(result.wouldExceed).toBe(false);
      expect(result.warnThresholdHit).toBe(false);
    });

    it('throws if profile is not found', async () => {
      const db = createMockDb({
        profileRows: [],
        countRows: [{ publishedCount: 0 }],
      });

      await expect(
        checkTwitterBudgetWithDb(db, {
          profileId: 'missing',
          additionalPostCount: 1,
        }),
      ).rejects.toThrow(/Profile missing not found/);
    });
  });

  describe('checkBulkBudgetWithDb (LIMIT-05 contract)', () => {
    it('delegates to checkBulkBudget and returns wouldExceed true when 460 + 50 > 500', async () => {
      // LIMIT-05 acceptance case from revision Blocker 2.
      const db = createMockDb({
        profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
        countRows: [{ publishedCount: 460 }],
      });

      const result = await checkBulkBudgetWithDb(db, {
        profileId: 'profile-uuid',
        additionalCount: 50,
      });

      expect(result.wouldExceed).toBe(true);
      expect(result.blockThresholdHit).toBe(true);
      expect(result.currentUsage).toBe(460);
      expect(result.projectedCount).toBe(510);
      expect(result.remainingBudget).toBe(40);
      expect(result.monthStartUtc).toEqual(new Date('2026-04-01T00:00:00Z'));
    });

    it('allows a bulk batch that fits exactly inside the remaining budget', async () => {
      const db = createMockDb({
        profileRows: [{ monthlyBudget: 500, warnThresholdPercent: 80 }],
        countRows: [{ publishedCount: 460 }],
      });

      const result = await checkBulkBudgetWithDb(db, {
        profileId: 'profile-uuid',
        additionalCount: 40,
      });

      expect(result.wouldExceed).toBe(false);
      expect(result.blockThresholdHit).toBe(true);
      expect(result.projectedCount).toBe(500);
    });
  });
});
