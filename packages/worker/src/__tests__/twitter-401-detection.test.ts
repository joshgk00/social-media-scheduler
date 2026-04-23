// Phase 07-04 / TOKEN-04: when Twitter returns 401, the publish worker
// flips the profile to tokenStatus='needs_reauth' via a conditional UPDATE
// (dedupe guard) and emits a `token_revoked` notification exactly once per
// transition.
//
// Emission discipline: the UPDATE runs inside the failure-attempt transaction,
// but the notification enqueue fires AFTER the transaction commits so an
// orphan notification can never be emitted against a rolled-back state change.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Queue } from 'bullmq';
import {
  publishPost,
  type PublishContext,
} from '../post-lifecycle.service.js';
import {
  JOB_NAMES,
  tokenNotificationEventSchema,
} from '@sms/shared';
import { createMockWorkerDb, type MockWorkerDb } from './helpers/mock-db.js';
import { seedLockedPost, seedSocialProfile } from './helpers/seed-post.js';
import { buildApiResponseError } from './helpers/mock-twitter.js';

function buildNotificationQueue(): Queue & { add: ReturnType<typeof vi.fn> } {
  return {
    add: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue & { add: ReturnType<typeof vi.fn> };
}

function buildCtx(
  notificationQueue: Queue,
  overrides: Partial<PublishContext> = {},
): PublishContext {
  return {
    postId: 'post_00000000-0000-0000-0000-000000000001',
    expectedVersion: 1,
    correlationId: 'corr_test_401',
    currentAttemptNum: 1,
    callTwitter: vi.fn(),
    checkBudget: vi.fn().mockResolvedValue({ wouldExceed: false }),
    notificationQueue,
    ...overrides,
  };
}

function seedHappyPath(
  db: MockWorkerDb,
  profileOverrides: Parameters<typeof seedSocialProfile>[0] = {},
) {
  const lockedPost = seedLockedPost();
  const profile = seedSocialProfile(profileOverrides);
  db.__pushExecute(() => [lockedPost]);
  db.__pushSelect(() => [{ count: '0' }]);
  db.__pushSelect(() => [profile]);
  return { lockedPost, profile };
}

describe('publishPost 401 → needs_reauth side effect (TOKEN-04)', () => {
  let db: MockWorkerDb;
  let notificationQueue: Queue & { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    db = createMockWorkerDb();
    notificationQueue = buildNotificationQueue();
  });

  it('UPDATEs tokenStatus=needs_reauth and emits token_revoked when active profile hits 401', async () => {
    seedHappyPath(db, { tokenStatus: 'active' });
    // Conditional UPDATE returns one row (transition fired).
    db.__pushReturning(() => [
      { id: 'profile_00000000-0000-0000-0000-000000000001' },
    ]);

    const authErr = buildApiResponseError({ httpStatus: 401, detail: 'auth revoked' });
    const ctx = buildCtx(notificationQueue, {
      callTwitter: vi.fn().mockRejectedValue(authErr),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toBe(authErr);

    // Profile UPDATE fired with tokenStatus=needs_reauth
    const reauthUpdate = db.__updates.find(
      (u) => (u.set as { tokenStatus?: string }).tokenStatus === 'needs_reauth',
    );
    expect(reauthUpdate).toBeDefined();

    // Notification emitted exactly once
    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
    const [jobName, payload] = notificationQueue.add.mock.calls[0];
    expect(jobName).toBe(JOB_NAMES.tokenRevoked);
    expect(payload).toMatchObject({
      eventType: 'token_revoked',
      profileId: 'profile_00000000-0000-0000-0000-000000000001',
      userId: 'user_00000000-0000-0000-0000-000000000001',
      platform: 'twitter',
      correlationId: 'corr_test_401',
    });

    // Payload round-trips the shared schema
    const parsed = tokenNotificationEventSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('dedupe: UPDATE returns zero rows, no notification emitted', async () => {
    // A concurrent scanner flipped the profile to needs_reauth between
    // lock-time and the 401 response. The conditional UPDATE's RETURNING
    // clause comes back empty — no notification may be emitted.
    seedHappyPath(db, { tokenStatus: 'active' });
    db.__pushReturning(() => []); // UPDATE affected 0 rows

    const authErr = buildApiResponseError({ httpStatus: 401, detail: 'auth revoked' });
    const ctx = buildCtx(notificationQueue, {
      callTwitter: vi.fn().mockRejectedValue(authErr),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toBe(authErr);

    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it('non-auth errors (500 transient) do not flip tokenStatus and do not emit token_revoked', async () => {
    seedHappyPath(db, { tokenStatus: 'active' });
    const transientErr = buildApiResponseError({ httpStatus: 500, detail: 'upstream' });
    const ctx = buildCtx(notificationQueue, {
      callTwitter: vi.fn().mockRejectedValue(transientErr),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toBe(transientErr);

    const reauthUpdate = db.__updates.find(
      (u) => (u.set as { tokenStatus?: string }).tokenStatus === 'needs_reauth',
    );
    expect(reauthUpdate).toBeUndefined();
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it('duplicate content (403 code 187, permanent non-auth) does not flip tokenStatus', async () => {
    seedHappyPath(db, { tokenStatus: 'active' });
    const duplicateErr = buildApiResponseError({
      httpStatus: 403,
      code: 187,
      detail: 'Status is a duplicate',
    });
    const ctx = buildCtx(notificationQueue, {
      callTwitter: vi.fn().mockRejectedValue(duplicateErr),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toBe(duplicateErr);

    const reauthUpdate = db.__updates.find(
      (u) => (u.set as { tokenStatus?: string }).tokenStatus === 'needs_reauth',
    );
    expect(reauthUpdate).toBeUndefined();
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it('notification emit happens AFTER the permanent_fail attempt is inserted (post-commit order)', async () => {
    seedHappyPath(db, { tokenStatus: 'active' });
    db.__pushReturning(() => [
      { id: 'profile_00000000-0000-0000-0000-000000000001' },
    ]);

    const order: string[] = [];
    const originalInsert = db.insert;
    db.insert = vi.fn().mockImplementation(() => {
      const chain = originalInsert();
      const originalValues = chain.values as (row: unknown) => Promise<unknown>;
      chain.values = vi.fn().mockImplementation((row: { outcome?: string }) => {
        if (row.outcome === 'permanent_fail') {
          order.push('insert_permanent_fail');
        }
        return originalValues(row);
      });
      return chain;
    });

    notificationQueue.add = vi.fn().mockImplementation(async () => {
      order.push('notification_add');
    });

    const authErr = buildApiResponseError({ httpStatus: 401, detail: 'auth revoked' });
    const ctx = buildCtx(notificationQueue, {
      callTwitter: vi.fn().mockRejectedValue(authErr),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toBe(authErr);

    expect(order).toEqual(['insert_permanent_fail', 'notification_add']);
  });
});
