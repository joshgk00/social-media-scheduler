import { describe, expect, it } from 'vitest';
import {
  assertQueueScheduleConsistency,
  parseQueueStartDate,
  QueueServiceError,
} from '../queue.service.js';

describe('parseQueueStartDate', () => {
  it('interprets date-only values as midnight in the user timezone', () => {
    const startDate = parseQueueStartDate('2026-05-21', 'America/New_York');

    expect(startDate?.toISOString()).toBe('2026-05-21T04:00:00.000Z');
  });

  it('preserves full ISO datetime instants', () => {
    const startDate = parseQueueStartDate(
      '2026-05-21T12:30:00.000Z',
      'America/New_York',
    );

    expect(startDate?.toISOString()).toBe('2026-05-21T12:30:00.000Z');
  });
});

describe('assertQueueScheduleConsistency', () => {
  it('accepts matching schedule mode and interval type pairs', () => {
    expect(() => assertQueueScheduleConsistency('specific', 'fixed')).not.toThrow();
    expect(() => assertQueueScheduleConsistency('fixed', 'fixed')).not.toThrow();
    expect(() => assertQueueScheduleConsistency('variable', 'variable')).not.toThrow();
  });

  it('rejects inconsistent effective update pairs before the database write', () => {
    expect(() => assertQueueScheduleConsistency('fixed', 'variable')).toThrow(QueueServiceError);
    expect(() => assertQueueScheduleConsistency('specific', 'variable')).toThrow(QueueServiceError);
    expect(() => assertQueueScheduleConsistency('variable', 'fixed')).toThrow(QueueServiceError);
  });
});
