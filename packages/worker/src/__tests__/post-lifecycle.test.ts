import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  publishPost,
  PostLifecycleAbort,
  type PublishContext,
} from '../post-lifecycle.service.js';
import { PublishFailure } from '@sms/shared';
import type { StorageBackend } from '@sms/shared/storage';
import { createMockWorkerDb, type MockWorkerDb } from './helpers/mock-db.js';
import { seedLockedPost, seedSocialProfile } from './helpers/seed-post.js';

function buildCtx(overrides: Partial<PublishContext> = {}): PublishContext {
  return {
    postId: 'post_00000000-0000-0000-0000-000000000001',
    expectedVersion: 1,
    correlationId: 'corr_test_001',
    currentAttemptNum: 1,
    publish: vi.fn().mockResolvedValue({ platformPostId: 'tw_test_777' }),
    checkBudget: vi.fn().mockResolvedValue({ wouldExceed: false }),
    ...overrides,
  };
}

function seedHappyPath(db: MockWorkerDb) {
  const lockedPost = seedLockedPost();
  const profile = seedSocialProfile();
  // Lock transaction: execute() returns the locked row, then two selects:
  // 1. Media count query (MEDIA-05 gate) returns 0 pending
  // 2. Profile select returns the social profile
  db.__pushExecute(() => [lockedPost]);
  db.__pushSelect(() => [{ count: '0' }]);
  db.__pushSelect(() => [profile]);
  return { lockedPost, profile };
}

