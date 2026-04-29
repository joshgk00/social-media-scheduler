import { z, type SafeParseReturnType } from 'zod';
import { JOB_NAMES } from '../constants/queues.js';

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

export const publishFailedNotificationSchema = z.object({
  eventType: z.literal('publish_failed'),
  postId: z.string().uuid(),
  profileId: z.string().uuid(),
  errorMessage: z.string().max(2000),
  correlationId: z.string(),
  occurredAt: z.string().datetime(),
}).strict();

export const rateLimitWarnNotificationSchema = z.object({
  profileId: z.string().uuid(),
  currentUsage: z.number().int().nonnegative(),
  monthlyBudget: z.number().int().positive(),
  warnThresholdPercent: z.number().min(0).max(100),
  triggeredAt: z.string().datetime(),
}).strict();

export const rateLimitReachedNotificationSchema = z.object({
  kind: z.literal('rate_limit_reached'),
  userId: z.string().uuid(),
  profileId: z.string().uuid(),
  platform: z.enum(['twitter', 'linkedin', 'facebook']),
  currentUsage: z.number().int().nonnegative().optional(),
  // 0 is a legitimate operator-configured budget (pause publishing entirely).
  // Use nonnegative() rather than positive() so producer can faithfully
  // emit limit=0 when monthly_tweet_budget is set to 0.
  limit: z.number().int().nonnegative().optional(),
  correlationId: z.string(),
  triggeredAt: z.string().datetime(),
}).strict();

export const queueEmptyNotificationSchema = z.object({
  queueId: z.string().uuid(),
  queueName: z.string(),
  profileId: z.string().uuid(),
  correlationId: z.string(),
  occurredAt: z.string().datetime(),
}).strict();

export const autoDestructFailedNotificationSchema = z.object({
  postId: z.string().uuid(),
  profileId: z.string().uuid(),
  errorMessage: z.string().max(2000),
  correlationId: z.string(),
  occurredAt: z.string().datetime(),
}).strict();

export type PublishFailedNotificationEvent = z.infer<typeof publishFailedNotificationSchema>;
export type RateLimitWarnNotificationEvent = z.infer<typeof rateLimitWarnNotificationSchema>;
export type RateLimitReachedNotificationEvent = z.infer<typeof rateLimitReachedNotificationSchema>;
export type QueueEmptyNotificationEvent = z.infer<typeof queueEmptyNotificationSchema>;
export type AutoDestructFailedNotificationEvent = z.infer<typeof autoDestructFailedNotificationSchema>;

export type NotificationPayload =
  | TokenNotificationEvent
  | PublishFailedNotificationEvent
  | RateLimitWarnNotificationEvent
  | RateLimitReachedNotificationEvent
  | QueueEmptyNotificationEvent
  | AutoDestructFailedNotificationEvent;

export function assertNotificationPayload(
  jobName: string,
  payload: unknown,
): SafeParseReturnType<unknown, NotificationPayload> {
  switch (jobName) {
    case JOB_NAMES.publishFailedNotification:
      return publishFailedNotificationSchema.safeParse(payload);
    case JOB_NAMES.rateLimitWarnNotification:
      return rateLimitWarnNotificationSchema.safeParse(payload);
    case JOB_NAMES.rateLimitReachedNotification:
      return rateLimitReachedNotificationSchema.safeParse(payload);
    case JOB_NAMES.queueEmptyNotification:
      return queueEmptyNotificationSchema.safeParse(payload);
    case JOB_NAMES.autoDestructFailedNotification:
      return autoDestructFailedNotificationSchema.safeParse(payload);
    case JOB_NAMES.tokenRefreshFailed:
    case JOB_NAMES.tokenExpiringSoon:
    case JOB_NAMES.tokenRevoked:
    case JOB_NAMES.tokenReauthRequired:
      return tokenNotificationEventSchema.safeParse(payload);
    default:
      return z.never().safeParse(payload);
  }
}
