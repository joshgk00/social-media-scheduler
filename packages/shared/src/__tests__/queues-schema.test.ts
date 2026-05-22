import { describe, expect, it } from 'vitest';
import { createQueueSchema, updateQueueSchema } from '../schemas/queues.js';

describe('createQueueSchema', () => {
  const validQueueInput = {
    name: 'CMW Promotions',
    profileId: '00000000-0000-4000-8000-000000000001',
    scheduleMode: 'variable',
    intervalType: 'variable',
    intervalValue: 4,
    intervalUnit: 'hours',
    daysOfWeek: [1, 2, 3, 4, 5],
    hourSlots: [8, 12, 15],
    seasonalRepeat: false,
    isRecycling: true,
    notes:
      'General brand awareness. With only 14 tweets and 3 posts/day Mon-Fri, each tweet recycles about once a week.',
  } as const;

  it('accepts the date-only startDate emitted by the queue date input', () => {
    const result = createQueueSchema.safeParse({
      ...validQueueInput,
      startDate: '2026-05-21',
    });

    expect(result.success).toBe(true);
  });

  it('still accepts full ISO datetime startDate values', () => {
    const result = createQueueSchema.safeParse({
      ...validQueueInput,
      startDate: '2026-05-21T04:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('requires an explicit schedule mode', () => {
    const withoutScheduleMode = { ...validQueueInput } as Record<string, unknown>;
    delete withoutScheduleMode.scheduleMode;

    expect(createQueueSchema.safeParse(withoutScheduleMode).success).toBe(false);
    expect(createQueueSchema.safeParse({
      ...validQueueInput,
      scheduleMode: 'fixed',
      intervalType: 'fixed',
    }).success).toBe(true);
  });

  it('rejects mismatched schedule mode and interval type pairs', () => {
    expect(createQueueSchema.safeParse({
      ...validQueueInput,
      scheduleMode: 'specific',
      intervalType: 'variable',
    }).success).toBe(false);
    expect(createQueueSchema.safeParse({
      ...validQueueInput,
      scheduleMode: 'variable',
      intervalType: 'fixed',
    }).success).toBe(false);
    expect(createQueueSchema.safeParse({
      ...validQueueInput,
      scheduleMode: 'fixed',
      intervalType: 'variable',
    }).success).toBe(false);
  });

  it('rejects form-only specificTimes at the API schema boundary', () => {
    expect(createQueueSchema.safeParse({
      ...validQueueInput,
      scheduleMode: 'specific',
      intervalType: 'fixed',
      specificTimes: ['08:00', '12:00'],
    }).success).toBe(false);
  });

  it('rejects impossible date-only startDate values', () => {
    const result = createQueueSchema.safeParse({
      ...validQueueInput,
      startDate: '2026-02-31',
    });

    expect(result.success).toBe(false);
  });
});

describe('updateQueueSchema', () => {
  it('accepts partial pause-only updates without schedule fields', () => {
    expect(updateQueueSchema.safeParse({ isPaused: true }).success).toBe(true);
  });
});
