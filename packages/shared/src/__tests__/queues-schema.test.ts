import { describe, expect, it } from 'vitest';
import { createQueueSchema } from '../schemas/queues.js';

describe('createQueueSchema', () => {
  const validQueueInput = {
    name: 'CMW Promotions',
    profileId: '00000000-0000-4000-8000-000000000001',
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

  it('rejects impossible date-only startDate values', () => {
    const result = createQueueSchema.safeParse({
      ...validQueueInput,
      startDate: '2026-02-31',
    });

    expect(result.success).toBe(false);
  });
});
