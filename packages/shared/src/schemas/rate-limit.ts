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

export const rateLimitStateSchema = z.object({
  profileId: z.string().uuid(),
  currentCount: z.number().int().nonnegative(),
  budget: z.number().int().positive(),
  warnThresholdPercent: z.number().int().min(1).max(99),
  warnThresholdHit: z.boolean(),
  blockThresholdHit: z.boolean(),
  monthStartUtc: z.string(), // ISO-8601
});

export type RateLimitState = z.infer<typeof rateLimitStateSchema>;
