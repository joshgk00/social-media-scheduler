import { z } from 'zod';

const MAX_CALENDAR_WINDOW_DAYS = 100;
const MS_PER_DAY = 86_400_000;

export const calendarScopeSchema = z.enum(['scheduled', 'queued', 'both']);
export const calendarPlatformSchema = z.enum([
  'twitter',
  'linkedin',
  'facebook',
]);

export const calendarQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    scope: calendarScopeSchema.default('both'),
    platforms: z.array(calendarPlatformSchema).optional(),
    profileIds: z.array(z.string().uuid()).optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    search: z.string().max(200).optional(),
  })
  .strict()
  .refine(
    (query) =>
      new Date(query.to).getTime() - new Date(query.from).getTime() <=
      MAX_CALENDAR_WINDOW_DAYS * MS_PER_DAY,
    {
      message: `Calendar window must not exceed ${MAX_CALENDAR_WINDOW_DAYS} days.`,
      path: ['to'],
    },
  )
  .refine((query) => new Date(query.to).getTime() >= new Date(query.from).getTime(), {
    message: 'to must be on or after from.',
    path: ['to'],
  });

export const calendarEventSchema = z.object({
  id: z.string().uuid(),
  platform: calendarPlatformSchema,
  profileId: z.string().uuid(),
  profileDisplayName: z.string(),
  status: z.enum(['scheduled', 'queued', 'publishing']),
  scheduledAt: z.string().datetime({ offset: true }),
  textPreview: z.string(),
  hasConflict: z.boolean(),
});

export const calendarResponseSchema = z.object({
  events: z.array(calendarEventSchema),
});

export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;
