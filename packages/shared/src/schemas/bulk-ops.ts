import { z } from 'zod';
import { postQuerySchema } from './posts.js';

const postSelectorSchema = {
  postIds: z.array(z.string().uuid()).optional(),
  filter: postQuerySchema.partial().optional(),
};

function hasPostSelector(data: { postIds?: string[]; filter?: unknown }): boolean {
  if (data.postIds !== undefined && data.postIds.length > 0) return true;
  if (!data.filter || typeof data.filter !== 'object') return false;
  const filter = data.filter as Record<string, unknown>;
  return ['status', 'profileId', 'tagId', 'search'].some((filterKey) => {
    const filterValue = filter[filterKey];
    return filterValue !== undefined && filterValue !== '';
  });
}

export const bulkPauseInputSchema = z
  .object({
    profileId: z.string().uuid(),
    scope: z.enum(['scheduled-posts', 'queues', 'both']),
    ...postSelectorSchema,
  })
  .strict()
  .refine(hasPostSelector, { message: 'Provide postIds or filter' });

export const bulkResumeInputSchema = bulkPauseInputSchema;

export const bulkDeleteInputSchema = z
  .object({
    ...postSelectorSchema,
    typedConfirmation: z.string().min(1),
  })
  .strict()
  .refine(hasPostSelector, { message: 'Provide postIds or filter' });

export const bulkModifyTagsInputSchema = z
  .object({
    ...postSelectorSchema,
    mode: z.enum(['add', 'remove', 'replace']),
    tagIds: z.array(z.string().uuid()).min(1),
  })
  .strict()
  .refine(hasPostSelector, { message: 'Provide postIds or filter' });

export const queueRandomizeInputSchema = z.object({}).strict();

export const queuePurgeInputSchema = z
  .object({
    typedConfirmation: z.string().min(1),
  })
  .strict();

export const queueCopyInputSchema = z
  .object({
    targetQueueId: z.string().uuid(),
    randomizeAfter: z.boolean().default(false),
  })
  .strict();

export const queueTextModifyInputSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('append'),
    text: z.string().min(1).max(1_000),
    separator: z.string().max(20).default(' '),
  }).strict(),
  z.object({
    mode: z.literal('remove'),
    text: z.string().min(1).max(1_000),
  }).strict(),
  z.object({
    mode: z.literal('replace'),
    find: z.string().min(1).max(1_000),
    replace: z.string().max(10_000),
  }).strict(),
]);

export const queueDedupeInputSchema = z.object({}).strict();

export type BulkPauseInput = z.infer<typeof bulkPauseInputSchema>;
export type BulkResumeInput = z.infer<typeof bulkResumeInputSchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteInputSchema>;
export type BulkModifyTagsInput = z.infer<typeof bulkModifyTagsInputSchema>;
export type QueueRandomizeInput = z.infer<typeof queueRandomizeInputSchema>;
export type QueuePurgeInput = z.infer<typeof queuePurgeInputSchema>;
export type QueueCopyInput = z.infer<typeof queueCopyInputSchema>;
export type QueueTextModifyInput = z.infer<typeof queueTextModifyInputSchema>;
export type QueueDedupeInput = z.infer<typeof queueDedupeInputSchema>;
