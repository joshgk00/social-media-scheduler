import { z } from 'zod';

const isValidDateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

const startDateSchema = z.string().refine(
  (value) =>
    isValidDateOnly(value) || z.string().datetime().safeParse(value).success,
  'Start date must be a valid date',
);

const queueBaseSchema = z.object({
  name: z.string().min(1, 'Queue name is required').max(255),
  profileId: z.string().uuid('Invalid profile ID'),
  scheduleMode: z.enum(['specific', 'fixed', 'variable']),
  intervalType: z.enum(['fixed', 'variable']),
  intervalValue: z.number().int().min(1).max(999),
  intervalUnit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months', 'years']),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'At least one day required'),
  hourSlots: z.array(z.number().int().min(0).max(23)).min(1, 'At least one hour slot required'),
  specificTimes: z.never().optional(),
  startDate: startDateSchema.optional(),
  seasonalStart: z.string().regex(/^\d{2}-\d{2}$/, 'Must be MM-DD format').optional(),
  seasonalEnd: z.string().regex(/^\d{2}-\d{2}$/, 'Must be MM-DD format').optional(),
  seasonalRepeat: z.boolean().default(false),
  isRecycling: z.boolean().default(false),
  notes: z.string().max(10000).optional(),
});

function validateScheduleConsistency(
  value: { scheduleMode?: 'specific' | 'fixed' | 'variable'; intervalType?: 'fixed' | 'variable' },
  ctx: z.RefinementCtx,
) {
  if (value.scheduleMode === undefined || value.intervalType === undefined) {
    return;
  }

  if (value.scheduleMode === 'specific' && value.intervalType === 'variable') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['intervalType'],
      message: 'Specific-time queues must use a fixed interval type',
    });
  }

  if (value.scheduleMode === 'variable' && value.intervalType === 'fixed') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['intervalType'],
      message: 'Variable queues must use a variable interval type',
    });
  }

  if (value.scheduleMode === 'fixed' && value.intervalType === 'variable') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['intervalType'],
      message: 'Fixed interval queues must use a fixed interval type',
    });
  }
}

export const createQueueSchema = queueBaseSchema.superRefine(validateScheduleConsistency);

export const updateQueueSchema = queueBaseSchema.partial().extend({
  isPaused: z.boolean().optional(),
}).superRefine(validateScheduleConsistency);

export const queueQuerySchema = z.object({
  network: z.enum(['twitter', 'all']).default('all'),
  status: z.enum(['all', 'active', 'paused', 'empty']).default('all'),
});

export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;
export type QueueQueryInput = z.infer<typeof queueQuerySchema>;
