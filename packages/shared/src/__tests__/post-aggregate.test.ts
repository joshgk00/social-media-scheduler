import { describe, expect, it } from 'vitest';
import {
  DELETABLE_STATES,
  POST_STATUSES,
  PostInvariantError,
  PublishFailure,
  planDelete,
  planMoveToQueue,
  planRecordAutoDestructSuccess,
  planRecordFailure,
  planRecordSuccess,
  planRetryFailedPost,
  planStartAutoDestruct,
  planTransitionToPublishing,
  planUpdate,
  type PreflightState,
  type PostState,
} from '../index.js';

const baseState: PostState = {
  status: 'draft',
  postVersion: 1,
  scheduledAt: null,
  platform: 'twitter',
};

const now = new Date('2030-01-01T00:00:00.000Z');

const readyPreflight: PreflightState = {
  mediaReady: true,
  tokenHealthy: true,
  budgetExhausted: false,
  rateLimitExhausted: false,
};

function expectInvariant(fn: () => unknown, kind: string) {
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

describe('queue and retry planners', () => {
  it('plans draft posts moving into the queue without bumping post_version', () => {
    expect(planMoveToQueue({ ...baseState, status: 'draft' })).toEqual({
      status: 'queued',
      bumpVersion: false,
    });
  });

  it('rejects invalid queue transitions', () => {
    expectInvariant(
      () => planMoveToQueue({ ...baseState, status: 'destroyed' }),
      'invalid_transition',
    );
  });

  it('plans retrying a failed post back to scheduled and clears failure fields', () => {
    expect(planRetryFailedPost({ ...baseState, status: 'failed' })).toEqual({
      status: 'scheduled',
      failureReason: null,
      failedAt: null,
      bumpVersion: true,
    });
  });
});

describe('auto-destruct planners', () => {
  it('plans published posts entering auto-destruct', () => {
    expect(planStartAutoDestruct({ ...baseState, status: 'published' })).toEqual({
      status: 'auto_destructing',
      bumpVersion: false,
    });
  });

  it('plans auto-destruct completion', () => {
    expect(planRecordAutoDestructSuccess({ ...baseState, status: 'auto_destructing' })).toEqual({
      status: 'destroyed',
      bumpVersion: false,
    });
  });

  it('rejects invalid auto-destruct transitions', () => {
    expectInvariant(
      () => planStartAutoDestruct({ ...baseState, status: 'draft' }),
      'invalid_transition',
    );
  });
});

describe('planUpdate', () => {
  it('plans a post patch and version bump for supplied fields', () => {
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();

    const patch = planUpdate(
      baseState,
      {
        postVersion: 1,
        text: 'updated',
        status: 'scheduled',
        scheduledAt,
        notes: null,
        hasSpinnableText: true,
      },
      1,
    );

    expect(patch).toMatchObject({
      bumpVersion: true,
      text: 'updated',
      status: 'scheduled',
      notes: null,
      hasSpinnableText: true,
    });
    expect(patch.scheduledAt).toEqual(new Date(scheduledAt));
  });

  it('rejects platform changes', () => {
    expectInvariant(
      () => planUpdate(baseState, { platform: 'linkedin', postVersion: 1 }, 1),
      'platform_immutable',
    );
  });

  it('rejects updates for non-editable states', () => {
    expectInvariant(
      () => planUpdate({ ...baseState, status: 'publishing' }, { postVersion: 1 }, 1),
      'not_editable',
    );
  });

  it('rejects stale expected versions', () => {
    expectInvariant(
      () => planUpdate({ ...baseState, postVersion: 2 }, { postVersion: 1 }, 1),
      'version_mismatch',
    );
  });

  it('rejects invalid status transitions', () => {
    expectInvariant(
      () => planUpdate(baseState, { status: 'failed', postVersion: 1 } as any, 1),
      'invalid_transition',
    );
  });

  it('requires scheduledAt for scheduled posts', () => {
    expectInvariant(
      () => planUpdate(baseState, { status: 'scheduled', postVersion: 1 }, 1),
      'scheduled_at_required',
    );
  });

  it('requires newly scheduled dates to be in the future', () => {
    expectInvariant(
      () =>
        planUpdate(
          baseState,
          { status: 'scheduled', scheduledAt: '2000-01-01T00:00:00.000Z', postVersion: 1 },
          1,
          now,
        ),
      'scheduled_at_must_be_future',
    );
  });

  it('rejects invalid scheduledAt values', () => {
    expectInvariant(
      () =>
        planUpdate(
          baseState,
          { status: 'scheduled', scheduledAt: 'not-a-date', postVersion: 1 },
          1,
          now,
        ),
      'scheduled_at_invalid',
    );
  });

  it('allows editing an already-scheduled post whose existing scheduledAt is now past', () => {
    const patch = planUpdate(
      { ...baseState, status: 'scheduled', scheduledAt: '2000-01-01T00:00:00.000Z' },
      { text: 'typo fix', postVersion: 1 },
      1,
    );

    expect(patch).toMatchObject({ bumpVersion: true, text: 'typo fix' });
    expect(patch).not.toHaveProperty('scheduledAt');
  });
});

describe('planTransitionToPublishing', () => {
  const scheduledState: PostState = {
    ...baseState,
    status: 'scheduled',
    scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    isThread: false,
    platformPostId: null,
  };

  it('returns a publishing patch for a scheduled post with healthy preflight', () => {
    expect(
      planTransitionToPublishing(scheduledState, { platform: 'twitter' }, readyPreflight),
    ).toEqual({
      kind: 'proceed',
      patch: { status: 'publishing', bumpVersion: true },
    });
  });

  it('allows publishing retries to resume while already in publishing', () => {
    expect(
      planTransitionToPublishing(
        { ...scheduledState, status: 'publishing' },
        { platform: 'twitter' },
        readyPreflight,
      ),
    ).toEqual({
      kind: 'proceed',
      patch: { status: 'publishing', bumpVersion: false },
    });
  });

  it('returns a recovery decision for publishing posts with a platform id', () => {
    expect(
      planTransitionToPublishing(
        { ...scheduledState, status: 'publishing', platformPostId: 'tw_123' },
        { platform: 'twitter' },
        readyPreflight,
      ),
    ).toEqual({
      kind: 'recover',
      recoveryPlatformPostId: 'tw_123',
    });
  });

  it('rejects posts that already have a platform id outside recovery', () => {
    expectInvariant(
      () =>
        planTransitionToPublishing(
          { ...scheduledState, platformPostId: 'tw_123' },
          { platform: 'twitter' },
          readyPreflight,
        ),
      'already_published',
    );
  });

  it('rejects posts that are not scheduled', () => {
    expectInvariant(
      () =>
        planTransitionToPublishing(
          { ...scheduledState, status: 'draft' },
          { platform: 'twitter' },
          readyPreflight,
        ),
      'not_scheduled',
    );
  });

  it('rejects Twitter thread posts', () => {
    expectInvariant(
      () =>
        planTransitionToPublishing(
          { ...scheduledState, isThread: true },
          { platform: 'twitter' },
          readyPreflight,
        ),
      'thread_unsupported',
    );
  });

  it('allows non-Twitter thread posts through the Phase 4 Twitter-only gate', () => {
    expect(
      planTransitionToPublishing(
        { ...scheduledState, isThread: true },
        { platform: 'linkedin' },
        readyPreflight,
      ),
    ).toMatchObject({ kind: 'proceed' });
  });

  it.each([
    ['media_pending', { ...readyPreflight, mediaReady: false }],
    ['token_unhealthy', { ...readyPreflight, tokenHealthy: false }],
    ['budget_exhausted', { ...readyPreflight, budgetExhausted: true }],
    ['rate_limit_exhausted', { ...readyPreflight, rateLimitExhausted: true }],
  ] as const)('rejects %s preflight failures', (kind, preflight) => {
    expectInvariant(
      () =>
        planTransitionToPublishing(
          scheduledState,
          { platform: 'twitter' },
          preflight,
        ),
      kind,
    );
  });
});

describe('planRecordSuccess', () => {
  const publishedAt = new Date('2026-05-20T12:00:00.000Z');

  it('plans a published patch with the caller timestamp and platform id', () => {
    expect(
      planRecordSuccess(
        { ...baseState, status: 'publishing', platformPostId: null },
        'tw_123',
        publishedAt,
      ),
    ).toEqual({
      status: 'published',
      platformPostId: 'tw_123',
      publishedAt,
      failureReason: null,
      bumpVersion: true,
    });
  });

  it('allows idempotently recording the same platform id', () => {
    expect(
      planRecordSuccess(
        { ...baseState, status: 'publishing', platformPostId: 'tw_123' },
        'tw_123',
        publishedAt,
      ),
    ).toMatchObject({ platformPostId: 'tw_123' });
  });

  it('rejects recording success over a different platform id', () => {
    expectInvariant(
      () =>
        planRecordSuccess(
          { ...baseState, status: 'publishing', platformPostId: 'tw_existing' },
          'tw_new',
          publishedAt,
        ),
      'already_published',
    );
  });
});

describe('planRecordFailure', () => {
  const failedAt = new Date('2026-05-20T12:05:00.000Z');
  const transientFailure = new PublishFailure({
    kind: 'transient',
    errorCode: 'http_503',
    message: 'Service Unavailable',
    httpStatus: 503,
  });
  const permanentFailure = new PublishFailure({
    kind: 'permanent',
    errorCode: 'auth_revoked',
    message: 'Token revoked',
    httpStatus: 401,
  });

  it('records a transient failure without changing publishing status when retries remain', () => {
    expect(
      planRecordFailure(
        { ...baseState, status: 'publishing' },
        transientFailure,
        false,
        failedAt,
      ),
    ).toEqual({
      failureReason: 'Service Unavailable',
      lastAttemptAt: failedAt,
      bumpVersion: false,
    });
  });

  it('marks a transient failure as failed on the final attempt', () => {
    expect(
      planRecordFailure(
        { ...baseState, status: 'publishing' },
        transientFailure,
        true,
        failedAt,
      ),
    ).toEqual({
      status: 'failed',
      failureReason: 'Service Unavailable',
      failedAt,
      bumpVersion: true,
    });
  });

  it('marks permanent failures as failed immediately', () => {
    expect(
      planRecordFailure(
        { ...baseState, status: 'publishing' },
        permanentFailure,
        false,
        failedAt,
      ),
    ).toEqual({
      status: 'failed',
      failureReason: 'Token revoked',
      failedAt,
      bumpVersion: true,
    });
  });
});
