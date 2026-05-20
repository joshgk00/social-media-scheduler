import { describe, expect, it } from 'vitest';
import {
  DELETABLE_STATES,
  POST_STATUSES,
  PostInvariantError,
  planDelete,
  planUpdate,
  type PostState,
} from '../index.js';

const now = new Date('2030-01-01T00:00:00.000Z');

const basePost = (overrides: Partial<PostState> = {}): PostState => ({
  status: 'draft',
  postVersion: 3,
  scheduledAt: null,
  platform: 'twitter',
  ...overrides,
});

function expectPostInvariant(fn: () => unknown, kind: PostInvariantError['kind']) {
  try {
    fn();
    expect.unreachable('expected PostInvariantError');
  } catch (err) {
    expect(err).toBeInstanceOf(PostInvariantError);
    expect((err as PostInvariantError).kind).toBe(kind);
  }
}

describe('planDelete', () => {
  it.each(DELETABLE_STATES.map((status) => [status]))(
    'allows deleting %s posts',
    (status) => {
      expect(planDelete({ ...baseState, status })).toBeUndefined();
    },
  );

  it.each(
    POST_STATUSES
      .filter((status) => !DELETABLE_STATES.includes(status))
      .map((status) => [status]),
  )(
    'rejects deleting %s posts',
    (status) => {
      expectInvariant(() => planDelete({ ...baseState, status }), 'not_deletable');
    },
  );
});

describe('planUpdate', () => {
  it('returns a minimal patch for supplied mutable fields', () => {
    expect(planUpdate(
      basePost(),
      {
        platform: 'twitter',
        text: 'updated',
        isThread: true,
        hasSpinnableText: true,
        autoDestructAfter: '2 days',
        notes: null,
        visibility: 'PUBLIC',
        linkUrl: null,
        postVersion: 3,
      },
      3,
      now,
    )).toEqual({
      bumpVersion: true,
      text: 'updated',
      isThread: true,
      hasSpinnableText: true,
      autoDestructAfter: '2 days',
      notes: null,
      visibility: 'PUBLIC',
      linkUrl: null,
    });
  });

  it('rejects platform changes', () => {
    expectPostInvariant(
      () => planUpdate(basePost(), { platform: 'linkedin', postVersion: 3 }, 3, now),
      'platform_immutable',
    );
  });

  it('rejects updates to non-editable states', () => {
    expectPostInvariant(
      () => planUpdate(basePost({ status: 'publishing' }), { postVersion: 3 }, 3, now),
      'not_editable',
    );
  });

  it('rejects stale expected versions', () => {
    expectPostInvariant(
      () => planUpdate(basePost(), { postVersion: 2 }, 2, now),
      'version_mismatch',
    );
  });

  it('rejects invalid state transitions', () => {
    expectPostInvariant(
      () => planUpdate(basePost(), { status: 'published', postVersion: 3 }, 3, now),
      'invalid_transition',
    );
  });

  it('requires scheduledAt for scheduled posts', () => {
    expectPostInvariant(
      () => planUpdate(basePost(), { status: 'scheduled', postVersion: 3 }, 3, now),
      'scheduled_at_required',
    );
  });

  it('rejects active scheduling into the past', () => {
    expectPostInvariant(
      () => planUpdate(
        basePost(),
        { status: 'scheduled', scheduledAt: '2029-12-31T23:59:59.000Z', postVersion: 3 },
        3,
        now,
      ),
      'scheduled_at_must_be_future',
    );
  });

  it('rejects invalid scheduledAt values', () => {
    expectPostInvariant(
      () => planUpdate(
        basePost(),
        { status: 'scheduled', scheduledAt: 'not-a-date', postVersion: 3 },
        3,
        now,
      ),
      'scheduled_at_invalid',
    );
  });

  it('allows editing a scheduled post whose existing scheduledAt has drifted into the past', () => {
    expect(planUpdate(
      basePost({ status: 'scheduled', scheduledAt: new Date('2029-12-31T23:59:59.000Z') }),
      { text: 'typo fix', postVersion: 3 },
      3,
      now,
    )).toEqual({
      bumpVersion: true,
      text: 'typo fix',
    });
  });

  it('derives scheduledAt Date values for the patch', () => {
    expect(planUpdate(
      basePost(),
      { status: 'scheduled', scheduledAt: '2030-01-02T00:00:00.000Z', postVersion: 3 },
      3,
      now,
    )).toEqual({
      bumpVersion: true,
      status: 'scheduled',
      scheduledAt: new Date('2030-01-02T00:00:00.000Z'),
    });
  });
});
