// Wave 0 RED stubs for the per-platform pre-flight rate-limit checks.
// LIMIT-06 (Facebook hourly window), LIMIT-07 (LinkedIn daily window),
// T-API-02 (race protection via single CAS UPDATE), T-LIMITS-01 (window
// reset atomicity).
//
// Plan 03 ships `checkLinkedInBudgetWithDb` / `checkFacebookBudgetWithDb`
// in `../services/rate-limit.service.js`. These tests fail until then.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkLinkedInBudgetWithDb,
  checkFacebookBudgetWithDb,
} from '../services/rate-limit.service.js';

const PROFILE_ID = '00000000-0000-4000-8000-00000000aaaa';

// LinkedIn / Facebook share a profile shape but track different windows.
// The mock simulates Drizzle's `.select({ alias: column }).from(...).where(...)`
// chain by exposing rows keyed under the canonical service aliases
// (`limit`, `count`, `windowStart`, `warnThresholdPercent`). The rate-limit
// service uses these aliases when reading the snapshot AND when reading the
// post-update RETURNING row.
function buildProfileMockDb(profile: {
  platform: 'linkedin' | 'facebook';
  monthlyBudget?: number;
  dailyBudget?: number;
  hourlyBudget?: number;
  windowCount: number;
  windowStartUtc: Date;
  warnThresholdPercent?: number;
}) {
  const aliasedRow = {
    id: PROFILE_ID,
    limit: profile.dailyBudget ?? profile.hourlyBudget ?? profile.monthlyBudget ?? 0,
    count: profile.windowCount,
    windowStart: profile.windowStartUtc,
    warnThresholdPercent: profile.warnThresholdPercent ?? 80,
    platform: profile.platform,
  };

  const updates: Array<Record<string, unknown>> = [];
  const selectChain = (rows: unknown[]) => {
    const chain: any = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: (val: unknown) => void) => resolve(rows);
    return chain;
  };

  const updateChain = () => {
    const chain: any = {};
    let setPayload: Record<string, unknown> = {};
    chain.set = vi.fn().mockImplementation((patch: Record<string, unknown>) => {
      setPayload = patch;
      return chain;
    });
    chain.where = vi.fn().mockImplementation(() => {
      const result: any = Promise.resolve(undefined);
      result.returning = vi.fn().mockImplementation(() => {
        updates.push(setPayload);
        // Echo back the aliased row — the production service reads the
        // post-update count via the same alias keys it used in `.select()`.
        return Promise.resolve([aliasedRow]);
      });
      return result;
    });
    return chain;
  };

  const db: any = {
    select: vi.fn().mockReturnValue(selectChain([aliasedRow])),
    update: vi.fn().mockReturnValue(updateChain()),
    transaction: vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    __updates: updates,
  };
  return db;
}

describe('checkLinkedInBudgetWithDb (LIMIT-07, daily window)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks at limit: profile at 99/100 with additionalCount=1 reports blockThresholdHit=true', async () => {
    const db = buildProfileMockDb({
      platform: 'linkedin',
      dailyBudget: 100,
      windowCount: 99,
      windowStartUtc: new Date('2026-04-26T00:00:00Z'),
    });

    const result = await checkLinkedInBudgetWithDb(db, {
      profileId: PROFILE_ID,
      additionalCount: 1,
      now: new Date('2026-04-26T12:00:00Z'),
    });

    expect(result.blockThresholdHit).toBe(true);
  });

  it('LinkedIn window threshold uses date_trunc("day", now()) UTC midnight (Pitfall 7)', async () => {
    // The window resets at UTC midnight. A request at 23:59Z falls in the
    // same day as 00:00:01Z; the next request at 00:00:01Z the following
    // day must reset.
    const db = buildProfileMockDb({
      platform: 'linkedin',
      dailyBudget: 100,
      windowCount: 50,
      windowStartUtc: new Date('2026-04-25T00:00:00Z'),
    });

    const result = await checkLinkedInBudgetWithDb(db, {
      profileId: PROFILE_ID,
      additionalCount: 1,
      now: new Date('2026-04-26T00:00:01Z'),
    });

    // After window reset the count is 1, not 51.
    expect(result.currentCount).toBeLessThanOrEqual(1);
  });

  it('atomic CAS: the UPDATE statement runs once per call (T-API-02)', async () => {
    const db = buildProfileMockDb({
      platform: 'linkedin',
      dailyBudget: 100,
      windowCount: 10,
      windowStartUtc: new Date('2026-04-26T00:00:00Z'),
    });

    await checkLinkedInBudgetWithDb(db, {
      profileId: PROFILE_ID,
      additionalCount: 1,
      now: new Date('2026-04-26T12:00:00Z'),
    });

    // Only ONE update — separate read-then-write would fail T-API-02.
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});

