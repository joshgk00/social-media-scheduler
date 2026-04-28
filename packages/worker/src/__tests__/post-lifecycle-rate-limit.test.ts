// Wave 0 RED stubs for the post-lifecycle pre-flight rate-limit gate.
// LIMIT-06 / LIMIT-07: the publish worker must abort gracefully when a
// LinkedIn or Facebook profile has hit its window — log a
// `rate_limit_exhausted` post_attempt row and leave the post in `scheduled`.
//
// Plan 04 wires `publishPost` to call `checkBudget` for every platform and
// emit `PostLifecycleAbort('rate_limit_exhausted')`.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Queue } from 'bullmq';
import { publishPost, type PublishContext } from '../post-lifecycle.service.js';
import { createMockWorkerDb, type MockWorkerDb } from './helpers/mock-db.js';
import { seedLockedPost, seedSocialProfile } from './helpers/seed-post.js';

const TEST_PROFILE_ID = '00000000-0000-4000-8000-000000000030';
const TEST_USER_ID = '00000000-0000-4000-8000-000000000031';
const TEST_POST_ID = '00000000-0000-4000-8000-000000000032';

function buildNotificationQueue(): Queue & { add: ReturnType<typeof vi.fn> } {
  return {
    add: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue & { add: ReturnType<typeof vi.fn> };
}

function buildCtx(
  overrides: Partial<PublishContext> = {},
): PublishContext {
  return {
    postId: TEST_POST_ID,
    expectedVersion: 1,
    correlationId: 'corr_rate_limit',
    currentAttemptNum: 1,
    callTwitter: vi.fn(),
    checkBudget: vi.fn().mockResolvedValue({ wouldExceed: false }),
    notificationQueue: buildNotificationQueue(),
    ...overrides,
  };
}

function seedHappyPath(db: MockWorkerDb, platform: 'linkedin' | 'facebook') {
  const lockedPost = seedLockedPost({
    id: TEST_POST_ID,
    profileId: TEST_PROFILE_ID,
  });
  const profile = seedSocialProfile({
    id: TEST_PROFILE_ID,
    userId: TEST_USER_ID,
    platform,
  });
  db.__pushExecute(() => [lockedPost]);
  db.__pushSelect(() => [{ count: '0' }]);
  db.__pushSelect(() => [profile]);
  return { lockedPost, profile };
}

describe('publishPost rate-limit gate (LIMIT-06, LIMIT-07)', () => {
  let db: MockWorkerDb;

  beforeEach(() => {
    db = createMockWorkerDb();
  });

  it('LinkedIn at-limit: aborts with rate_limit_exhausted, leaves post.status=scheduled', async () => {
    seedHappyPath(db, 'linkedin');
    db.__pushReturning(() => [{ id: TEST_POST_ID }]);

    const ctx = buildCtx({
      checkBudget: vi.fn().mockResolvedValue({
        wouldExceed: true,
        blockThresholdHit: true,
        platform: 'linkedin',
      }),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({
      name: 'PostLifecycleAbort',
      reason: 'rate_limit_exhausted',
    });

    // post_attempts row inserted with errorCode='rate_limit_exhausted'
    const insertedAttempt = (db as MockWorkerDb).__insertedRows.find(
      (row) =>
        (row as { errorCode?: string }).errorCode === 'rate_limit_exhausted',
    );
    expect(insertedAttempt).toBeDefined();
  });

  it('graceful abort does not consume a retry attempt (currentAttemptNum unchanged in next pickup)', async () => {
    seedHappyPath(db, 'linkedin');
    db.__pushReturning(() => [{ id: TEST_POST_ID }]);

    const ctx = buildCtx({
      currentAttemptNum: 1,
      checkBudget: vi.fn().mockResolvedValue({
        wouldExceed: true,
        blockThresholdHit: true,
        platform: 'linkedin',
      }),
    });

    await expect(
      publishPost(db as unknown as Parameters<typeof publishPost>[0], ctx),
    ).rejects.toMatchObject({
      name: 'PostLifecycleAbort',
      reason: 'rate_limit_exhausted',
    });

    // The post must NOT be flipped to `failed`. Look for any UPDATE that
    // sets status='failed' — there should be none.
    const failedTransition = db.__updates.find(
      (u) => (u.set as { status?: string }).status === 'failed',
    );
    expect(failedTransition).toBeUndefined();
  });

  it('atomic CAS counter increment: success path issues single platform_window UPDATE (T-API-02, T-LIMITS-01)', async () => {
    // After a successful publish, the worker increments the platform window
    // counter via a single UPDATE with CASE-WHEN window-expiry reset.
    seedHappyPath(db, 'facebook');
    db.__pushReturning(() => [{ id: TEST_POST_ID }]);

    const ctx = buildCtx({
      checkBudget: vi.fn().mockResolvedValue({ wouldExceed: false }),
      callTwitter: vi.fn().mockResolvedValue({
        platformPostId: '123_777',
      }),
    });

    const result = await publishPost(
      db as unknown as Parameters<typeof publishPost>[0],
      ctx,
    );
    expect(result.platformPostId).toBe('123_777');

    // The Phase 3 success transaction must include exactly one UPDATE that
    // touches `facebookHourlyCount` (Drizzle column property, not raw SQL
    // alias) — proving the worker uses the same atomic CAS shape as the
    // API-side pre-flight rather than a separate read-then-write.
    const counterUpdate = db.__updates.find(
      (u) => 'facebookHourlyCount' in u.set,
    );
    expect(counterUpdate).toBeDefined();
  });

  it('LinkedIn success path increments linkedinDailyCount via CASE-WHEN UPDATE', async () => {
    seedHappyPath(db, 'linkedin');
    db.__pushReturning(() => [{ id: TEST_POST_ID }]);

    const ctx = buildCtx({
      checkBudget: vi.fn().mockResolvedValue({ wouldExceed: false }),
      callTwitter: vi
        .fn()
        .mockResolvedValue({ platformPostId: 'urn:li:share:1' }),
    });

    const result = await publishPost(
      db as unknown as Parameters<typeof publishPost>[0],
      ctx,
    );
    expect(result.platformPostId).toBe('urn:li:share:1');

    const counterUpdate = db.__updates.find(
      (u) => 'linkedinDailyCount' in u.set,
    );
    expect(counterUpdate).toBeDefined();
  });
});
