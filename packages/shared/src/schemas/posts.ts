import { z } from 'zod';

export const createPostSchema = z.object({
  profileId: z.string().uuid('Invalid profile ID'),
  text: z.string().min(1, 'Tweet text is required').max(25000),
  isThread: z.boolean().default(false),
  status: z.enum(['draft', 'scheduled']).default('draft'),
  scheduledAt: z.string().datetime().nullable().optional(),
  hasSpinnableText: z.boolean().default(false),
  autoDestructAfter: z.string().regex(/^\d+\s+(minutes?|hours?|days?|weeks?)$/, 'Must be a duration like "30 minutes", "24 hours", or "7 days"').max(50).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).default([]),
  mediaIds: z.array(z.string().uuid()).optional(),
}).refine(
  (data) => {
    if (data.status === 'scheduled' && !data.scheduledAt) {
      return false;
    }
    return true;
  },
  { message: 'scheduledAt is required when status is scheduled', path: ['scheduledAt'] }
);

export const updatePostSchema = z.object({
  text: z.string().min(1, 'Tweet text is required').max(25000).optional(),
  isThread: z.boolean().optional(),
  status: z.enum(['draft', 'scheduled']).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  hasSpinnableText: z.boolean().optional(),
  autoDestructAfter: z.string().regex(/^\d+\s+(minutes?|hours?|days?|weeks?)$/, 'Must be a duration like "30 minutes", "24 hours", or "7 days"').max(50).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  mediaIds: z.array(z.string().uuid()).optional(),
  postVersion: z.number().int().min(1),
}).refine(
  (data) => !(data.status === 'scheduled' && data.scheduledAt === undefined),
  { message: 'scheduledAt is required when updating status to scheduled', path: ['scheduledAt'] }
);

export const postQuerySchema = z.object({
  status: z.enum(['draft', 'scheduled', 'queued', 'publishing', 'published', 'failed', 'auto_destructing', 'destroyed']).optional(),
  profileId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const conflictCheckSchema = z.object({
  profileId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  excludePostId: z.string().uuid().optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type PostQueryInput = z.infer<typeof postQuerySchema>;
export type ConflictCheckInput = z.infer<typeof conflictCheckSchema>;
