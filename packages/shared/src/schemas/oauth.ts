import { z } from 'zod';

// Zod contracts for the OAuth 2.0 router used by LinkedIn and Facebook. Twitter
// uses the legacy OAuth 1.0a credential form and does NOT route through
// /api/oauth/*. `.strict()` on POST bodies rejects unknown keys so a caller
// cannot slip extra fields (userId, tokenEncryptionVersion, …) into the
// finalize step — mass-assignment mitigation per CLAUDE.md.

// GET /api/oauth/start/:platform?reconnect=<uuid>&returnTo=<path>
export const oauthStartQuerySchema = z.object({
  platform: z.enum(['linkedin', 'facebook']),
  reconnect: z.string().uuid().optional(),
  returnTo: z.string().optional(),
});

// GET /api/oauth/callback/:platform?state=...&(code=...|error=...)
// The provider returns either `code` (success) OR `error` / `error_description`
// (user denied / server error); both must be optional so each branch parses.
export const oauthCallbackQuerySchema = z.object({
  state: z.string().min(1),
  code: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

// Redis-resident state nonce payload created by /oauth/start and consumed by
// /oauth/callback. `reconnectProfileId` disambiguates the reconnect flow
// (profile identity must match on callback).
export const oauthStatePayloadSchema = z.object({
  userId: z.string().uuid(),
  platform: z.enum(['linkedin', 'facebook']),
  scope: z.string(),
  returnTo: z.string(),
  reconnectProfileId: z.string().uuid().nullable(),
});

// POST /api/oauth/finalize — user picks which page/org to persist from the
// Redis-cached pending selection. `.strict()` — no extra keys.
export const finalizeOAuthSchema = z
  .object({
    tempToken: z.string().min(1),
    platformAccountId: z.string().min(1).max(255),
  })
  .strict();

// POST /api/oauth/finalize-as-new — taken when the reconnect mismatch dialog
// resolves with "Connect as new profile" instead of replacing tokens on the
// existing row. Shape matches finalizeOAuthSchema; kept separate so route
// handlers can branch on intent without a discriminator field.
export const finalizeAsNewSchema = z
  .object({
    tempToken: z.string().min(1),
    platformAccountId: z.string().min(1).max(255),
  })
  .strict();

export type OAuthStartQuery = z.infer<typeof oauthStartQuerySchema>;
export type OAuthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;
export type OAuthStatePayload = z.infer<typeof oauthStatePayloadSchema>;
export type FinalizeOAuthInput = z.infer<typeof finalizeOAuthSchema>;
export type FinalizeAsNewInput = z.infer<typeof finalizeAsNewSchema>;