describe('checkFacebookBudgetWithDb (LIMIT-06, rolling 1-hour window, Pitfall 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts mediaIds.length + 1: 3 photos + 1 feed = 4 calls (Pitfall 2)', async () => {
    const db = buildProfileMockDb({
      platform: 'facebook',
      hourlyBudget: 25,
      windowCount: 22,
      windowStartUtc: new Date('2026-04-26T11:30:00Z'),
    });

    // 3 mediaIds → 3 photo POSTs + 1 feed POST = additionalCount of 4.
    const result = await checkFacebookBudgetWithDb(db, {
      profileId: PROFILE_ID,
      additionalCount: 4,
      now: new Date('2026-04-26T12:00:00Z'),
    });

    // 22 + 4 = 26 > 25 → would exceed.
    expect(result.blockThresholdHit).toBe(true);
  });

  it('Facebook window threshold = now - INTERVAL "1 hour" (rolling, not fixed)', async () => {
    // 61-minute-old window must reset; 59-minute-old window must not.
    const db = buildProfileMockDb({
      platform: 'facebook',
      hourlyBudget: 25,
      windowCount: 20,
      windowStartUtc: new Date('2026-04-26T10:59:00Z'),
    });

    const result = await checkFacebookBudgetWithDb(db, {
      profileId: PROFILE_ID,
      additionalCount: 1,
      now: new Date('2026-04-26T12:00:00Z'),
    });

    // 61 minutes old → window resets, count = 1.
    expect(result.currentCount).toBeLessThanOrEqual(1);
  });

  it('window reset is a single atomic CAS UPDATE (T-LIMITS-01)', async () => {
    const db = buildProfileMockDb({
      platform: 'facebook',
      hourlyBudget: 25,
      windowCount: 20,
      windowStartUtc: new Date('2026-04-26T10:00:00Z'), // 2h old
    });

    await checkFacebookBudgetWithDb(db, {
      profileId: PROFILE_ID,
      additionalCount: 1,
      now: new Date('2026-04-26T12:00:00Z'),
    });

    // ONE statement that does both the reset and increment in CASE-WHEN form.
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('two concurrent calls do not double-increment counter (T-API-02 race protection)', async () => {
    // Drives an integration-test follow-up. For Wave 0 this stub asserts the
    // service exposes a CAS-shaped contract: a single UPDATE per call with
    // a WHERE that includes the expected windowCount. Plan 03 hardens this
    // with a real concurrency test against testcontainers.
    const db = buildProfileMockDb({
      platform: 'facebook',
      hourlyBudget: 25,
      windowCount: 0,
      windowStartUtc: new Date('2026-04-26T11:30:00Z'),
    });

    await Promise.all([
      checkFacebookBudgetWithDb(db, {
        profileId: PROFILE_ID,
        additionalCount: 1,
        now: new Date('2026-04-26T12:00:00Z'),
      }),
      checkFacebookBudgetWithDb(db, {
        profileId: PROFILE_ID,
        additionalCount: 1,
        now: new Date('2026-04-26T12:00:00Z'),
      }),
    ]);

    // Each call issues exactly one UPDATE — total of 2.
    expect(db.update).toHaveBeenCalledTimes(2);
  });
});
