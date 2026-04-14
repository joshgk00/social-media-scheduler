import { z } from 'zod';

export const createQueueSchema = z.object({
  name: z.string().min(1, 'Queue name is required').max(255),
  profileId: z.string().uuid('Invalid profile ID'),
  intervalType: z.enum(['fixed', 'variable']),
  intervalValue: z.number().int().min(1).max(999),
  intervalUnit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months', 'years']),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'At least one day required'),
  hourSlots: z.array(z.number().int().min(6).max(23)).min(1, 'At least one hour slot required'),
  startDate: z.string().datetime().optional(),
  seasonalStart: z.string().regex(/^\d{2}-\d{2}$/, 'Must be MM-DD format').optional(),
  seasonalEnd: z.string().regex(/^\d{2}-\d{2}$/, 'Must be MM-DD format').optional(),
  seasonalRepeat: z.boolean().default(false),
  isRecycling: z.boolean().default(false),
  notes: z.string().max(10000).optional(),
});

export const updateQueueSchema = createQueueSchema.partial();

export const queueQuerySchema = z.object({
  network: z.enum(['twitter', 'all']).default('all'),
  status: z.enum(['all', 'active', 'paused', 'empty']).default('all'),
});

export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;
export type QueueQueryInput = z.infer<typeof queueQuerySchema>;
