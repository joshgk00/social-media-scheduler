export const POST_STATUSES = [
  'draft',
  'scheduled',
  'queued',
  'publishing',
  'published',
  'failed',
  'auto_destructing',
  'destroyed',
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_STATE_TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  draft: ['scheduled', 'publishing'],
  scheduled: ['draft', 'queued', 'publishing'],
  queued: ['publishing'],
  publishing: ['published', 'failed'],
  published: ['auto_destructing'],
  failed: ['draft', 'scheduled'],
  auto_destructing: ['destroyed'],
  destroyed: [],
};

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: PostStatus, to: PostStatus): boolean {
  return POST_STATE_TRANSITIONS[from].includes(to);
}

/**
 * Attempt a state transition. Returns the new status on success.
 * Throws a descriptive error on invalid transition.
 *
 * This is the SINGLE authoritative transition function. Both API services
 * and Phase 4 BullMQ workers MUST use this -- never duplicate transition logic.
 */
export function transitionPost(currentStatus: PostStatus, targetStatus: PostStatus): PostStatus {
  if (!isValidTransition(currentStatus, targetStatus)) {
    throw new Error(
      `Invalid state transition: cannot move from '${currentStatus}' to '${targetStatus}'. ` +
      `Allowed transitions from '${currentStatus}': [${POST_STATE_TRANSITIONS[currentStatus].join(', ')}]`
    );
  }
  return targetStatus;
}

export const EDITABLE_STATES: readonly PostStatus[] = ['draft', 'scheduled', 'failed'];
export const DELETABLE_STATES: readonly PostStatus[] = ['draft', 'scheduled', 'published', 'failed'];
export const NON_INTERACTIVE_STATES: readonly PostStatus[] = ['publishing', 'auto_destructing', 'destroyed'];
