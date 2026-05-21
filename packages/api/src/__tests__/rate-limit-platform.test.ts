// Per-platform pre-flight rate-limit checks (LIMIT-06 Facebook hourly,
// LIMIT-07 LinkedIn daily). The API helpers are read-only — the worker's
// post-publish path is the single writer for `linkedin_daily_count` /
// `facebook_hourly_count`. T-API-02 / T-LIMITS-01 race protection is
// enforced by the worker's atomic CASE-WHEN UPDATE (see PR #38 feedback);
// the API pre-flight is best-effort UX gating.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkLinkedInBudgetWithDb,
  checkFacebookBudgetWithDb,
} from '../services/rate-limit.service.js';

const PROFILE_ID = '00000000-0000-4000-8000-00000000aaaa';

// LinkedIn / Facebook share a profile shape but track different windows.
// The shared rate-limit loaders use `db.execute(sql`...`)` and expose rows
// keyed under the canonical service aliases (`limit`, `count`, `windowStart`,
// `warnThresholdPercent`).
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

  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };

  const db: any = {
    execute: vi.fn().mockResolvedValue([aliasedRow]),
    update: vi.fn().mockReturnValue(updateChain),
    transaction: vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
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

  it('does NOT mutate the DB — pre-flight is read-only (single-writer rule)', async () => {
    // Regression guard for PR #38: API pre-flight previously incremented
    // `linkedin_daily_count` here, and the worker's success path also
    // incremented it on publish — double-counting every scheduled post and
    // permanently consuming window capacity for drafts/cancellations.
    // The worker is now the only writer.
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

    expect(db.update).not.toHaveBeenCalled();
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

  it('does NOT mutate the DB — pre-flight is read-only (single-writer rule)', async () => {
    // Regression guard for PR #38: API pre-flight previously incremented
    // `facebook_hourly_count` here, doubling-up with the worker's success
    // path. The worker is now the only writer.
    const db = buildProfileMockDb({
      platform: 'facebook',
      hourlyBudget: 25,
      windowCount: 20,
      windowStartUtc: new Date('2026-04-26T10:00:00Z'),
    });

    await checkFacebookBudgetWithDb(db, {
      profileId: PROFILE_ID,
      additionalCount: 1,
      now: new Date('2026-04-26T12:00:00Z'),
    });

    expect(db.update).not.toHaveBeenCalled();
  });
});
