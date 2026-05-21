import { describe, it, expect, beforeEach } from 'vitest';
import { loadWorkerUsage, checkBudgetForWorker } from '../rate-limit.js';
import { createMockWorkerDb, type MockWorkerDb } from './helpers/mock-db.js';

describe('worker rate-limit wrapper', () => {
  let db: MockWorkerDb;

  beforeEach(() => {
    db = createMockWorkerDb();
  });

  function queueProfileAndCount(
    monthlyBudget: number,
    warnThresholdPercent: number,
    publishedCount: number,
  ) {
    db.__pushExecute(() => [{ monthlyBudget, warnThresholdPercent }]);
    db.__pushExecute(() => [{ publishedCount }]);
  }

  it('loadWorkerUsage returns zero currentUsage for an empty profile', async () => {
    queueProfileAndCount(500, 80, 0);
    const snapshot = await loadWorkerUsage(
      db as unknown as Parameters<typeof loadWorkerUsage>[0],
      'profile_abc',
    );
    expect(snapshot.currentUsage).toBe(0);
    expect(snapshot.monthlyBudget).toBe(500);
    expect(snapshot.warnThresholdPercent).toBe(80);
  });

  it('loadWorkerUsage throws when profile is missing', async () => {
    db.__pushExecute(() => []); // no profile row
    await expect(
      loadWorkerUsage(
        db as unknown as Parameters<typeof loadWorkerUsage>[0],
        'profile_missing',
      ),
    ).rejects.toThrow(/not found/i);
  });

  it('checkBudgetForWorker returns wouldExceed=false at 5/500 published', async () => {
    queueProfileAndCount(500, 80, 5);
    const result = await checkBudgetForWorker(
      db as unknown as Parameters<typeof checkBudgetForWorker>[0],
      { profileId: 'profile_abc', additionalPostCount: 1 },
    );
    expect(result.wouldExceed).toBe(false);
    expect(result.remainingBudget).toBe(495);
  });

  it('checkBudgetForWorker returns wouldExceed=true when usage already at cap', async () => {
    queueProfileAndCount(500, 80, 500);
    const result = await checkBudgetForWorker(
      db as unknown as Parameters<typeof checkBudgetForWorker>[0],
      { profileId: 'profile_abc', additionalPostCount: 1 },
    );
    expect(result.wouldExceed).toBe(true);
    expect(result.blockThresholdHit).toBe(true);
  });

  it('checkBudgetForWorker reports warn threshold hit at 80%', async () => {
    queueProfileAndCount(500, 80, 399);
    const result = await checkBudgetForWorker(
      db as unknown as Parameters<typeof checkBudgetForWorker>[0],
      { profileId: 'profile_abc', additionalPostCount: 1 },
    );
    // 399 + 1 = 400 = 80% of 500 -> warn threshold hit, not exceeded
    expect(result.warnThresholdHit).toBe(true);
    expect(result.wouldExceed).toBe(false);
  });

  it('checkBudgetForWorker computes remainingBudget floored at zero', async () => {
    queueProfileAndCount(500, 80, 600); // manual overshoot scenario
    const result = await checkBudgetForWorker(
      db as unknown as Parameters<typeof checkBudgetForWorker>[0],
      { profileId: 'profile_abc', additionalPostCount: 1 },
    );
    expect(result.remainingBudget).toBe(0);
    expect(result.wouldExceed).toBe(true);
  });
});
