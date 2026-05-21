import { describe, it, expect } from 'vitest';
import {
  checkTwitterBudget,
  checkBulkBudget,
  countFacebookPublishApiCalls,
  type BudgetCheckArgs,
} from '../rate-limit/check-budget.js';

// Test helpers — keep setup concise per project testing standards.
function makeArgs(overrides: Partial<BudgetCheckArgs> = {}): BudgetCheckArgs {
  return {
    currentUsage: 0,
    monthlyBudget: 500,
    warnThresholdPercent: 80,
    additionalCount: 1,
    ...overrides,
  };
}

describe('checkTwitterBudget', () => {
  it('returns no warn/block when under threshold', () => {
    const result = checkTwitterBudget(makeArgs({ currentUsage: 0, additionalCount: 1 }));
    expect(result.wouldExceed).toBe(false);
    expect(result.warnThresholdHit).toBe(false);
    expect(result.blockThresholdHit).toBe(false);
    expect(result.projectedCount).toBe(1);
    expect(result.remainingBudget).toBe(500);
  });

  it('returns wouldExceed + blockThresholdHit when usage already at budget', () => {
    const result = checkTwitterBudget(makeArgs({ currentUsage: 500, additionalCount: 1 }));
    expect(result.wouldExceed).toBe(true);
    expect(result.blockThresholdHit).toBe(true);
    expect(result.warnThresholdHit).toBe(true);
    expect(result.projectedCount).toBe(501);
    expect(result.remainingBudget).toBe(0);
  });

  it('returns warnThresholdHit but not wouldExceed when in the warn band', () => {
    const result = checkTwitterBudget(makeArgs({ currentUsage: 400, additionalCount: 1 }));
    expect(result.wouldExceed).toBe(false);
    expect(result.warnThresholdHit).toBe(true);
    expect(result.blockThresholdHit).toBe(false);
    expect(result.projectedCount).toBe(401);
    expect(result.remainingBudget).toBe(100);
  });

  it('triggers warn at the exact threshold (80% of 500 = 400)', () => {
    // projectedCount 400 with warnThreshold 400 → warn fires because of `>=`
    const result = checkTwitterBudget(makeArgs({ currentUsage: 399, additionalCount: 1 }));
    expect(result.projectedCount).toBe(400);
    expect(result.warnThresholdHit).toBe(true);
    expect(result.blockThresholdHit).toBe(false);
  });

  it('does not warn one below the exact threshold', () => {
    const result = checkTwitterBudget(makeArgs({ currentUsage: 398, additionalCount: 1 }));
    expect(result.projectedCount).toBe(399);
    expect(result.warnThresholdHit).toBe(false);
  });

  it('remainingBudget floors at 0 when already over budget', () => {
    const result = checkTwitterBudget(
      makeArgs({ currentUsage: 600, additionalCount: 0 }),
    );
    expect(result.remainingBudget).toBe(0);
    expect(result.wouldExceed).toBe(true);
    expect(result.blockThresholdHit).toBe(true);
  });

  it('handles additionalCount = 0 as a "current state" snapshot under budget', () => {
    const result = checkTwitterBudget(
      makeArgs({ currentUsage: 100, additionalCount: 0 }),
    );
    expect(result.wouldExceed).toBe(false);
    expect(result.warnThresholdHit).toBe(false);
    expect(result.projectedCount).toBe(100);
  });

  it('respects non-default warnThresholdPercent', () => {
    // 50% of 500 = 250 warn threshold
    const result = checkTwitterBudget(
      makeArgs({ currentUsage: 249, additionalCount: 1, warnThresholdPercent: 50 }),
    );
    expect(result.projectedCount).toBe(250);
    expect(result.warnThresholdHit).toBe(true);
    expect(result.blockThresholdHit).toBe(false);
  });
});

describe('checkBulkBudget (LIMIT-05 contract)', () => {
  it('wouldExceed true when currentUsage + additionalCount > monthlyBudget', () => {
    // The LIMIT-05 acceptance case from revision Blocker 2:
    // 460 + 50 = 510 > 500, so bulk upload must be rejected pre-flight.
    const result = checkBulkBudget({
      currentUsage: 460,
      monthlyBudget: 500,
      warnThresholdPercent: 80,
      additionalCount: 50,
    });
    expect(result.wouldExceed).toBe(true);
    expect(result.blockThresholdHit).toBe(true);
    expect(result.projectedCount).toBe(510);
    expect(result.remainingBudget).toBe(40);
  });

  it('allows a bulk batch that fits exactly inside the remaining budget', () => {
    const result = checkBulkBudget({
      currentUsage: 460,
      monthlyBudget: 500,
      warnThresholdPercent: 80,
      additionalCount: 40,
    });
    expect(result.wouldExceed).toBe(false);
    expect(result.blockThresholdHit).toBe(true);
    expect(result.projectedCount).toBe(500);
  });

  it('returns the same shape as checkTwitterBudget for the same args', () => {
    const args = makeArgs({ currentUsage: 100, additionalCount: 10 });
    expect(checkBulkBudget(args)).toEqual(checkTwitterBudget(args));
  });

  it('additionalCount = 0 gives a snapshot without wouldExceed when under budget', () => {
    const result = checkBulkBudget({
      currentUsage: 250,
      monthlyBudget: 500,
      warnThresholdPercent: 80,
      additionalCount: 0,
    });
    expect(result.wouldExceed).toBe(false);
    expect(result.warnThresholdHit).toBe(false);
    expect(result.projectedCount).toBe(250);
  });
});

describe('countFacebookPublishApiCalls', () => {
  it('counts text-only and link-only Facebook posts as one /feed call', () => {
    expect(countFacebookPublishApiCalls()).toBe(1);
    expect(countFacebookPublishApiCalls([])).toBe(1);
  });

  it('counts each Facebook photo upload plus the final /feed call', () => {
    expect(
      countFacebookPublishApiCalls([
        { mimeType: 'image/jpeg' },
        { mimeType: 'image/png' },
        { kind: 'image' },
      ]),
    ).toBe(4);
  });

  it('counts a Facebook video post as one /videos call', () => {
    expect(countFacebookPublishApiCalls([{ mimeType: 'video/mp4' }])).toBe(1);
    expect(countFacebookPublishApiCalls([{ kind: 'video' }])).toBe(1);
  });

  it('uses the video path when mixed media includes a video', () => {
    expect(
      countFacebookPublishApiCalls([
        { mimeType: 'image/jpeg' },
        { mimeType: 'video/mp4' },
      ]),
    ).toBe(1);
  });
});
