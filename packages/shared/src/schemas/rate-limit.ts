import { z } from 'zod';

// Zod contract for the rate-limit config UI/API:
//   PATCH /api/profiles/:id/rate-limit   body → rateLimitUpdateSchema
//   GET   /api/profiles/:id/rate-limit   response → rateLimitStateSchema
//
// `.strict()` on the update schema is mandatory — it rejects unknown keys so
// a caller cannot sneak `userId`, `tokenEncryptionVersion`, or any other
// sensitive column into the UPDATE. Mitigation for T-04-02-02 (mass-assignment).

export const rateLimitUpdateSchema = z
  .object({
    monthlyTweetBudget: z.number().int().min(1).max(10000),
    warnThresholdPercent: z.number().int().min(1).max(99),
  })
  .strict();

export type RateLimitUpdate = z.infer<typeof rateLimitUpdateSchema>;

// rateLimitStateSchema is a discriminated union over `platform`. Each variant
// carries the platform-specific shape:
//   - twitter:  monthly budget keyed by `monthStartUtc` (LIMIT-01..05)
//   - linkedin: rolling daily limit keyed by `windowStartUtc` + `windowResetAt` (LIMIT-07)
//   - facebook: rolling hourly limit keyed by `windowStartUtc` + `windowResetAt` (LIMIT-06)

const sharedThresholds = {
  warnThresholdPercent: z.number().int().min(1).max(99),
  warnThresholdHit: z.boolean(),
  blockThresholdHit: z.boolean(),
};

const twitterRateLimitState = z
  .object({
    platform: z.literal('twitter'),
    profileId: z.string().uuid(),
    currentCount: z.number().int().nonnegative(),
    budget: z.number().int().positive(),
    monthStartUtc: z.string().datetime(),
    // Start of the next UTC calendar month — the moment the Twitter monthly
    // budget resets (issue #35). Required so typed consumers can rely on a
    // future-dated reset boundary instead of formatting `monthStartUtc`.
    windowResetAt: z.string().datetime(),
    ...sharedThresholds,
  })
  .strict();

const linkedinRateLimitState = z
  .object({
    platform: z.literal('linkedin'),
    profileId: z.string().uuid(),
    currentCount: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    windowStartUtc: z.string().datetime(),
    windowResetAt: z.string().datetime(),
    ...sharedThresholds,
  })
  .strict();

const facebookRateLimitState = z
  .object({
    platform: z.literal('facebook'),
    profileId: z.string().uuid(),
    currentCount: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    windowStartUtc: z.string().datetime(),
    windowResetAt: z.string().datetime(),
    ...sharedThresholds,
  })
  .strict();

export const rateLimitStateSchema = z.discriminatedUnion('platform', [
  twitterRateLimitState,
  linkedinRateLimitState,
  facebookRateLimitState,
]);

export type RateLimitState = z.infer<typeof rateLimitStateSchema>;
