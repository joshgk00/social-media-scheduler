import { describe, expect, it, vi } from 'vitest';
import {
  NOTIFICATION_READ_RETENTION_MS,
  pruneReadNotifications,
} from '../notification-prune.js';

function collectConditionSignals(condition: unknown): {
  columns: string[];
  params: unknown[];
} {
  const columns: string[] = [];
  const params: unknown[] = [];
  const seen = new Set<unknown>();

  function visit(value: unknown) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);

    const record = value as Record<string | symbol, unknown>;
    if (typeof record.name === 'string') columns.push(record.name);
    if ('value' in record && 'encoder' in record) params.push(record.value);

    for (const child of Object.values(record)) {
      if (Array.isArray(child)) {
        for (const item of child) visit(item);
      } else {
        visit(child);
      }
    }
  }

  visit(condition);
  return { columns, params };
}

describe('notification prune', () => {
  it('deletes only read notifications older than the retention window', async () => {
    let whereCondition: unknown;
    const deleteChain = {
      where: vi.fn((condition: unknown) => {
        whereCondition = condition;
        return deleteChain;
      }),
      returning: vi.fn().mockResolvedValue([{ id: 'notification-a' }]),
    };
    const db = {
      delete: vi.fn(() => deleteChain),
    };
    const now = new Date('2026-05-22T00:00:00.000Z');

    await expect(pruneReadNotifications(db as never, now)).resolves.toBe(1);

    const conditionSignals = collectConditionSignals(whereCondition);
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(deleteChain.where).toHaveBeenCalledTimes(1);
    expect(deleteChain.returning).toHaveBeenCalledTimes(1);
    expect(conditionSignals.columns).toContain('read_at');
    expect(conditionSignals.params).toContainEqual(
      new Date(now.getTime() - NOTIFICATION_READ_RETENTION_MS),
    );
  });
});
