// End-to-end integration tests for the publish lifecycle. Exercises the full
// pipeline: seed DB rows -> enqueue BullMQ job -> Worker processes job ->
// verify DB state (post status, platform_post_id, post_attempts rows).
//
// Uses real Postgres + Redis testcontainers with Drizzle migrations applied.
// The Twitter HTTP layer is replaced by injecting a mock callTwitter
// implementation via the handler's dependency injection.
//
// Covers: WORKER-04, WORKER-05, WORKER-06, SCHED-04, LIMIT-03

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Queue, Worker, UnrecoverableError } from 'bullmq';
import { eq, sql, and, gte, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { users, socialProfiles, posts, postAttempts } from '@sms/db';
import { QUEUE_NAMES, JOB_NAMES, buildPublishJobId } from '@sms/shared';
import { startTestEnv, type TestEnv } from '../helpers/testcontainer.js';
import {
  createPublishHandler,
  type PublishJobPayload,
  type PublishJobResult,
  type PublishHandlerDeps,
} from '../../publish-worker.js';
import { buildApiResponseError } from '../helpers/mock-twitter.js';

let env: TestEnv;
let publishQueue: Queue<PublishJobPayload>;
let notificationQueue: Queue;

// Stable IDs for test isolation
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const TEST_PROFILE_ID = '00000000-0000-0000-0000-000000000002';

async function seedTestUser() {
  await env.db.insert(users).values({
    id: TEST_USER_ID,
    email: 'integration-test@example.com',
    passwordHash: 'not-a-real-hash-integration-test',
  }).onConflictDoNothing();
}

async function seedTestProfile(overrides: Partial<typeof socialProfiles.$inferInsert> = {}) {
  await env.db.insert(socialProfiles).values({
    id: TEST_PROFILE_ID,
    userId: TEST_USER_ID,
    platform: 'twitter',
    platformUserId: 'tw_integration_test',
    displayName: 'Integration Test Profile',
    handle: 'integration_test',
    consumerKeyCiphertext: 'fake_ck',
    consumerKeyIv: 'fake_ck_iv',
    consumerKeyAuthTag: 'fake_ck_tag',
    consumerSecretCiphertext: 'fake_cs',
    consumerSecretIv: 'fake_cs_iv',
    consumerSecretAuthTag: 'fake_cs_tag',
    accessTokenCiphertext: 'fake_at',
    accessTokenIv: 'fake_at_iv',
    accessTokenAuthTag: 'fake_at_tag',
    accessTokenSecretCiphertext: 'fake_ats',
    accessTokenSecretIv: 'fake_ats_iv',
    accessTokenSecretAuthTag: 'fake_ats_tag',
    monthlyTweetBudget: 500,
    warnThresholdPercent: 80,
    ...overrides,
  }).onConflictDoNothing();
}

async function seedPost(overrides: Partial<typeof posts.$inferInsert> = {}) {
  const postId = overrides.id ?? randomUUID();
  await env.db.insert(posts).values({
    id: postId,
    userId: TEST_USER_ID,
    profileId: TEST_PROFILE_ID,
    text: overrides.text ?? 'Integration test post',
    isThread: overrides.isThread ?? false,
    status: overrides.status ?? 'scheduled',
    scheduledAt: overrides.scheduledAt ?? new Date(),
    postVersion: overrides.postVersion ?? 1,
    platformPostId: overrides.platformPostId ?? null,
    ...overrides,
  });
  return postId;
}

function buildWorkerWithMockedTwitter(
  twitterMock: PublishHandlerDeps['callTwitterImpl'],
  budgetMock?: PublishHandlerDeps['checkBudgetImpl'],
): Worker<PublishJobPayload, PublishJobResult> {
  const handler = createPublishHandler({
    db: env.db,
    notificationQueue,
    callTwitterImpl: twitterMock,
    checkBudgetImpl: budgetMock,
  });

  return new Worker<PublishJobPayload, PublishJobResult>(
    QUEUE_NAMES.publish,
    handler,
    {
      connection: env.redis.duplicate(),
      concurrency: 1,
      // Short lock for tests
      lockDuration: 10_000,
    },
  );
}

async function waitForJobCompletion(
  queue: Queue,
  jobId: string,
  timeoutMs = 15_000,
): Promise<void> {
  const startWait = Date.now();
  while (Date.now() - startWait < timeoutMs) {
    const job = await queue.getJob(jobId);
    if (!job) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
    const state = await job.getState();
    if (state === 'completed' || state === 'failed') return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
}

beforeAll(async () => {
  env = await startTestEnv();
  publishQueue = new Queue<PublishJobPayload>(QUEUE_NAMES.publish, {
    connection: env.redis.duplicate(),
  });
  notificationQueue = new Queue(QUEUE_NAMES.notification, {
    connection: env.redis.duplicate(),
  });
  await seedTestUser();
  await seedTestProfile();
}, 60_000);

afterAll(async () => {
  await publishQueue?.close();
  await notificationQueue?.close();
  await env?.stop();
}, 30_000);

afterEach(async () => {
  // Clean up posts and attempts between tests (leave user and profile)
  await env.db.delete(postAttempts);
  await env.db.delete(posts);
});

describe('post-lifecycle integration', () => {
  it('happy path: publishes a scheduled post and records success attempt (WORKER-05)', async () => {
    const postId = await seedPost({ text: 'Happy path tweet' });
    const tweetId = `tw_happy_${Date.now()}`;

    const twitterMock = vi.fn().mockResolvedValue({ platformPostId: tweetId });
    const worker = buildWorkerWithMockedTwitter(twitterMock);

    try {
      const jobId = buildPublishJobId(postId, 1);
      await publishQueue.add(JOB_NAMES.publishPost, {
        postId,
        postVersion: 1,
        correlationId: randomUUID(),
      }, { jobId });

      await waitForJobCompletion(publishQueue, jobId);

      // Verify post state in DB
      const [updatedPost] = await env.db.select().from(posts).where(eq(posts.id, postId));
      expect(updatedPost.status).toBe('published');
      expect(updatedPost.platformPostId).toBe(tweetId);
      expect(updatedPost.publishedAt).toBeTruthy();

      // Verify post_attempts row
      const attempts = await env.db.select().from(postAttempts).where(eq(postAttempts.postId, postId));
      expect(attempts).toHaveLength(1);
      expect(attempts[0].outcome).toBe('success');
      expect(attempts[0].platformPostId).toBe(tweetId);
      expect(attempts[0].httpStatus).toBe(200);

      expect(twitterMock).toHaveBeenCalledOnce();
    } finally {
      await worker.close();
    }
  }, 30_000);

  it('idempotency: skips Twitter call when platform_post_id already set (WORKER-06)', async () => {
    const existingTweetId = 'tw_already_published';
    const postId = await seedPost({
      text: 'Already published post',
      platformPostId: existingTweetId,
    });

    const twitterMock = vi.fn().mockResolvedValue({ platformPostId: 'should_not_be_used' });
    const worker = buildWorkerWithMockedTwitter(twitterMock);

    try {
      const jobId = buildPublishJobId(postId, 1);
      await publishQueue.add(JOB_NAMES.publishPost, {
        postId,
        postVersion: 1,
        correlationId: randomUUID(),
      }, { jobId });

      await waitForJobCompletion(publishQueue, jobId);

      // Twitter should never have been called
      expect(twitterMock).not.toHaveBeenCalled();

      // Post state should be unchanged (still scheduled with existing platformPostId)
      const [post] = await env.db.select().from(posts).where(eq(posts.id, postId));
      expect(post.platformPostId).toBe(existingTweetId);
    } finally {
      await worker.close();
    }
  }, 30_000);

  it('transient retry: recovers after 503 errors and publishes on third attempt (WORKER-04)', async () => {
    const postId = await seedPost({ text: 'Retry test tweet' });
    const tweetId = `tw_retry_${Date.now()}`;
    let callCount = 0;

    const twitterMock = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        throw buildApiResponseError({ httpStatus: 503, message: 'Service Unavailable' });
      }
      return { platformPostId: tweetId };
    });

    // For transient failures, the lifecycle service sets status back to 'scheduled'
    // and then rethrows the error so BullMQ uses its retry logic. We run 3 separate
    // jobs (simulating BullMQ retry) since the lifecycle expects each attempt as
    // a fresh job invocation with incrementing attemptsMade.
    const handler = createPublishHandler({
      db: env.db,
      notificationQueue,
      callTwitterImpl: twitterMock,
    });

    // Simulate 3 attempts manually against the handler
    const makeJob = (attemptsMade: number) => ({
      data: { postId, postVersion: 1, correlationId: randomUUID() },
      id: `retry-test-${postId}`,
      attemptsMade,
      opts: { attempts: 4 },
    });

    // Attempt 1: should throw (transient)
    await expect(handler(makeJob(0) as any)).rejects.toThrow();

    // Reset post to scheduled (transient failure handler does this, but in our
    // manual test we need to ensure the status is right for the next attempt)
    const [postAfterAttempt1] = await env.db.select().from(posts).where(eq(posts.id, postId));
    expect(postAfterAttempt1.status).toBe('scheduled');

    // Attempt 2: should throw (transient)
    await expect(handler(makeJob(1) as any)).rejects.toThrow();

    const [postAfterAttempt2] = await env.db.select().from(posts).where(eq(posts.id, postId));
    expect(postAfterAttempt2.status).toBe('scheduled');

    // Attempt 3: should succeed
    const result = await handler(makeJob(2) as any);
    expect(result.platformPostId).toBe(tweetId);

    // Verify final DB state
    const [finalPost] = await env.db.select().from(posts).where(eq(posts.id, postId));
    expect(finalPost.status).toBe('published');
    expect(finalPost.platformPostId).toBe(tweetId);

    // Verify attempt history: 2 transient_fail + 1 success
    const attempts = await env.db
      .select()
      .from(postAttempts)
      .where(eq(postAttempts.postId, postId));
    expect(attempts).toHaveLength(3);

    const transientAttempts = attempts.filter((a) => a.outcome === 'transient_fail');
    const successAttempts = attempts.filter((a) => a.outcome === 'success');
    expect(transientAttempts).toHaveLength(2);
    expect(successAttempts).toHaveLength(1);
  }, 30_000);

  it('permanent failure: 401 auth error moves post to failed with one attempt (SCHED-04 / D-10)', async () => {
    const postId = await seedPost({ text: 'Auth failure tweet' });

    const twitterMock = vi.fn().mockRejectedValue(
      buildApiResponseError({ httpStatus: 401, message: 'Unauthorized' }),
    );

    const handler = createPublishHandler({
      db: env.db,
      notificationQueue,
      callTwitterImpl: twitterMock,
    });

    const fakeJob = {
      data: { postId, postVersion: 1, correlationId: randomUUID() },
      id: `perm-fail-${postId}`,
      attemptsMade: 0,
      opts: { attempts: 4 },
    };

    // Should throw UnrecoverableError (caught by BullMQ, no retry)
    await expect(handler(fakeJob as any)).rejects.toThrow(UnrecoverableError);

    // Verify post is now failed
    const [failedPost] = await env.db.select().from(posts).where(eq(posts.id, postId));
    expect(failedPost.status).toBe('failed');
    expect(failedPost.failureReason).toBeTruthy();
    expect(failedPost.failureReason).toContain('credentials');

    // Only one attempt row with permanent_fail
    const attempts = await env.db.select().from(postAttempts).where(eq(postAttempts.postId, postId));
    expect(attempts).toHaveLength(1);
    expect(attempts[0].outcome).toBe('permanent_fail');
    expect(attempts[0].httpStatus).toBe(401);
  }, 30_000);

  it('runtime budget abort: blocks publish when monthly budget exhausted (LIMIT-03)', async () => {
    // Seed profile with budget = 1 and one already-published post
    const budgetProfileId = randomUUID();
    await env.db.insert(socialProfiles).values({
      id: budgetProfileId,
      userId: TEST_USER_ID,
      platform: 'twitter',
      platformUserId: `tw_budget_test_${Date.now()}`,
      displayName: 'Budget Test',
      handle: 'budget_test',
      consumerKeyCiphertext: 'fake_ck',
      consumerKeyIv: 'fake_ck_iv',
      consumerKeyAuthTag: 'fake_ck_tag',
      consumerSecretCiphertext: 'fake_cs',
      consumerSecretIv: 'fake_cs_iv',
      consumerSecretAuthTag: 'fake_cs_tag',
      accessTokenCiphertext: 'fake_at',
      accessTokenIv: 'fake_at_iv',
      accessTokenAuthTag: 'fake_at_tag',
      accessTokenSecretCiphertext: 'fake_ats',
      accessTokenSecretIv: 'fake_ats_iv',
      accessTokenSecretAuthTag: 'fake_ats_tag',
      monthlyTweetBudget: 1,
      warnThresholdPercent: 80,
    });

    // Seed one already-published post this month for the budget profile
    await seedPost({
      profileId: budgetProfileId,
      text: 'Already published this month',
      status: 'published',
      publishedAt: new Date(),
      platformPostId: `tw_budget_existing_${Date.now()}`,
    });

    // Seed the post that should be blocked by budget
    const blockedPostId = await seedPost({
      profileId: budgetProfileId,
      text: 'Should be blocked by budget',
    });

    const twitterMock = vi.fn().mockResolvedValue({ platformPostId: 'should-not-publish' });

    // Do NOT provide a budget mock -- use the real checkBudgetForWorker which
    // reads from the DB. This tests the real budget calculation path.
    const handler = createPublishHandler({
      db: env.db,
      notificationQueue,
      callTwitterImpl: twitterMock,
    });

    const fakeJob = {
      data: { postId: blockedPostId, postVersion: 1, correlationId: randomUUID() },
      id: `budget-test-${blockedPostId}`,
      attemptsMade: 0,
      opts: { attempts: 4 },
    };

    const result = await handler(fakeJob as any);

    // Should have been skipped (budget_exhausted), not published
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('budget_exhausted');

    // Twitter should never have been called
    expect(twitterMock).not.toHaveBeenCalled();

    // Post should still be in scheduled state
    const [post] = await env.db.select().from(posts).where(eq(posts.id, blockedPostId));
    expect(post.status).toBe('scheduled');
  }, 30_000);
});
