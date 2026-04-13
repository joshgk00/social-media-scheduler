// BullMQ queue and job name constants. Imported by both @sms/api and
// @sms/worker so that queue names stay in lockstep — the source of truth.
//
// Phase 4 intentionally ships only `publish` and `notification`. Other queues
// from REQUIREMENTS.md WORKER-02 (`transcode`, `token-refresh`, `auto-destruct`,
// `media-cleanup`, `bulk`) are owned by their respective phases and MUST NOT
// be added here until their phase lands — creating unused queues pollutes the
// Bull-Board dashboard and the Redis keyspace (D-04).

export const QUEUE_NAMES = {
  publish: 'publish',
  notification: 'notification',
  autoDestruct: 'auto-destruct',
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