describe('publishPost lifecycle', () => {
  let db: MockWorkerDb;

  beforeEach(() => {
    db = createMockWorkerDb();
  });

  it('transitions a scheduled post to published and writes platform_post_id', async () => {
    const { lockedPost, profile } = seedHappyPath(db);
    const ctx = buildCtx();
    const result = await publishPost(
      db as unknown as Parameters<typeof publishPost>[0],
      ctx,
    );
    expect(result.platformPostId).toBe('tw_test_777');
    expect(ctx.publish).toHaveBeenCalledTimes(1);
    expect(ctx.publish).toHaveBeenCalledWith(
      profile,
      {
        text: lockedPost.text,
        platform: 'twitter',
        isThread: false,
        visibility: null,
        linkUrl: null,
        media: [],
      },
      { correlationId: 'corr_test_001' },
    );

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

  it('loads media bytes and passes them into publish', async () => {
    const { profile } = seedHappyPath(db);
    db.__pushSelect(() => [
      {
        id: 'media_1',
        filePath: 'posts/post_1/image.png',
        fileName: 'image.png',
        mimeType: 'image/png',
      },
      {
        id: 'media_2',
        filePath: 'posts/post_1/video.mp4',
        fileName: 'video.mp4',
        mimeType: 'video/mp4',
      },
    ]);
    const storage = {
      get: vi
        .fn()
        .mockResolvedValueOnce(Buffer.from('image-bytes'))
        .mockResolvedValueOnce(Buffer.from('video-bytes')),
    } as unknown as StorageBackend;
    const ctx = buildCtx({ storage });

    await publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx);

    expect(storage.get).toHaveBeenCalledWith('posts/post_1/image.png');
    expect(storage.get).toHaveBeenCalledWith('posts/post_1/video.mp4');
    expect(ctx.publish).toHaveBeenCalledWith(
      profile,
      expect.objectContaining({
        media: [
          {
            id: 'media_1',
            kind: 'image',
            bytes: Buffer.from('image-bytes'),
            mimeType: 'image/png',
            fileName: 'image.png',
          },
          {
            id: 'media_2',
            kind: 'video',
            bytes: Buffer.from('video-bytes'),
            mimeType: 'video/mp4',
            fileName: 'video.mp4',
          },
        ],
      }),
      { correlationId: 'corr_test_001' },
    );
  });

  it('records a transient failure and reverts to scheduled when media storage fails', async () => {
    seedHappyPath(db);
    db.__pushSelect(() => [
      {
        id: 'media_1',
        filePath: 'posts/post_1/missing.png',
        fileName: 'missing.png',
        mimeType: 'image/png',
      },
    ]);
    const storageErr = new Error('storage object missing');
    const storage = {
      get: vi.fn().mockRejectedValue(storageErr),
    } as unknown as StorageBackend;
    const ctx = buildCtx({ storage });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toBe(storageErr);

    expect(ctx.publish).not.toHaveBeenCalled();
    const transientAttempt = db.__insertedRows.find(
      (row) => (row as { outcome?: string }).outcome === 'transient_fail',
    ) as { errorCode?: string; errorMessage?: string } | undefined;
    expect(transientAttempt).toBeDefined();
    expect(transientAttempt?.errorCode).toBe('unknown');
    expect(transientAttempt?.errorMessage).toBe('storage object missing');
    const revertUpdate = db.__updates.find(
      (u) => (u.set as { status?: string }).status === 'scheduled',
    );
    expect(revertUpdate).toBeDefined();
  });

  it('aborts with already_published when platform_post_id is set AND status is already published', async () => {
    // True idempotent retry of a fully-committed publish: Phase 3 already
    // ran on a prior attempt. We must not re-tweet and we must not run
    // Phase 3 again (counters would double-bump).
    const lockedPost = seedLockedPost({
      platformPostId: 'tw_already_789',
      status: 'published',
    });
    const profile = seedSocialProfile();
    db.__pushExecute(() => [lockedPost]);
    db.__pushSelect(() => [{ count: '0' }]);
    db.__pushSelect(() => [profile]);
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'already_published' });

    expect(ctx.publish).not.toHaveBeenCalled();
  });

  it('aborts with version_mismatch when post_version has moved', async () => {
    const lockedPost = seedLockedPost({ postVersion: 7 });
    db.__pushExecute(() => [lockedPost]);
    const ctx = buildCtx({ expectedVersion: 1 });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'version_mismatch' });
    expect(ctx.publish).not.toHaveBeenCalled();
  });

  it('aborts with not_scheduled when status is no longer scheduled', async () => {
    const lockedPost = seedLockedPost({ status: 'draft' });
    db.__pushExecute(() => [lockedPost]);
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'not_scheduled' });
    expect(ctx.publish).not.toHaveBeenCalled();
  });

  it('aborts with not_scheduled when the post row does not exist', async () => {
    db.__pushExecute(() => []); // no rows returned
    const ctx = buildCtx();
    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'not_scheduled' });
    expect(ctx.publish).not.toHaveBeenCalled();
  });

  it('aborts with budget_exhausted and leaves post scheduled when checkBudget reports wouldExceed', async () => {
    seedHappyPath(db);
    const ctx = buildCtx({
      checkBudget: vi.fn().mockResolvedValue({ wouldExceed: true }),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'budget_exhausted' });
    expect(ctx.publish).not.toHaveBeenCalled();
  });

  it('aborts with thread_unsupported when the post is flagged as a thread', async () => {
    const lockedPost = seedLockedPost({ isThread: true });
    const profile = seedSocialProfile();
    db.__pushExecute(() => [lockedPost]);
    db.__pushSelect(() => [{ count: '0' }]);
    db.__pushSelect(() => [profile]);
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'thread_unsupported' });
  });

  it('uses the profile platform for thread support when the locked post platform is missing', async () => {
    const lockedPost = { ...seedLockedPost({ isThread: true }), platform: null };
    const profile = seedSocialProfile({ platform: 'linkedin' });
    db.__pushExecute(() => [lockedPost]);
    db.__pushSelect(() => [{ count: '0' }]);
    db.__pushSelect(() => [profile]);
    const ctx = buildCtx();

    const result = await publishPost(
      db as unknown as Parameters<typeof publishPost>[0],
      ctx,
    );

    expect(result.platformPostId).toBe('tw_test_777');
    expect(ctx.publish).toHaveBeenCalledWith(
      profile,
      expect.objectContaining({
        isThread: true,
        platform: 'linkedin',
      }),
      { correlationId: 'corr_test_001' },
    );
  });

  it('records transient_fail attempt and rethrows on a 500 twitter error', async () => {
    seedHappyPath(db);
    const transientErr = new PublishFailure({
      kind: 'transient',
      errorCode: 'http_500',
      message: 'upstream',
      httpStatus: 500,
    });
    const ctx = buildCtx({
      publish: vi.fn().mockRejectedValue(transientErr),
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
    const permanentErr = new PublishFailure({
      kind: 'permanent',
      errorCode: 'auth_revoked',
      message: 'Twitter credentials are no longer valid - please reconnect the profile',
      httpStatus: 401,
    });
    const ctx = buildCtx({
      publish: vi.fn().mockRejectedValue(permanentErr),
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
    const duplicateErr = new PublishFailure({
      kind: 'permanent',
      errorCode: 'duplicate_content',
      message: 'Duplicate content - Twitter rejected this tweet',
      httpStatus: 403,
    });
    const ctx = buildCtx({
      publish: vi.fn().mockRejectedValue(duplicateErr),
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
    // Media count query runs before profile load in the transaction
    db.__pushSelect(() => [{ count: String(pendingMediaCount) }]);
    db.__pushSelect(() => [profile]);
    return { lockedPost, profile };
  }

  it('aborts with media_pending when post has media with transcode_status=pending', async () => {
    seedHappyPathWithMedia(db, 1);
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'media_pending' });
    expect(ctx.publish).not.toHaveBeenCalled();
  });

  it('aborts with media_pending when post has media with transcode_status=processing', async () => {
    seedHappyPathWithMedia(db, 2);
    const ctx = buildCtx();

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({ reason: 'media_pending' });
    expect(ctx.publish).not.toHaveBeenCalled();
  });

  it('proceeds normally when all media have transcode_status=completed or not_applicable', async () => {
    seedHappyPathWithMedia(db, 0);
    const ctx = buildCtx();

    const result = await publishPost(
      db as unknown as Parameters<typeof publishPost>[0],
      ctx,
    );
    expect(result.platformPostId).toBe('tw_test_777');
    expect(ctx.publish).toHaveBeenCalledTimes(1);
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

describe('publishPost crash-safe platform_post_id pre-write (issue #17)', () => {
  let db: MockWorkerDb;

  beforeEach(() => {
    db = createMockWorkerDb();
  });

  // Pre-write matcher uses EXACT key-set equality so an unrelated future
  // update of {platformPostId, updatedAt} (e.g., a media-attach restamp)
  // can't silently masquerade as the issue #17 pre-write. Combined with the
  // "exactly one" assertion below, this is robust against extra writes.
  // NB: db.__updates is a single shared log; createMockWorkerDb's
  // `transaction(handler) => handler(db)` flattens tx-scoped writes onto
  // it in real call order, which is what makes cross-Phase ordering checks
  // meaningful (helpers/mock-db.ts:99).
  function findPlatformPostIdPrewrite(db: MockWorkerDb) {
    return db.__updates.find((u) => {
      const keys = Object.keys(u.set).sort();
      return keys.length === 2 && keys[0] === 'platformPostId' && keys[1] === 'updatedAt';
    });
  }

  it('persists platform_post_id in a standalone UPDATE between Phase 1 and Phase 3 (ordering)', async () => {
    seedHappyPath(db);
    const ctx = buildCtx();

    await publishPost(
      db as unknown as Parameters<typeof publishPost>[0],
      ctx,
    );

    // Exactly one pre-write — matched by EXACT key set, so an unrelated
    // {platformPostId, updatedAt} update introduced later can't silently
    // pass this test.
    const prewrites = db.__updates.filter((u) => {
      const keys = Object.keys(u.set).sort();
      return keys.length === 2 && keys[0] === 'platformPostId' && keys[1] === 'updatedAt';
    });
    expect(prewrites).toHaveLength(1);
    const prewrite = prewrites[0];
    expect((prewrite.set as { platformPostId?: string }).platformPostId).toBe(
      'tw_test_777',
    );

    // Order check: walk db.__updates in insertion order and confirm:
    //   [0] Phase 1 transitions status='publishing'
    //   [1] standalone pre-write (issue #17 marker)
    //   [2] Phase 3 transitions status='published'
    // This is the strongest guarantee that a retry between (1) and (2)
    // will see platform_post_id and short-circuit `already_published`.
    const publishingIdx = db.__updates.findIndex(
      (u) => (u.set as { status?: string }).status === 'publishing',
    );
    const prewriteIdx = db.__updates.indexOf(prewrite);
    const publishedIdx = db.__updates.findIndex(
      (u) => (u.set as { status?: string }).status === 'published',
    );
    expect(publishingIdx).toBeGreaterThanOrEqual(0);
    expect(prewriteIdx).toBeGreaterThan(publishingIdx);
    expect(publishedIdx).toBeGreaterThan(prewriteIdx);

    // Cross-collection ordering: the pre-write must precede the success
    // postAttempts insert. We compare each operation's vitest invocationCallOrder
    // — a global monotonic counter across all spies in the test — so this
    // assertion remains correct even if a future change splits the updates
    // and inserts onto separate logs.
    const updateOrders = (db.update as Mock).mock.invocationCallOrder;
    const insertOrders = (db.insert as Mock).mock.invocationCallOrder;
    const prewriteOrder = updateOrders[prewriteIdx];
    const successInsertIdx = db.__insertedRows.findIndex(
      (row) => (row as { outcome?: string }).outcome === 'success',
    );
    expect(successInsertIdx).toBeGreaterThanOrEqual(0);
    const successOrder = insertOrders[successInsertIdx];
    expect(prewriteOrder).toBeLessThan(successOrder);
  });

  it('preserves the pre-write when the Phase 3 transaction throws (retry sees platform_post_id)', async () => {
    seedHappyPath(db);
    const ctx = buildCtx();

    // Two db.transaction calls happen: Phase 1 (lock + transition to publishing)
    // and Phase 3 (success attempt + published). We want only the SECOND to
    // throw — the first must complete so Twitter actually gets called.
    const phase3Err = new Error('simulated db blip during phase 3 commit');
    let txCount = 0;
    (db.transaction as Mock).mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) => {
      txCount += 1;
      if (txCount === 2) throw phase3Err;
      return handler(db);
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toBe(phase3Err);

    // Twitter was called exactly once (the tweet is already live).
    expect(ctx.publish).toHaveBeenCalledTimes(1);

    // Pre-write must still be in the updates log — that's the crash-safe marker
    // a BullMQ retry will see via the FOR UPDATE load in Phase 1, hitting the
    // existing `already_published` guard at post-lifecycle.service.ts:181.
    const prewrite = findPlatformPostIdPrewrite(db);
    expect(prewrite).toBeDefined();
    expect((prewrite?.set as { platformPostId?: string }).platformPostId).toBe(
      'tw_test_777',
    );

    // Anchor: the pre-write must have happened BEFORE the throwing Phase 3
    // transaction — otherwise a future refactor that moves the pre-write
    // INTO the Phase 3 tx wrapper would still leave the marker visible to
    // this test even though the crash-safety contract is broken.
    const updateOrders = (db.update as Mock).mock.invocationCallOrder;
    const txOrders = (db.transaction as Mock).mock.invocationCallOrder;
    const prewriteIdx = db.__updates.indexOf(prewrite!);
    const prewriteOrder = updateOrders[prewriteIdx];
    const phase3TxOrder = txOrders[1];
    expect(prewriteOrder).toBeLessThan(phase3TxOrder);

    // No success postAttempts row should have been written (Phase 3 rolled back).
    const successInsert = db.__insertedRows.find(
      (row) => (row as { outcome?: string }).outcome === 'success',
    );
    expect(successInsert).toBeUndefined();
  });

  it('recovers from a stranded publishing+pre-write state by skipping Twitter and running Phase 3', async () => {
    // This is the retry that lands AFTER a prior attempt's pre-write
    // committed but Phase 3 rolled back. Without the recovery branch the
    // post would be permanently stuck in status='publishing' with the
    // tweet live but no success postAttempts row and no counter bump.
    const lockedPost = seedLockedPost({
      platformPostId: 'tw_recovery_123',
      status: 'publishing',
    });
    const profile = seedSocialProfile();
    db.__pushExecute(() => [lockedPost]);
    // Recovery path skips budget/media/token checks and loads only the
    // profile — single select instead of the happy-path's media+profile.
    db.__pushSelect(() => [profile]);
    const ctx = buildCtx();

    const result = await publishPost(
      db as unknown as Parameters<typeof publishPost>[0],
      ctx,
    );

    // Returns the recovered id without re-calling Twitter.
    expect(result.platformPostId).toBe('tw_recovery_123');
    expect(ctx.publish).not.toHaveBeenCalled();

    // No duplicate pre-write — the marker was already on the row.
    const prewrite = findPlatformPostIdPrewrite(db);
    expect(prewrite).toBeUndefined();

    // Phase 3 completes the lifecycle: success postAttempts row with the
    // recovered id, and the post transitions to 'published'.
    const successAttempt = db.__insertedRows.find(
      (row) => (row as { outcome?: string }).outcome === 'success',
    ) as { platformPostId?: string } | undefined;
    expect(successAttempt?.platformPostId).toBe('tw_recovery_123');
    const publishedUpdate = db.__updates.find(
      (u) => (u.set as { status?: string }).status === 'published',
    );
    expect(publishedUpdate).toBeDefined();
    expect((publishedUpdate?.set as { platformPostId?: string }).platformPostId).toBe(
      'tw_recovery_123',
    );
  });

  it('surfaces the error when the standalone pre-write itself fails (retry stays safe)', async () => {
    seedHappyPath(db);
    const ctx = buildCtx();

    // The service comment explicitly contracts: if the pre-write fails, the
    // error must propagate so BullMQ retries — DO NOT silently swallow. We
    // assert that contract here by making the SECOND db.update call (the
    // standalone pre-write; the first is Phase 1's status='publishing')
    // reject, then verifying the error reaches the caller and no Phase 3
    // side effects occurred.
    const prewriteErr = new Error('simulated db blip during platform_post_id pre-write');
    let updateCount = 0;
    const originalUpdate = (db.update as Mock).getMockImplementation();
    (db.update as Mock).mockImplementation((...args: unknown[]) => {
      updateCount += 1;
      if (updateCount === 2) {
        // Mimic the Drizzle chain shape — .set(...) returns an object with .where(...)
        // and .where(...) returns a rejecting promise (mirroring helpers/mock-db.ts).
        return {
          set: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockRejectedValue(prewriteErr),
          })),
        };
      }
      return (originalUpdate as (...a: unknown[]) => unknown)(...args);
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toBe(prewriteErr);

    // The tweet was sent (we can't recall it) — exactly once.
    expect(ctx.publish).toHaveBeenCalledTimes(1);

    // Phase 3 never ran: no success postAttempts row, no status='published'.
    const successInsert = db.__insertedRows.find(
      (row) => (row as { outcome?: string }).outcome === 'success',
    );
    expect(successInsert).toBeUndefined();
    const publishedUpdate = db.__updates.find(
      (u) => (u.set as { status?: string }).status === 'published',
    );
    expect(publishedUpdate).toBeUndefined();
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
