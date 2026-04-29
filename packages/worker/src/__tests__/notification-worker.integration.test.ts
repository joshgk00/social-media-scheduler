import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { JOB_NAMES } from '@sms/shared';
import { createNotificationWorker } from '../notification-worker.js';
import { seedPublishFailedJob, seedQueueEmptyJob, seedRateLimitReachedJob, seedRateLimitWarnJob, seedTokenJob } from '../notifications/__tests__/helpers/seed-notification-job.js';
import {
  createIntegrationContext,
  readEmailLogRows,
  readNotificationRows,
  seedNotificationPrefs,
  seedTestPost,
  seedTestProfile,
  seedTestQueue,
  seedTestUser,
  waitForRows,
  type IntegrationContext,
} from './helpers/integration-helpers.js';

describe('notification worker integration', () => {
  let ctx: IntegrationContext;

  beforeAll(async () => {
    ctx = await createIntegrationContext();
  }, 60_000);

  beforeEach(async () => {
    vi.useRealTimers();
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  function createProcessor(overrides: {
    transporter?: typeof ctx.mockTransporter | null;
    smtpFrom?: string | null;
    store?: Parameters<typeof createNotificationWorker>[0]['store'];
    smtp?: Parameters<typeof createNotificationWorker>[0]['smtp'];
  } = {}) {
    return createNotificationWorker({
      db: ctx.db,
      redis: {},
      transporter: overrides.transporter === undefined ? ctx.mockTransporter : overrides.transporter,
      smtpFrom: overrides.smtpFrom === undefined ? 'notifications@example.com' : overrides.smtpFrom,
      appBaseUrl: 'http://localhost:5173',
      store: overrides.store,
      smtp: overrides.smtp,
    });
  }

  async function seedPublishFailureGraph(options: { profileDisplayName?: string; postText?: string } = {}) {
    const user = await seedTestUser(ctx.db);
    const profile = await seedTestProfile(ctx.db, user.id, 'twitter', { displayName: options.profileDisplayName });
    const post = await seedTestPost(ctx.db, user.id, profile.id, { text: options.postText });

    return { user, profile, post };
  }

  it('NOTIF-03 consumes publish_failed into notification and email log rows', async () => {
    const { profile, post } = await seedPublishFailureGraph();

    await createProcessor().process(seedPublishFailedJob({
      postId: post.id,
      profileId: profile.id,
      correlationId: randomUUID(),
    }));

    const notificationRows = await waitForRows(() => readNotificationRows(ctx.db), 1);
    const emailLogRows = await waitForRows(() => readEmailLogRows(ctx.db), 1);

    expect(notificationRows).toHaveLength(1);
    expect(notificationRows[0].eventType).toBe('publish_failed');
    expect(emailLogRows).toHaveLength(1);
    expect(emailLogRows[0].status).toBe('sent');
    expect(ctx.sentEmails).toHaveLength(1);
    expect(ctx.sentEmails[0].subject).toMatch(/^\[SMS\] Publish failed/);
  });

  it('NOTIF-03 honors in-app disabled while still sending email', async () => {
    const { user, profile, post } = await seedPublishFailureGraph();
    await seedNotificationPrefs(ctx.db, user.id, [
      { eventType: 'publish_failed', inAppEnabled: false, emailEnabled: true },
    ]);

    await createProcessor().process(seedPublishFailedJob({
      postId: post.id,
      profileId: profile.id,
      correlationId: randomUUID(),
    }));

    expect(await readNotificationRows(ctx.db)).toHaveLength(0);
    expect(await waitForRows(() => readEmailLogRows(ctx.db), 1)).toHaveLength(1);
    expect(ctx.sentEmails).toHaveLength(1);
  });

  it('NOTIF-03 honors email disabled while keeping in-app notification', async () => {
    const { user, profile, post } = await seedPublishFailureGraph();
    await seedNotificationPrefs(ctx.db, user.id, [
      { eventType: 'publish_failed', inAppEnabled: true, emailEnabled: false },
    ]);

    await createProcessor().process(seedPublishFailedJob({
      postId: post.id,
      profileId: profile.id,
      correlationId: randomUUID(),
    }));

    expect(await waitForRows(() => readNotificationRows(ctx.db), 1)).toHaveLength(1);
    expect(await readEmailLogRows(ctx.db)).toHaveLength(0);
    expect(ctx.sentEmails).toHaveLength(0);
  });

  it('NOTIF-04 token_expiring_soon writes in-app and email rows for the payload user', async () => {
    const user = await seedTestUser(ctx.db);
    const profile = await seedTestProfile(ctx.db, user.id, 'linkedin');

    await createProcessor().process(seedTokenJob(JOB_NAMES.tokenExpiringSoon, {
      eventType: 'token_expiring_soon',
      userId: user.id,
      profileId: profile.id,
      platform: 'linkedin',
      correlationId: randomUUID(),
    }));

    const notificationRows = await waitForRows(() => readNotificationRows(ctx.db), 1);
    const emailLogRows = await waitForRows(() => readEmailLogRows(ctx.db), 1);

    expect(notificationRows[0].userId).toBe(user.id);
    expect(emailLogRows[0].userId).toBe(user.id);
    expect(ctx.sentEmails).toHaveLength(1);
  });

  it('NOTIF-04 accepts non-UUID correlation IDs in email logs', async () => {
    const user = await seedTestUser(ctx.db);
    const profile = await seedTestProfile(ctx.db, user.id, 'linkedin');
    const correlationId = `scan-20260429-${profile.id}`;

    await createProcessor().process(seedTokenJob(JOB_NAMES.tokenExpiringSoon, {
      eventType: 'token_expiring_soon',
      userId: user.id,
      profileId: profile.id,
      platform: 'linkedin',
      correlationId,
    }));

    const emailLogRows = await waitForRows(() => readEmailLogRows(ctx.db), 1);

    expect(emailLogRows[0].correlationId).toBe(correlationId);
  });

  it('NOTIF-05 enforces always-on token_revoked despite disabled prefs', async () => {
    const user = await seedTestUser(ctx.db);
    const profile = await seedTestProfile(ctx.db, user.id, 'facebook');
    await seedNotificationPrefs(ctx.db, user.id, [
      { eventType: 'token_revoked', inAppEnabled: false, emailEnabled: false },
    ]);

    await createProcessor().process(seedTokenJob(JOB_NAMES.tokenRevoked, {
      eventType: 'token_revoked',
      userId: user.id,
      profileId: profile.id,
      platform: 'facebook',
      correlationId: randomUUID(),
    }));

    expect(await waitForRows(() => readNotificationRows(ctx.db), 1)).toHaveLength(1);
    expect(await waitForRows(() => readEmailLogRows(ctx.db), 1)).toHaveLength(1);
    expect(ctx.sentEmails).toHaveLength(1);
  });

  it('NOTIF-06 rate_limit_warn is in-app only', async () => {
    const user = await seedTestUser(ctx.db);
    const profile = await seedTestProfile(ctx.db, user.id, 'twitter');

    await createProcessor().process(seedRateLimitWarnJob({
      profileId: profile.id,
      triggeredAt: new Date().toISOString(),
    }));

    expect(await waitForRows(() => readNotificationRows(ctx.db), 1)).toHaveLength(1);
    expect(await readEmailLogRows(ctx.db)).toHaveLength(0);
    expect(ctx.sentEmails).toHaveLength(0);
  });

  it('NOTIF-07 rate_limit_reached uses payload userId and sends always-on email', async () => {
    const user = await seedTestUser(ctx.db);
    const profile = await seedTestProfile(ctx.db, user.id, 'twitter');
    await seedNotificationPrefs(ctx.db, user.id, [
      { eventType: 'rate_limit_reached', inAppEnabled: false, emailEnabled: false },
    ]);

    await createProcessor().process(seedRateLimitReachedJob({
      userId: user.id,
      profileId: profile.id,
      correlationId: randomUUID(),
    }));

    expect(await waitForRows(() => readNotificationRows(ctx.db), 1)).toHaveLength(1);
    expect(await waitForRows(() => readEmailLogRows(ctx.db), 1)).toHaveLength(1);
    expect(ctx.sentEmails).toHaveLength(1);
  });

  it('NOTIF-08 queue_empty resolves user from queue and skips email', async () => {
    const user = await seedTestUser(ctx.db);
    const profile = await seedTestProfile(ctx.db, user.id, 'twitter');
    const queue = await seedTestQueue(ctx.db, user.id, profile.id);

    await createProcessor().process(seedQueueEmptyJob({
      queueId: queue.id,
      profileId: profile.id,
      correlationId: randomUUID(),
    }));

    const notificationRows = await waitForRows(() => readNotificationRows(ctx.db), 1);
    expect(notificationRows[0].userId).toBe(user.id);
    expect(await readEmailLogRows(ctx.db)).toHaveLength(0);
  });

  it('NOTIF-09 bulk_completed is an acked no-op stub', async () => {
    await createProcessor().process({
      id: 'bulk-job-1',
      name: 'bulk-completed',
      data: { correlationId: randomUUID() },
      attemptsMade: 0,
    });

    expect(await readNotificationRows(ctx.db)).toHaveLength(0);
    expect(await readEmailLogRows(ctx.db)).toHaveLength(0);
  });

  it('T-09-DUP dedupes repeated correlationId notification inserts', async () => {
    const { profile, post } = await seedPublishFailureGraph();
    const correlationId = randomUUID();
    const worker = createProcessor();

    await worker.process(seedPublishFailedJob({ postId: post.id, profileId: profile.id, correlationId }));
    await worker.process({
      ...seedPublishFailedJob({ postId: post.id, profileId: profile.id, correlationId }),
      id: 'notification-job-2',
    });

    expect(await waitForRows(() => readNotificationRows(ctx.db), 1)).toHaveLength(1);
  });

  it('T-09-SMTP-INJ records CRLF subject rejection without losing in-app notification', async () => {
    const { profile, post } = await seedPublishFailureGraph({ profileDisplayName: 'Foo\nBcc: attacker@example.com' });

    await createProcessor().process(seedPublishFailedJob({
      postId: post.id,
      profileId: profile.id,
      correlationId: randomUUID(),
    }));

    const notificationRows = await waitForRows(() => readNotificationRows(ctx.db), 1);
    const emailLogRows = await waitForRows(() => readEmailLogRows(ctx.db), 1);

    expect(notificationRows).toHaveLength(1);
    expect(emailLogRows[0].status).toBe('failed');
    expect(emailLogRows[0].errorMessage).toContain('CRLF detected in subject');
    expect(ctx.sentEmails).toHaveLength(0);
  });

  it('T-09-XSS-EMAIL escapes user-controlled HTML in email bodies', async () => {
    const { profile, post } = await seedPublishFailureGraph();

    await createProcessor().process(seedPublishFailedJob({
      postId: post.id,
      profileId: profile.id,
      errorMessage: '<script>alert(1)</script>',
      correlationId: randomUUID(),
    }));

    expect(ctx.sentEmails).toHaveLength(1);
    expect(ctx.sentEmails[0].html).not.toContain('<script>');
    expect(ctx.sentEmails[0].html).toContain('&lt;script&gt;');
  });

  it('D-19 records failed email log when SMTP is not configured', async () => {
    const { profile, post } = await seedPublishFailureGraph();

    await createProcessor({ transporter: null, smtpFrom: null }).process(seedPublishFailedJob({
      postId: post.id,
      profileId: profile.id,
      correlationId: randomUUID(),
    }));

    const notificationRows = await waitForRows(() => readNotificationRows(ctx.db), 1);
    const emailLogRows = await waitForRows(() => readEmailLogRows(ctx.db), 1);

    expect(notificationRows).toHaveLength(1);
    expect(emailLogRows[0].status).toBe('failed');
    expect(emailLogRows[0].errorMessage).toBe('smtp_not_configured');
  });

  it('Pitfall 3 rejects when only in-app insert fails and email succeeds', async () => {
    const { profile, post } = await seedPublishFailureGraph();
    const insertNotificationError = new Error('insert failed');
    const store = {
      insertNotification: vi.fn().mockRejectedValue(insertNotificationError),
      insertEmailLog: vi.fn(),
    };

    await expect(createProcessor({ store }).process(seedPublishFailedJob({
      postId: post.id,
      profileId: profile.id,
      correlationId: randomUUID(),
    }))).rejects.toThrow('insert failed');

    expect(store.insertNotification).toHaveBeenCalled();
    expect(store.insertEmailLog).toHaveBeenCalled();
    expect(ctx.sentEmails).toHaveLength(1);
  });

  it('Pitfall 3 throws AggregateError when in-app and email paths both fail', async () => {
    const { profile, post } = await seedPublishFailureGraph();
    const sideEffectError = new Error('side effect failed');
    const store = {
      insertNotification: vi.fn().mockRejectedValue(sideEffectError),
      insertEmailLog: vi.fn(),
    };
    const smtp = {
      sendEmail: vi.fn().mockRejectedValue(sideEffectError),
    };

    await expect(createProcessor({ store, smtp }).process(seedPublishFailedJob({
      postId: post.id,
      profileId: profile.id,
      correlationId: randomUUID(),
    }))).rejects.toThrow(AggregateError);
  });

  it('uses default notification worker concurrency of 2', async () => {
    const previousConcurrency = process.env.NOTIFICATION_WORKER_CONCURRENCY;
    delete process.env.NOTIFICATION_WORKER_CONCURRENCY;
    const worker = createNotificationWorker({ db: ctx.db, redis: ctx.redisClient });

    try {
      expect(worker.concurrency).toBe(2);
    } finally {
      await worker.close();
      if (previousConcurrency === undefined) {
        delete process.env.NOTIFICATION_WORKER_CONCURRENCY;
      } else {
        process.env.NOTIFICATION_WORKER_CONCURRENCY = previousConcurrency;
      }
    }
  });

  it('uses NOTIFICATION_WORKER_CONCURRENCY from env', async () => {
    const previousConcurrency = process.env.NOTIFICATION_WORKER_CONCURRENCY;
    process.env.NOTIFICATION_WORKER_CONCURRENCY = '4';
    const worker = createNotificationWorker({ db: ctx.db, redis: ctx.redisClient });

    try {
      expect(worker.concurrency).toBe(4);
    } finally {
      await worker.close();
      if (previousConcurrency === undefined) {
        delete process.env.NOTIFICATION_WORKER_CONCURRENCY;
      } else {
        process.env.NOTIFICATION_WORKER_CONCURRENCY = previousConcurrency;
      }
    }
  });

  it('unknown notification job names throw UnrecoverableError', async () => {
    await expect(createProcessor().process({
      id: 'unknown-job-1',
      name: 'unknown-event',
      data: {},
      attemptsMade: 0,
    })).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
