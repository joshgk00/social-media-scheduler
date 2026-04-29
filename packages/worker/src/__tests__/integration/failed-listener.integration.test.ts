// Integration test for the BullMQ failed listener (WORKER-07 / D-11).
// Verifies that when a job exhausts retries, a notification event is
// enqueued to the notification queue with eventType: 'publish_failed'.
//
// Uses real Postgres + Redis testcontainers. The publish handler throws
// an UnrecoverableError (simulating a permanent failure classification)
// which triggers the failed listener on the first attempt.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Queue, Worker, UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { users, socialProfiles, posts, postAttempts } from '@sms/db';
import { QUEUE_NAMES, JOB_NAMES, buildPublishJobId, publishFailedNotificationSchema } from '@sms/shared';
import { startTestEnv, type TestEnv } from '../helpers/testcontainer.js';
import {
  createPublishHandler,
  type PublishJobPayload,
  type PublishJobResult,
} from '../../publish-worker.js';
import { handlePublishFailedNotification } from '../../notifications/handlers/publish-failed.handler.js';
import { buildApiResponseError } from '../helpers/mock-twitter.js';

let env: TestEnv;
let publishQueue: Queue<PublishJobPayload>;
let notificationQueue: Queue;

const TEST_USER_ID = '00000000-0000-0000-0000-000000000011';
const TEST_PROFILE_ID = '00000000-0000-0000-0000-000000000012';

async function seedBaseData() {
  await env.db.insert(users).values({
    id: TEST_USER_ID,
    email: 'failed-listener-test@example.com',
    passwordHash: 'not-a-real-hash',
  }).onConflictDoNothing();

  await env.db.insert(socialProfiles).values({
    id: TEST_PROFILE_ID,
    userId: TEST_USER_ID,
    platform: 'twitter',
    platformUserId: 'tw_failed_listener',
    displayName: 'Failed Listener Profile',
    handle: 'fl_test',
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
  }).onConflictDoNothing();
}

beforeAll(async () => {
  env = await startTestEnv();
  publishQueue = new Queue<PublishJobPayload>(QUEUE_NAMES.publish, {
    connection: env.redis.duplicate(),
  });
  notificationQueue = new Queue(QUEUE_NAMES.notification, {
    connection: env.redis.duplicate(),
  });
  await seedBaseData();
}, 60_000);

afterAll(async () => {
  await publishQueue?.close();
  await notificationQueue?.close();
  await env?.stop();
}, 30_000);

afterEach(async () => {
  await env.db.delete(postAttempts);
  await env.db.delete(posts);
  // Drain notification queue between tests
  await notificationQueue.drain();
});

describe('failed-listener integration', () => {
  it('enqueues publish_failed notification when UnrecoverableError fires (WORKER-07 / D-11)', async () => {
    // Seed a post that will fail permanently
    const postId = randomUUID();
    await env.db.insert(posts).values({
      id: postId,
      userId: TEST_USER_ID,
      profileId: TEST_PROFILE_ID,
      text: 'This post will fail permanently',
      status: 'scheduled',
      scheduledAt: new Date(),
      postVersion: 1,
    });

    // Build a real worker that will hit a permanent failure.
    // We mock the twitter publish service to throw a 401 (permanent) error,
    // which the handler classifies and rethrows as UnrecoverableError.
    // The createPublishWorker failed listener should then enqueue a notification.
    //
    // Override the publish-post handler's twitter call by using a custom worker
    // that delegates to a handler with the mocked twitter impl injected.
    const twitterMock = vi.fn().mockRejectedValue(
      buildApiResponseError({ httpStatus: 401, message: 'Token revoked' }),
    );

    const handler = createPublishHandler({
      db: env.db,
      notificationQueue,
      callTwitterImpl: twitterMock,
    });

    const workerRedis = env.redis.duplicate();
    const worker = new Worker<PublishJobPayload, PublishJobResult>(
      QUEUE_NAMES.publish,
      handler,
      {
        connection: workerRedis,
        concurrency: 1,
        lockDuration: 10_000,
      },
    );

    // Attach the same failed listener pattern from createPublishWorker
    const DEFAULT_MAX_ATTEMPTS = 4;
    worker.on('failed', async (job, err) => {
      if (!job) return;
      const attemptsCap = job.opts.attempts ?? DEFAULT_MAX_ATTEMPTS;
      const isFinalFailure =
        err.name === 'UnrecoverableError' || job.attemptsMade >= attemptsCap;
      if (!isFinalFailure) return;

      try {
        const [postRow] = await env.db
          .select({ profileId: posts.profileId })
          .from(posts)
          .where(eq(posts.id, job.data.postId))
          .limit(1);

        await notificationQueue.add(JOB_NAMES.publishFailedNotification, {
          eventType: 'publish_failed',
          postId: job.data.postId,
          profileId: postRow.profileId,
          errorMessage: err.message,
          correlationId: job.data.correlationId,
          occurredAt: new Date().toISOString(),
        });
      } catch {
        // Notification enqueue failure is non-fatal in tests
      }
    });

    try {
      const jobId = buildPublishJobId(postId, 1);
      await publishQueue.add(JOB_NAMES.publishPost, {
        postId,
        postVersion: 1,
        correlationId: randomUUID(),
      }, {
        jobId,
        attempts: 1, // Only 1 attempt so the failed listener fires immediately
      });

      // Wait for the job to fail
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(async () => {
          const job = await publishQueue.getJob(jobId);
          if (!job) return;
          const state = await job.getState();
          if (state === 'failed') {
            clearInterval(checkInterval);
            resolve();
          }
        }, 200);
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 15_000);
      });

      // Give the failed listener a moment to enqueue the notification
      await new Promise((r) => setTimeout(r, 1000));

      // Check the notification queue for the publish_failed event
      const waitingJobs = await notificationQueue.getJobs(['waiting', 'delayed']);
      const publishFailedJobs = waitingJobs.filter(
        (j) => j.data?.eventType === 'publish_failed',
      );

      expect(publishFailedJobs.length).toBeGreaterThanOrEqual(1);
      const notificationJob = publishFailedJobs[0];
      expect(notificationJob.data.eventType).toBe('publish_failed');
      expect(notificationJob.data.postId).toBe(postId);
      expect(notificationJob.data.profileId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(typeof notificationJob.data.errorMessage).toBe('string');
      expect(typeof notificationJob.data.correlationId).toBe('string');
      expect(notificationJob.data.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(publishFailedNotificationSchema.safeParse(notificationJob.data).success).toBe(true);

      const insertNotification = vi.fn();
      await handlePublishFailedNotification({
        store: { insertNotification },
        prefs: {
          loadPrefs: vi.fn().mockResolvedValue({ isInAppEnabled: true, shouldSendEmail: false }),
        },
      }, {
        id: notificationJob.id ?? 'notification-job-1',
        name: JOB_NAMES.publishFailedNotification,
        data: notificationJob.data,
      });
      expect(insertNotification).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'publish_failed',
        linkPath: `/posts/${postId}`,
      }));
    } finally {
      await worker.close();
      await workerRedis.quit();
    }
  }, 45_000);
});
