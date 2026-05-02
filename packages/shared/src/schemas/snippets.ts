import { z } from 'zod';

const SNIPPET_NAME_RE = /^[a-zA-Z0-9_\- ]+$/;

export const snippetCategorySchema = z.enum(['hashtag_set', 'text']);

export const createSnippetSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(100, 'Name must be 100 characters or fewer.')
      .regex(
        SNIPPET_NAME_RE,
        'Name may contain letters, numbers, spaces, hyphens, and underscores only.',
      ),
    category: snippetCategorySchema.default('text'),
    body: z
      .string()
      .min(1, 'Content is required.')
      .max(10_000, 'Content must be 10,000 characters or fewer.'),
  })
  .strict();

export const updateSnippetSchema = createSnippetSchema.partial().strict();

export type SnippetCategory = z.infer<typeof snippetCategorySchema>;
export type CreateSnippetInput = z.infer<typeof createSnippetSchema>;
export type UpdateSnippetInput = z.infer<typeof updateSnippetSchema>;
