// BullMQ queue and job name constants. Imported by both @sms/api and
// @sms/worker so that queue names stay in lockstep — the source of truth.

export const QUEUE_NAMES = {
  publish: 'publish',
  notification: 'notification',
  autoDestruct: 'auto-destruct',
  transcode: 'transcode',
  mediaCleanup: 'media-cleanup',
  tokenRefresh: 'token-refresh',
  bulkOps: 'bulk-ops',
} as const;

export const JOB_NAMES = {
  publishPost: 'publish-post',
  scanScheduled: 'scan-scheduled',
  scanQueues: 'scan-queues',
  autoDestructPost: 'auto-destruct-post',
  scanAutoDestruct: 'scan-auto-destruct',
  publishFailedNotification: 'publish-failed',
  rateLimitWarnNotification: 'rate-limit-warn',
  queueEmptyNotification: 'queue-empty',
  autoDestructFailedNotification: 'auto-destruct-failed',
  rateLimitReachedNotification: 'rate-limit-reached',
  transcodeVideo: 'transcode-video',
  mediaCleanup: 'media-cleanup',
  mediaCleanupScheduler: 'weekly-media-cleanup',
  scanTokenHealth: 'scan-token-health',
  refreshOrPingToken: 'refresh-or-ping-token',
  tokenRefreshFailed: 'token-refresh-failed',
  tokenExpiringSoon: 'token-expiring-soon',
  tokenRevoked: 'token-revoked',
  tokenReauthRequired: 'token-reauth-required',
  bulkCompletedNotification: 'bulk-completed',
  bulkCsvImportScheduled: 'bulk.csv-import-scheduled',
  bulkCsvImportQueue: 'bulk.csv-import-queue',
  bulkQueueRandomize: 'bulk.queue-randomize',
  bulkQueuePurge: 'bulk.queue-purge',
  bulkQueueCopy: 'bulk.queue-copy',
  bulkQueueTextModify: 'bulk.queue-text-modify',
  bulkQueueDedupe: 'bulk.queue-dedupe',
  bulkProfilePause: 'bulk.profile-pause',
  bulkProfileResume: 'bulk.profile-resume',
  bulkProfileBulkDelete: 'bulk.profile-bulk-delete',
  bulkProfileModifyTags: 'bulk.profile-modify-tags',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
export type JobName = typeof JOB_NAMES[keyof typeof JOB_NAMES];

/**
 * Build a stable BullMQ jobId for the publish queue.
 *
 * Including post_version means that an edit (which bumps post_version) produces
 * a fresh jobId so the new scheduled_at is honored — the previous delayed job
 * can still exist in Redis without blocking the edited version. BullMQ will
 * silently ignore re-enqueues of a jobId that already exists, which gives the
 * scanner a free idempotency layer on top of the `platform_post_id` DB check.
 *
 * See RESEARCH.md Pattern 1 and Pitfall 2.
 */
export function buildPublishJobId(postId: string, postVersion: number): string {
  return `post-${postId}-v${postVersion}`;
}

export function buildAutoDestructJobId(postId: string, platformPostId: string): string {
  return `auto-destruct-${postId}-${platformPostId}`;
}

export function buildBulkJobId(
  operationType: string,
  targetId: string,
  timestampSeconds: number,
): string {
  return `${operationType}-${targetId}-${timestampSeconds}`;
}

/**
 * Build a stable BullMQ jobId for the token-refresh queue.
 *
 * The scanner enqueues one `refreshOrPingToken` job per eligible profile per UTC
 * day. Using `refresh-${profileId}-${yyyymmdd}` means a scanner re-run inside
 * the same UTC day is a no-op (BullMQ silently ignores re-enqueues of an
 * existing jobId) — see RESEARCH Open Question 3.
 */
export function buildTokenRefreshJobId(profileId: string, yyyymmdd: string): string {
  return `refresh-${profileId}-${yyyymmdd}`;
}
