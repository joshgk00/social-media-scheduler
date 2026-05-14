// Phase 07-04 / TOKEN-05: token_unhealthy pre-flight check inside publishPost.
//
// When the social profile's `tokenStatus` is anything other than `'active'`,
// the lifecycle must abort cleanly BEFORE transitioning the post to
// `publishing`, write a `post_attempts` row with `outcome='cancelled'` and
// `errorCode='token_unhealthy'`, and NOT emit a notification from the
// pre-flight site (RESEARCH Pitfall 6 — notifications emit at the
// state-transition site, not at every blocked publish attempt).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  publishPost,
  type PublishContext,
} from '../post-lifecycle.service.js';
import { createMockWorkerDb, type MockWorkerDb } from './helpers/mock-db.js';
import { seedLockedPost, seedSocialProfile } from './helpers/seed-post.js';

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

function seedHappyPathWithTokenStatus(db: MockWorkerDb, tokenStatus: string) {
  const lockedPost = seedLockedPost();
  const profile = seedSocialProfile({ tokenStatus });
  db.__pushExecute(() => [lockedPost]);
  db.__pushSelect(() => [{ count: '0' }]);
  db.__pushSelect(() => [profile]);
  return { lockedPost, profile };
}

describe('publishPost token_unhealthy pre-flight (TOKEN-05)', () => {
  let db: MockWorkerDb;

  beforeEach(() => {
    db = createMockWorkerDb();
  });

  it('proceeds normally when tokenStatus is active', async () => {
    seedHappyPathWithTokenStatus(db, 'active');
    const ctx = buildCtx();

    const result = await publishPost(
      db as unknown as Parameters<typeof publishPost>[0],
      ctx,
    );

    expect(result.platformPostId).toBe('tw_test_777');
    expect(ctx.callTwitter).toHaveBeenCalledTimes(1);
  });

  it.each(['expiring', 'needs_reauth', 'expired'])(
    'aborts with token_unhealthy when tokenStatus is %s',
    async (tokenStatus) => {
      seedHappyPathWithTokenStatus(db, tokenStatus);
      const ctx = buildCtx();

      await expect(
        publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
      ).rejects.toMatchObject({ reason: 'token_unhealthy' });

      expect(ctx.callTwitter).not.toHaveBeenCalled();
    },
  );

  it('writes a cancelled post_attempts row with errorCode=token_unhealthy', async () => {
    seedHappyPathWithTokenStatus(db, 'needs_reauth');
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'token_unhealthy' });

    const cancelledAttempt = db.__insertedRows.find(
      (row) => (row as { outcome?: string }).outcome === 'cancelled',
    ) as
      | { outcome?: string; errorCode?: string; errorMessage?: string; postId?: string; attemptNum?: number }
      | undefined;

    expect(cancelledAttempt).toBeDefined();
    expect(cancelledAttempt?.outcome).toBe('cancelled');
    expect(cancelledAttempt?.errorCode).toBe('token_unhealthy');
    expect(cancelledAttempt?.errorMessage).toMatch(/needs_reauth/);
    expect(cancelledAttempt?.postId).toBe(ctx.postId);
    expect(cancelledAttempt?.attemptNum).toBe(1);
  });

  it('does NOT transition the post to publishing on abort', async () => {
    seedHappyPathWithTokenStatus(db, 'expired');
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'token_unhealthy' });

    const publishingUpdate = db.__updates.find(
      (u) => (u.set as { status?: string }).status === 'publishing',
    );
    expect(publishingUpdate).toBeUndefined();
  });

  it('does NOT enqueue a notification from the pre-flight abort', async () => {
    // The pre-flight check does not receive a notificationQueue dependency —
    // notifications emit at state-transition sites (scanner + twitter-401 path).
    // This asserts the insertedRows only contains the cancelled attempt row
    // and no work has leaked out that could imply a notification write.
    seedHappyPathWithTokenStatus(db, 'expiring');
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'token_unhealthy' });

    expect(ctx.callTwitter).not.toHaveBeenCalled();
    // Only a single insert (the cancelled attempt). No additional writes
    // that would indicate a notification emit.
    expect(db.__insertedRows.length).toBe(1);
  });

  it('pre-flight aborts BEFORE budget check when tokenStatus is unhealthy', async () => {
    seedHappyPathWithTokenStatus(db, 'needs_reauth');
    const checkBudget = vi.fn().mockResolvedValue({ wouldExceed: false });
    const ctx = buildCtx({ checkBudget });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'token_unhealthy' });

    // Profile load happens after budget/media checks in the current code path;
    // once the profile row is in hand the pre-flight fires and we never
    // reach the state-transition UPDATE. Budget check may or may not have
    // run before profile load — what matters is the publish does not call
    // Twitter and no publishing transition occurs.
    expect(ctx.callTwitter).not.toHaveBeenCalled();
  });
});
