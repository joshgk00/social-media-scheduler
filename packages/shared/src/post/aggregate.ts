import {
  DELETABLE_STATES,
  EDITABLE_STATES,
  transitionPost,
  type PostStatus,
} from '../constants/post-states.js';
import { PostInvariantError } from './errors.js';
import type { PostPatch, PostPlatform, PostState } from './types.js';

interface PlanUpdateInput {
  platform?: PostPlatform;
  text?: string;
  isThread?: boolean;
  status?: PostStatus;
  scheduledAt?: string | null;
  hasSpinnableText?: boolean;
  autoDestructAfter?: string | null;
  notes?: string | null;
  visibility?: 'PUBLIC' | 'CONNECTIONS' | null;
  linkUrl?: string | null;
}

function parseScheduledAt(value: string): Date {
  const scheduledAt = new Date(value);

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new PostInvariantError(
      'scheduled_at_invalid',
      'scheduledAt must be a valid datetime.',
    );
  }

  return scheduledAt;
}

export function planDelete(currentRow: PostState): void {
  if (!DELETABLE_STATES.includes(currentRow.status)) {
    throw new PostInvariantError(
      'not_deletable',
      'This post cannot be deleted in its current state.',
    );
  }
}

export function planUpdate(
  currentRow: PostState,
  input: PlanUpdateInput,
  expectedVersion: number,
  now = new Date(),
): PostPatch {
  if (input.platform && input.platform !== currentRow.platform) {
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
    try {
      transitionPost(currentRow.status, input.status);
    } catch {
      throw new PostInvariantError(
        'invalid_transition',
        `Invalid state transition from '${currentRow.status}' to '${input.status}'.`,
      );
    }
  }

  const inputScheduledAt = input.scheduledAt === undefined
    ? undefined
    : input.scheduledAt === null
      ? null
      : parseScheduledAt(input.scheduledAt);

  const effectiveStatus = input.status ?? currentRow.status;
  if (effectiveStatus === 'scheduled') {
    const effectiveScheduledAt = input.scheduledAt !== undefined
      ? inputScheduledAt
      : currentRow.scheduledAt;

    if (!effectiveScheduledAt) {
      throw new PostInvariantError(
        'scheduled_at_required',
        'scheduledAt is required for scheduled posts.',
      );
    }

    if (Number.isNaN(effectiveScheduledAt.getTime())) {
      throw new PostInvariantError(
        'scheduled_at_invalid',
        'scheduledAt must be a valid datetime.',
      );
    }

    const scheduledAtChanged = input.scheduledAt !== undefined;
    const statusChangedToScheduled = input.status === 'scheduled' && currentRow.status !== 'scheduled';

    if (scheduledAtChanged || statusChangedToScheduled) {
      if (effectiveScheduledAt < now) {
        throw new PostInvariantError(
          'scheduled_at_must_be_future',
          'scheduledAt must be in the future.',
        );
      }
    }
  }

  const patch: PostPatch = { bumpVersion: true };

  if (input.text !== undefined) patch.text = input.text;
  if (input.isThread !== undefined) patch.isThread = input.isThread;
  if (input.status !== undefined) patch.status = input.status;
  if (input.scheduledAt !== undefined) {
    patch.scheduledAt = inputScheduledAt;
  }
  if (input.hasSpinnableText !== undefined) patch.hasSpinnableText = input.hasSpinnableText;
  if (input.autoDestructAfter !== undefined) patch.autoDestructAfter = input.autoDestructAfter;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.linkUrl !== undefined) patch.linkUrl = input.linkUrl;

  return patch;
}
