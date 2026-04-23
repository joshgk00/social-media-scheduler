import { z } from 'zod';

// Token-lifecycle notification event payloads for the `notification` queue.
// Producers (token-refresh scanner, token-refresh worker, publish worker's 401
// path) emit these when a profile transitions into an unhealthy token state.
// Consumers dispatch the matching email template.
//
// Emit discipline: notifications only fire on the *transition* (see
// RESEARCH Pitfall 6). The conditional-UPDATE + rowsAffected guard against
// the tokenStatus column is the source of truth — no Redis-side dedupe.

export const tokenNotificationEventTypes = [
  'token_refresh_failed',
  'token_expiring_soon',
  'token_revoked',
  'token_reauth_required',
] as const;

export const tokenNotificationEventSchema = z.object({
  eventType: z.enum(tokenNotificationEventTypes),
  profileId: z.string().uuid(),
  userId: z.string().uuid(),
  platform: z.enum(['twitter', 'linkedin', 'facebook']),
  reason: z.string(),                    // human-readable summary
  correlationId: z.string(),             // traceable back to scanner/worker job
  occurredAt: z.string().datetime(),     // ISO 8601 UTC
}).strict();

export type TokenNotificationEventType = (typeof tokenNotificationEventTypes)[number];
export type TokenNotificationEvent = z.infer<typeof tokenNotificationEventSchema>;
