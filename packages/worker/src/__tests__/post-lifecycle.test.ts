import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  publishPost,
  PostLifecycleAbort,
  type PublishContext,
} from '../post-lifecycle.service.js';
import { createMockWorkerDb, type MockWorkerDb } from './helpers/mock-db.js';
import { seedLockedPost, seedSocialProfile } from './helpers/seed-post.js';
import { buildApiResponseError } from './helpers/mock-twitter.js';

function buildCtx(overrides: Partial<PublishContext> = {}): PublishContext {
  return {
    postId: 'post_00000000-0000-0000-0000-000000000001',
    expectedVersion: 1,
    correlationId: 'corr_test_001',
    currentAttemptNum: 1,
    callTwitter: vi.fn().mockResolvedValue({ platformPostId: 'tw_test_777' }),
    checkBudget: vi.fn().mockResolvedValue({ wouldExceed: false }),
    ...overrides,
  };
}

function seedHappyPath(db: MockWorkerDb) {
  const lockedPost = seedLockedPost();
  const profile = seedSocialProfile();
  // Lock transaction: execute() returns the locked row, then select() returns the profile.
  db.__pushExecute(() => [lockedPost]);
  db.__pushSelect(() => [profile]);
  return { lockedPost, profile };
}

describe('publishPost lifecycle', () => {
  let db: MockWorkerDb;

  beforeEach(() => {
    db = createMockWorkerDb();
  });

  it('transitions a scheduled post to published and writes platform_post_id', async () => {
    seedHappyPath(db);
    const ctx = buildCtx();
    const result = await publishPost(
      db as unknown as Parameters<typeof publishPost>[0],
      ctx,
    );
    expect(result.platformPostId).toBe('tw_test_777');
    expect(ctx.callTwitter).toHaveBeenCalledTimes(1);

    // Success path inserts an attempt row with outcome=success
    const successAttempt = db.__insertedRows.find(
      (row) => (row as { outcome?: string }).outcome === 'success',
    ) as { platformPostId?: string } | undefined;
    expect(successAttempt).toBeDefined();
    expect(successAttempt?.platformPostId).toBe('tw_test_777');

    // Update to published status
    const publishedUpdate = db.__updates.find(
      (u) => (u.set as { status?: string }).status === 'published',
    );
    expect(publishedUpdate).toBeDefined();
    expect((publishedUpdate?.set as { platformPostId?: string }).platformPostId).toBe(
      'tw_test_777',
    );
  });

  it('aborts with already_published when platform_post_id is set and does NOT call twitter', async () => {
    const lockedPost = seedLockedPost({ platformPostId: 'tw_already_789' });
    db.__pushExecute(() => [lockedPost]);
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'already_published' });

    expect(ctx.callTwitter).not.toHaveBeenCalled();
  });

  it('aborts with version_mismatch when post_version has moved', async () => {
    const lockedPost = seedLockedPost({ postVersion: 7 });
    db.__pushExecute(() => [lockedPost]);
    const ctx = buildCtx({ expectedVersion: 1 });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'version_mismatch' });
    expect(ctx.callTwitter).not.toHaveBeenCalled();
  });

  it('aborts with not_scheduled when status is no longer scheduled', async () => {
    const lockedPost = seedLockedPost({ status: 'draft' });
    db.__pushExecute(() => [lockedPost]);
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'not_scheduled' });
    expect(ctx.callTwitter).not.toHaveBeenCalled();
  });

  it('aborts with not_scheduled when the post row does not exist', async () => {
    db.__pushExecute(() => []); // no rows returned
    const ctx = buildCtx();
    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'not_scheduled' });
    expect(ctx.callTwitter).not.toHaveBeenCalled();
  });

  it('aborts with budget_exhausted and leaves post scheduled when checkBudget reports wouldExceed', async () => {
    seedHappyPath(db);
    const ctx = buildCtx({
      checkBudget: vi.fn().mockResolvedValue({ wouldExceed: true }),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'budget_exhausted' });
    expect(ctx.callTwitter).not.toHaveBeenCalled();
  });

  it('aborts with thread_unsupported when the post is flagged as a thread', async () => {
    const lockedPost = seedLockedPost({ isThread: true });
    db.__pushExecute(() => [lockedPost]);
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'thread_unsupported' });
  });

  it('records transient_fail attempt and rethrows on a 500 twitter error', async () => {
    seedHappyPath(db);
    const transientErr = buildApiResponseError({ httpStatus: 500, detail: 'upstream' });
    const ctx = buildCtx({
      callTwitter: vi.fn().mockRejectedValue(transientErr),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toBe(transientErr);

    const transientAttempt = db.__insertedRows.find(
      (row) => (row as { outcome?: string }).outcome === 'transient_fail',
    );
    expect(transientAttempt).toBeDefined();
    // Status is reverted to scheduled so BullMQ retry can pick it up again
    const revertUpdate = db.__updates.find(
      (u) => (u.set as { status?: string }).status === 'scheduled',
    );
    expect(revertUpdate).toBeDefined();
  });

  it('records permanent_fail attempt and transitions to failed on 401 auth revoked', async () => {
    seedHappyPath(db);
    const permanentErr = buildApiResponseError({ httpStatus: 401, detail: 'auth revoked' });
    const ctx = buildCtx({
      callTwitter: vi.fn().mockRejectedValue(permanentErr),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toBe(permanentErr);

    const permanentAttempt = db.__insertedRows.find(
      (row) => (row as { outcome?: string }).outcome === 'permanent_fail',
    ) as { errorCode?: string } | undefined;
    expect(permanentAttempt).toBeDefined();
    expect(permanentAttempt?.errorCode).toBe('auth_revoked');

    const failedUpdate = db.__updates.find(
      (u) => (u.set as { status?: string }).status === 'failed',
    );
    expect(failedUpdate).toBeDefined();
    expect((failedUpdate?.set as { failureReason?: string }).failureReason).toMatch(
      /credentials are no longer valid/i,
    );
  });

  it('duplicate content (twitter code 187) is classified permanent and transitions to failed', async () => {
    seedHappyPath(db);
    const duplicateErr = buildApiResponseError({
      httpStatus: 403,
      code: 187,
      detail: 'Status is a duplicate',
    });
    const ctx = buildCtx({
      callTwitter: vi.fn().mockRejectedValue(duplicateErr),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toBe(duplicateErr);

    const permanentAttempt = db.__insertedRows.find(
      (row) => (row as { outcome?: string }).outcome === 'permanent_fail',
    ) as { errorCode?: string } | undefined;
    expect(permanentAttempt?.errorCode).toBe('duplicate_content');
  });
});

describe('publishPost media-readiness gate (MEDIA-05)', () => {
  let db: MockWorkerDb;

  beforeEach(() => {
    db = createMockWorkerDb();
  });

  function seedHappyPathWithMedia(db: MockWorkerDb, pendingMediaCount: number) {
    const lockedPost = seedLockedPost();
    const profile = seedSocialProfile();
    db.__pushExecute(() => [lockedPost]);
    db.__pushSelect(() => [profile]);
    // Media count query returns the specified count
    db.__pushSelect(() => [{ count: String(pendingMediaCount) }]);
    return { lockedPost, profile };
  }

  it('aborts with media_pending when post has media with transcode_status=pending', async () => {
    seedHappyPathWithMedia(db, 1);
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'media_pending' });
    expect(ctx.callTwitter).not.toHaveBeenCalled();
  });

  it('aborts with media_pending when post has media with transcode_status=processing', async () => {
    seedHappyPathWithMedia(db, 2);
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'media_pending' });
    expect(ctx.callTwitter).not.toHaveBeenCalled();
  });

  it('proceeds normally when all media have transcode_status=completed or not_applicable', async () => {
    seedHappyPathWithMedia(db, 0);
    const ctx = buildCtx();

    const result = await publishPost(
      db as unknown as Parameters<typeof publishPost>[0],
      ctx,
    );
    expect(result.platformPostId).toBe('tw_test_777');
    expect(ctx.callTwitter).toHaveBeenCalledTimes(1);
  });

  it('proceeds normally when post has no media rows', async () => {
    seedHappyPathWithMedia(db, 0);
    const ctx = buildCtx();

    const result = await publishPost(
      db as unknown as Parameters<typeof publishPost>[0],
      ctx,
    );
    expect(result.platformPostId).toBe('tw_test_777');
  });
});

describe('PostLifecycleAbort', () => {
  it('preserves the reason in both message and property', () => {
    const err = new PostLifecycleAbort('version_mismatch');
    expect(err.reason).toBe('version_mismatch');
    expect(err.message).toContain('version_mismatch');
    expect(err.name).toBe('PostLifecycleAbort');
  });
});
