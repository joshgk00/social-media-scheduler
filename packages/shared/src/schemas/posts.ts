import { z } from 'zod';
import {
  PLATFORM_TEXT_LIMITS,
  countCodePoints,
} from '../lib/platform-text-limits.js';

// createPostSchema is a discriminated union over `platform`. Each variant uses
// `.strict()` so cross-platform fields are rejected at parse time:
//   - linkedin payload carrying `linkUrl` → 400
//   - facebook payload carrying `visibility` → 400
// This is the schema-layer mitigation for T-API-03 (cross-platform field smuggling).
//
// LinkedIn and Facebook also enforce code-point limits via `.refine()` (POST-LI-04,
// POST-FB-05). The base `.max()` uses UTF-16 code units as a fast cutoff; the
// refine then applies the authoritative code-point count using `countCodePoints`.

const baseFields = {
  profileId: z.string().uuid('Invalid profile ID'),
  status: z.enum(['draft', 'scheduled']).default('draft'),
  scheduledAt: z.string().datetime().nullable().optional(),
  hasSpinnableText: z.boolean().default(false),
  autoDestructAfter: z
    .string()
    .regex(
      /^\d+\s+(minutes?|hours?|days?|weeks?|months?|years?)$/,
      'Must be a duration like "30 minutes", "24 hours", or "7 days"',
    )
    .max(50)
    .nullable()
    .optional(),
  notes: z.string().max(10_000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).default([]),
  mediaIds: z.array(z.string().uuid()).default([]),
};

// Twitter variant. `text` keeps `min(1)` because Twitter posts always carry
// at least the user-typed body (twitter-text handles per-tweet length).
const twitterPostObject = z
  .object({
    platform: z.literal('twitter'),
    text: z.string().min(1, 'Tweet text is required').max(PLATFORM_TEXT_LIMITS.twitter),
    isThread: z.boolean().default(false),
    ...baseFields,
  })
  .strict();

// LinkedIn variant. Empty text is allowed at the schema level when media is
// attached — the cross-field rule below rejects empty-text-AND-empty-media.
// `text.max()` is a UTF-16 cap; `.refine()` enforces the code-point limit.
const linkedinPostObject = z
  .object({
    platform: z.literal('linkedin'),
    text: z
      .string()
      .max(PLATFORM_TEXT_LIMITS.linkedin)
      .refine(
        (text) => countCodePoints(text) <= PLATFORM_TEXT_LIMITS.linkedin,
        { message: 'LinkedIn share text exceeds 3000 code points' },
      ),
    visibility: z.enum(['PUBLIC', 'CONNECTIONS']).default('PUBLIC'),
    ...baseFields,
  })
  .strict();

// Facebook variant. Empty text is allowed when media OR a link is attached —
// the cross-field rule rejects empty-text-AND-empty-media-AND-no-link.
const facebookPostObject = z
  .object({
    platform: z.literal('facebook'),
    text: z
      .string()
      .max(PLATFORM_TEXT_LIMITS.facebook)
      .refine(
        (text) => countCodePoints(text) <= PLATFORM_TEXT_LIMITS.facebook,
        { message: 'Facebook post text exceeds 63206 code points' },
      ),
    linkUrl: z.string().url().nullable().optional(),
    ...baseFields,
  })
  .strict();

// Cross-field rules per platform. Returned as helpers so updatePostSchema can
// reuse them when the same object is extended with `postVersion`.
function requireScheduledAtWhenScheduled<T extends { status: 'draft' | 'scheduled'; scheduledAt?: string | null | undefined }>(
  data: T,
  ctx: z.RefinementCtx,
): void {
  if (data.status === 'scheduled' && !data.scheduledAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'scheduledAt is required when status is scheduled',
      path: ['scheduledAt'],
    });
  }
}

