import {
  DELETABLE_STATES,
  EDITABLE_STATES,
  transitionPost,
  type PostStatus,
} from '../constants/post-states.js';
import type { PublishFailure } from '../publisher.js';
import { PostInvariantError } from './errors.js';
import type {
  PlanUpdateInput,
  PostPatch,
  PostState,
  PostTransitionProfile,
  PreflightState,
  TransitionDecision,
} from './types.js';

type PublishFailureDecisionInput = Pick<PublishFailure, 'kind' | 'message'>;
type PostStatusOnly = Pick<PostState, 'status'>;

export function planDelete(currentRow: PostStatusOnly): void {
  if (!DELETABLE_STATES.includes(currentRow.status)) {
    throw new PostInvariantError(
      'not_deletable',
      'This post cannot be deleted in its current state.',
    );
  }
}

export function planMoveToQueue(currentRow: PostStatusOnly): PostPatch {
  assertTransition(currentRow.status, 'queued');
  return {
    status: 'queued',
    bumpVersion: false,
  };
}

export function planRetryFailedPost(currentRow: PostStatusOnly): PostPatch {
  assertTransition(currentRow.status, 'scheduled');
  return {
    status: 'scheduled',
    failureReason: null,
    failedAt: null,
    bumpVersion: true,
  };
}

export function planStartAutoDestruct(currentRow: PostStatusOnly): PostPatch {
  assertTransition(currentRow.status, 'auto_destructing');
  return {
    status: 'auto_destructing',
    bumpVersion: false,
  };
}

export function planRecordAutoDestructSuccess(currentRow: PostStatusOnly): PostPatch {
  assertTransition(currentRow.status, 'destroyed');
  return {
    status: 'destroyed',
    bumpVersion: false,
  };
}

export function planUpdate(
  currentRow: PostState,
  input: PlanUpdateInput,
  expectedVersion: number,
  now = new Date(),
): PostPatch {
  if (input.platform && currentRow.platform && input.platform !== currentRow.platform) {
    throw new PostInvariantError(
      'platform_immutable',
      `Cannot change post platform from '${currentRow.platform}' to '${input.platform}'.`,
    );
  }

  if (!EDITABLE_STATES.includes(currentRow.status)) {
    throw new PostInvariantError(
      'not_editable',
      'This post is currently being published and cannot be edited.',
    );
  }

  if (currentRow.postVersion !== expectedVersion) {
    throw new PostInvariantError(
      'version_mismatch',
      'This post was modified elsewhere. Refresh to see the latest version.',
    );
  }

  if (input.status && input.status !== currentRow.status) {
    assertTransition(currentRow.status, input.status);
  }

  const effectiveStatus = input.status ?? currentRow.status;
  const effectiveScheduledAt = deriveEffectiveScheduledAt(currentRow, input);

  if (effectiveStatus === 'scheduled') {
    if (!effectiveScheduledAt) {
      throw new PostInvariantError(
        'scheduled_at_required',
        'scheduledAt is required for scheduled posts.',
      );
    }

    const scheduledAt = new Date(effectiveScheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new PostInvariantError(
        'scheduled_at_invalid',
        'scheduledAt must be a valid datetime.',
      );
    }

    const scheduledAtChanged = input.scheduledAt !== undefined;
    const statusChangedToScheduled =
      input.status === 'scheduled' && currentRow.status !== 'scheduled';

    if (
      (scheduledAtChanged || statusChangedToScheduled) &&
      scheduledAt < now
    ) {
      throw new PostInvariantError(
        'scheduled_at_must_be_future',
        'scheduledAt must be in the future.',
      );
    }
  }

  const patch: PostPatch = { bumpVersion: true };
  if (input.text !== undefined) patch.text = input.text;
  if (input.isThread !== undefined) patch.isThread = input.isThread;
  if (input.status !== undefined) patch.status = input.status as PostStatus;
  if (input.scheduledAt !== undefined) {
    patch.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  }
  if (input.hasSpinnableText !== undefined) patch.hasSpinnableText = input.hasSpinnableText;
  if (input.autoDestructAfter !== undefined) patch.autoDestructAfter = input.autoDestructAfter;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.linkUrl !== undefined) patch.linkUrl = input.linkUrl;

  return patch;
}

export function planTransitionToPublishing(
  currentRow: PostState,
  profile: PostTransitionProfile,
  preflight: PreflightState,
): TransitionDecision {
  if (currentRow.status === 'publishing' && currentRow.platformPostId) {
    return {
      kind: 'recover',
      recoveryPlatformPostId: currentRow.platformPostId,
    };
  }

  if (currentRow.platformPostId) {
    throw new PostInvariantError(
      'already_published',
      'This post has already been published.',
    );
  }

  if (currentRow.status !== 'scheduled' && currentRow.status !== 'publishing') {
    throw new PostInvariantError(
      'not_scheduled',
      'This post is not scheduled for publishing.',
    );
  }

  if (currentRow.isThread === true && profile.platform === 'twitter') {
    throw new PostInvariantError(
      'thread_unsupported',
      'Thread publishing is not supported for Twitter posts.',
    );
  }

  if (!preflight.mediaReady) {
    throw new PostInvariantError(
      'media_pending',
      'This post has media that is still being processed.',
    );
  }

  if (!preflight.tokenHealthy) {
    throw new PostInvariantError(
      'token_unhealthy',
      'This profile token is not healthy.',
    );
  }

  if (preflight.budgetExhausted) {
    throw new PostInvariantError(
      'budget_exhausted',
      'This profile has exhausted its publishing budget.',
    );
  }

  if (preflight.rateLimitExhausted) {
    throw new PostInvariantError(
      'rate_limit_exhausted',
      'This platform rate-limit window is exhausted.',
    );
  }

  return {
    kind: 'proceed',
    patch: {
      status: 'publishing',
      bumpVersion: currentRow.status !== 'publishing',
    },
  };
}

export function planRecordSuccess(
  currentRow: PostState,
  platformPostId: string,
  publishedAt: Date = new Date(),
): PostPatch {
  if (currentRow.platformPostId && currentRow.platformPostId !== platformPostId) {
    throw new PostInvariantError(
      'already_published',
      'This post has already been published with a different platform id.',
    );
  }

  return {
    status: 'published',
    platformPostId,
    publishedAt,
    failureReason: null,
    bumpVersion: true,
  };
}

export function planRecordFailure(
  currentRow: PostState,
  failure: PublishFailureDecisionInput,
  isFinalAttempt: boolean,
  lastAttemptAt: Date = new Date(),
): PostPatch {
  void currentRow;

  if (failure.kind === 'permanent' || isFinalAttempt) {
    return {
      status: 'failed',
      failureReason: failure.message,
      failedAt: lastAttemptAt,
      bumpVersion: true,
    };
  }

  return {
    failureReason: failure.message,
    lastAttemptAt,
    bumpVersion: false,
  };
}

function assertTransition(from: PostStatus, to: PostStatus): void {
  try {
    transitionPost(from, to);
  } catch {
    throw new PostInvariantError(
      'invalid_transition',
      `Invalid state transition from '${from}' to '${to}'.`,
    );
  }
}

function deriveEffectiveScheduledAt(
  currentRow: PostState,
  input: PlanUpdateInput,
): string | null {
  if (input.scheduledAt !== undefined) {
    return input.scheduledAt;
  }
  if (currentRow.scheduledAt instanceof Date) {
    return currentRow.scheduledAt.toISOString();
  }
  return currentRow.scheduledAt;
}