function requireLinkedInContent(
  data: { text: string; mediaIds: string[] },
  ctx: z.RefinementCtx,
): void {
  if (data.text.length === 0 && data.mediaIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'LinkedIn share requires text or an image',
      path: ['text'],
    });
  }
}

function requireFacebookContent(
  data: { text: string; mediaIds: string[]; linkUrl?: string | null | undefined },
  ctx: z.RefinementCtx,
): void {
  if (data.text.length === 0 && data.mediaIds.length === 0 && !data.linkUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Facebook post requires text, media, or a link',
      path: ['text'],
    });
  }
}

// Discriminated unions in Zod 3 require each variant to be a `ZodObject` (not
// `ZodEffects`), so cross-field refinements apply at the union level via
// `superRefine`. The union dispatches by `platform`, then we apply the
// variant-specific cross-field rules in a single discriminator switch.
export const createPostSchema = z
  .discriminatedUnion('platform', [
    twitterPostObject,
    linkedinPostObject,
    facebookPostObject,
  ])
  .superRefine((data, ctx) => {
    requireScheduledAtWhenScheduled(data, ctx);
    if (data.platform === 'linkedin') {
      requireLinkedInContent(data, ctx);
    } else if (data.platform === 'facebook') {
      requireFacebookContent(data, ctx);
    }
  });

export type CreatePostInput = z.infer<typeof createPostSchema>;

// updatePostSchema mirrors create but represents PARTIAL updates: every field
// other than the discriminator (`platform`) and the optimistic-concurrency
// guard (`postVersion`) is optional, so a PATCH can change just text or just
// scheduledAt without resending the full body. Each variant remains `.strict()`
// — cross-platform fields are still rejected. The discriminator-level
// `superRefine` only fires its content-required rule when the relevant fields
// are actually present (see `requireLinkedInContent` / `requireFacebookContent`
// guards below).
const twitterUpdateObject = twitterPostObject
  .partial()
  .extend({
    platform: z.literal('twitter'),
    postVersion: z.number().int().min(1),
  })
  .strict();
const linkedinUpdateObject = linkedinPostObject
  .partial()
  .extend({
    platform: z.literal('linkedin'),
    postVersion: z.number().int().min(1),
  })
  .strict();
const facebookUpdateObject = facebookPostObject
  .partial()
  .extend({
    platform: z.literal('facebook'),
    postVersion: z.number().int().min(1),
  })
  .strict();

export const updatePostSchema = z
  .discriminatedUnion('platform', [
    twitterUpdateObject,
    linkedinUpdateObject,
    facebookUpdateObject,
  ])
  .superRefine((data, ctx) => {
    // Only enforce the scheduled-needs-scheduledAt rule when the caller
    // actually included status in the patch. A partial update that only
    // touches `text` should not be rejected for missing scheduledAt.
    if (data.status === 'scheduled' && !data.scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'scheduledAt is required when status is scheduled',
        path: ['scheduledAt'],
      });
    }
    // Same for content rules — only check if both text + mediaIds were supplied
    // in this patch (i.e. the caller is changing both).
    if (
      data.platform === 'linkedin' &&
      data.text !== undefined &&
      data.mediaIds !== undefined &&
      data.text.length === 0 &&
      data.mediaIds.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LinkedIn share requires text or an image',
        path: ['text'],
      });
    }
    if (
      data.platform === 'facebook' &&
      data.text !== undefined &&
      data.mediaIds !== undefined &&
      data.text.length === 0 &&
      data.mediaIds.length === 0 &&
      !data.linkUrl
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Facebook post requires text, media, or a link',
        path: ['text'],
      });
    }
  });
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const postQuerySchema = z.object({
  status: z
    .enum([
      'draft',
      'scheduled',
      'queued',
      'publishing',
      'published',
      'failed',
      'auto_destructing',
      'destroyed',
    ])
    .optional(),
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

export type PostQueryInput = z.infer<typeof postQuerySchema>;
export type ConflictCheckInput = z.infer<typeof conflictCheckSchema>;
