import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { RequestHandler } from 'express';
import { Settings, DateTime } from 'luxon';
import { JOB_NAMES } from '@sms/shared';

import { createApp } from '../../app.js';
import { createMockRedis } from '../helpers/mock-redis.js';

// LIMIT-02 / revision Blocker 5: this suite verifies the rate-limit warn
// notification contract — specifically that the enqueue is deduped to
// exactly one job per profile per billing cycle and that the block
// (would-exceed) path is mutually exclusive with the warn path.

// Auth bootstrap mocks
const mockFindUserByEmail = vi.fn();
const mockVerifyPassword = vi.fn();
const mockUserExists = vi.fn();
const mockUpdateLastLogin = vi.fn();

vi.mock('../../services/auth.service.js', () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  getUserById: vi.fn(),
  hashPassword: vi.fn(),
  userExists: (...args: unknown[]) => mockUserExists(...args),
  createUser: vi.fn(),
  updateLastLogin: (...args: unknown[]) => mockUpdateLastLogin(...args),
  getSecurityQuestions: vi.fn(),
  resetPasswordAndDisableTotp: vi.fn(),
  replaceSecurityQuestions: vi.fn(),
}));

vi.mock('../../services/totp.service.js', () => ({
  verifyTotpCode: vi.fn(),
  generateTotpSecret: vi.fn(),
}));

vi.mock('../../services/session.service.js', () => ({
  invalidateOtherSessions: vi.fn(),
  invalidateAllSessions: vi.fn(),
  SESSION_PREFIX: 'sms:sess:',
}));

vi.mock('../../middleware/csrf.js', () => ({
  doubleCsrfProtection: ((_req: any, _res: any, next: any) => next()) as RequestHandler,
  generateCsrfToken: (_req: any, _res: any) => 'test-csrf-token',
}));

// Stub the admin router so we don't boot the Bull-Board adapter (which
// refuses to wrap a non-BullMQ queue). The admin route is covered by
// admin.test.ts.
vi.mock('../../routes/admin.js', () => ({
  createAdminRouter: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Router } = require('express');
    return Router();
  },
}));

// Mocks for the post service — we only care about create being called
// successfully in the warn-path tests.
const mockCreatePost = vi.fn();
vi.mock('../../services/post.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/post.service.js')>(
    '../../services/post.service.js',
  );
  return {
    ...actual,
    createPost: (...args: unknown[]) => mockCreatePost(...args),
    updatePost: vi.fn(),
    deletePost: vi.fn(),
    getPostById: vi.fn(),
    getPosts: vi.fn(),
    checkConflicts: vi.fn(),
  };
});

// Mock the rate-limit service so tests can drive wouldExceed / warnThresholdHit
// without a real DB. The real wrapper is covered by its own unit tests.
//
// Phase 8: routes/posts.ts now dispatches via checkPlatformBudgetWithDb. The
// dispatcher mock translates the legacy Twitter mock's outputs to the new
// uniform shape (blockThresholdHit / warnThresholdHit / budget / currentUsage).
const mockCheckTwitterBudgetWithDb = vi.fn();
vi.mock('../../services/rate-limit.service.js', () => ({
  loadTwitterUsage: vi.fn(),
  loadLinkedInUsage: vi.fn(),
  loadFacebookUsage: vi.fn(),
  checkTwitterBudgetWithDb: (...args: unknown[]) =>
    mockCheckTwitterBudgetWithDb(...args),
  checkBulkBudgetWithDb: vi.fn(),
  checkLinkedInBudgetWithDb: vi.fn(),
  checkFacebookBudgetWithDb: vi.fn(),
  checkPlatformBudgetWithDb: async (
    _db: unknown,
    args: { profileId: string; platform: string; additionalCount: number },
  ) => {
    if (args.platform !== 'twitter') {
      // Tests in this file only exercise Twitter; non-twitter callers in
      // production have their own dedicated test file.
      return { blockThresholdHit: false, warnThresholdHit: false };
    }
    const result = await mockCheckTwitterBudgetWithDb({
      profileId: args.profileId,
      additionalPostCount: args.additionalCount,
    });
    return {
      blockThresholdHit: result.wouldExceed ?? result.blockThresholdHit ?? false,
      warnThresholdHit: result.warnThresholdHit ?? false,
      budget: result.budget,
      currentUsage: result.currentUsage,
      warnThresholdPercent: result.warnThresholdPercent,
    };
  },
}));

const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440042';
const USER_ID = 'user-1';
const FUTURE_ISO = '2099-12-31T23:59:00Z';

// The route handler looks up the profile row to get its platform before
// running the budget pre-flight. This mock always returns a twitter profile
// for PROFILE_ID and nothing for anything else.
function createMockDb() {
  const db: any = {
    select: vi.fn().mockImplementation(() => {
      const chain: Record<string, any> = {};
      const methods = ['from', 'limit', 'offset', 'orderBy', 'innerJoin', 'leftJoin'];
      for (const method of methods) {
        chain[method] = vi.fn().mockReturnValue(chain);
      }
      chain.where = vi.fn().mockImplementation(() => ({
        then: (resolve: (val: unknown) => void) =>
          resolve([{ id: PROFILE_ID, platform: 'twitter' }]),
      }));
      chain.then = (resolve: (val: unknown) => void) =>
        resolve([{ id: PROFILE_ID, platform: 'twitter' }]);
      return chain;
    }),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };
  return db;
}

function createMockSql() {
  return Object.assign(
    () => Promise.resolve([{ '?column?': 1 }]),
    { end: vi.fn() },
  ) as any;
}

// Minimal in-memory notification queue that emulates BullMQ's jobId dedupe:
// `add()` with an existing jobId is a no-op (returns the original entry).
function createFakeNotificationQueue() {
  const jobs = new Map<string, any>();
  const queue = {
    add: vi.fn().mockImplementation(async (name: string, payload: unknown, opts: any) => {
      const id = opts?.jobId;
      if (!id) {
        const generated = crypto.randomUUID();
        jobs.set(generated, { id: generated, name, data: payload });
        return { id: generated, name, data: payload };
      }
      if (jobs.has(id)) {
        // BullMQ jobId dedupe — return the existing job, do not overwrite.
        return jobs.get(id);
      }
      const entry = { id, name, data: payload, opts };
      jobs.set(id, entry);
      return entry;
    }),
    close: vi.fn(),
    getJobs: () => Array.from(jobs.values()),
    count: () => jobs.size,
    clear: () => jobs.clear(),
  };
  return queue;
}

function createFakePublishQueueService() {
  return {
    publishQueue: { close: vi.fn() } as any,
    enqueuePublish: vi.fn().mockResolvedValue({ id: 'publish-job-1' }),
    cancelScheduled: vi.fn().mockResolvedValue(undefined),
  };
}

function createTestApp(deps: {
  publishQueueService: ReturnType<typeof createFakePublishQueueService>;
  notificationQueue: ReturnType<typeof createFakeNotificationQueue>;
}) {
  return createApp({
    redis: createMockRedis(),
    sql: createMockSql(),
    db: createMockDb(),
    sessionSecret: 'test-secret-that-is-long-enough-for-session',
    publishQueueService: deps.publishQueueService as any,
    notificationQueue: deps.notificationQueue as any,
  });
}

async function authenticatedAgent(app: ReturnType<typeof createTestApp>) {
  const agent = request.agent(app);

  mockUserExists.mockResolvedValueOnce(true);
  mockFindUserByEmail.mockResolvedValueOnce({
    id: USER_ID,
    email: 'test@example.com',
    passwordHash: '$argon2id$hashed',
    totpEnabled: false,
  });
  mockVerifyPassword.mockResolvedValueOnce(true);
  mockUpdateLastLogin.mockResolvedValueOnce(undefined);

  await agent
    .post('/api/auth/login')
    .send({ email: 'test@example.com', password: 'Test-Password-123' });

  return agent;
}

const BODY = {
  // Phase 8: createPostSchema is a discriminated union over `platform`.
  // The fixture body now carries the platform tag explicitly so the warn
  // notification flow exercises the same Zod path as production.
  platform: 'twitter',
  profileId: PROFILE_ID,
  text: 'Hello from a near-threshold Twitter profile',
  status: 'scheduled',
  scheduledAt: FUTURE_ISO,
};

describe('LIMIT-02 rate-limit warn notification enqueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);

    // Pin the billing month so the dedupe key is deterministic.
    Settings.now = () => new Date('2026-04-15T12:00:00Z').getTime();

    mockCreatePost.mockResolvedValue({
      id: 'post-1',
      status: 'scheduled',
      postVersion: 1,
      scheduledAt: FUTURE_ISO,
    });
  });

  afterEach(() => {
    // Restore Luxon's real clock so subsequent suites don't see the frozen time.
    Settings.now = () => Date.now();
  });

  it('Test 1: warn threshold NOT hit → no notification enqueued', async () => {
    mockCheckTwitterBudgetWithDb.mockResolvedValue({
      currentUsage: 100,
      budget: 500,
      warnThresholdPercent: 80,
      projectedCount: 101,
      wouldExceed: false,
      warnThresholdHit: false,
      blockThresholdHit: false,
      remainingBudget: 400,
      monthStartUtc: new Date('2026-04-01T00:00:00Z'),
    });

    const notificationQueue = createFakeNotificationQueue();
    const publishQueueService = createFakePublishQueueService();
    const app = createTestApp({ publishQueueService, notificationQueue });
    const agent = await authenticatedAgent(app);

    const res = await agent.post('/api/posts').send(BODY);

    expect(res.status).toBe(201);
    expect(notificationQueue.count()).toBe(0);
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it('Test 2: warn-hit path enqueues one job with correct payload and dedupe jobId', async () => {
    mockCheckTwitterBudgetWithDb.mockResolvedValue({
      currentUsage: 400,
      budget: 500,
      warnThresholdPercent: 80,
      projectedCount: 401,
      wouldExceed: false,
      warnThresholdHit: true,
      blockThresholdHit: false,
      remainingBudget: 100,
      monthStartUtc: new Date('2026-04-01T00:00:00Z'),
    });

    const notificationQueue = createFakeNotificationQueue();
    const publishQueueService = createFakePublishQueueService();
    const app = createTestApp({ publishQueueService, notificationQueue });
    const agent = await authenticatedAgent(app);

    const res = await agent.post('/api/posts').send(BODY);

    expect(res.status).toBe(201);
    expect(notificationQueue.count()).toBe(1);

    const [enqueuedJob] = notificationQueue.getJobs();
    expect(enqueuedJob.name).toBe(JOB_NAMES.rateLimitWarnNotification);
    expect(enqueuedJob.data).toMatchObject({
      profileId: PROFILE_ID,
      currentUsage: 400,
      monthlyBudget: 500,
      warnThresholdPercent: 80,
    });
    expect(enqueuedJob.data.triggeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('Test 3: jobId follows `rate-limit-warn:{profileId}:YYYY-MM` format', async () => {
    mockCheckTwitterBudgetWithDb.mockResolvedValue({
      currentUsage: 400,
      budget: 500,
      warnThresholdPercent: 80,
      projectedCount: 401,
      wouldExceed: false,
      warnThresholdHit: true,
      blockThresholdHit: false,
      remainingBudget: 100,
      monthStartUtc: new Date('2026-04-01T00:00:00Z'),
    });

    const notificationQueue = createFakeNotificationQueue();
    const publishQueueService = createFakePublishQueueService();
    const app = createTestApp({ publishQueueService, notificationQueue });
    const agent = await authenticatedAgent(app);

    await agent.post('/api/posts').send(BODY);

    const [enqueuedJob] = notificationQueue.getJobs();
    const dedupeKeyPattern =
      /^rate-limit-warn:[0-9a-f-]{36}:\d{4}-\d{2}$/i;
    expect(enqueuedJob.id).toMatch(dedupeKeyPattern);
    const expectedMonth = DateTime.utc().toFormat('yyyy-LL');
    expect(enqueuedJob.id).toBe(
      `rate-limit-warn:${PROFILE_ID}:${expectedMonth}`,
    );
  });

  it('Test 4: two POSTs in the same simulated month produce EXACTLY ONE queued job (BullMQ dedupe)', async () => {
    mockCheckTwitterBudgetWithDb.mockResolvedValue({
      currentUsage: 455,
      budget: 500,
      warnThresholdPercent: 80,
      projectedCount: 456,
      wouldExceed: false,
      warnThresholdHit: true,
      blockThresholdHit: false,
      remainingBudget: 45,
      monthStartUtc: new Date('2026-04-01T00:00:00Z'),
    });

    const notificationQueue = createFakeNotificationQueue();
    const publishQueueService = createFakePublishQueueService();
    const app = createTestApp({ publishQueueService, notificationQueue });
    const agent = await authenticatedAgent(app);

    const first = await agent.post('/api/posts').send(BODY);
    const second = await agent.post('/api/posts').send(BODY);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    // Exactly one job in the queue — BullMQ dedupes by jobId.
    expect(notificationQueue.count()).toBe(1);
  });

  it('Test 5: across-month boundary → two separate notifications', async () => {
    mockCheckTwitterBudgetWithDb.mockResolvedValue({
      currentUsage: 400,
      budget: 500,
      warnThresholdPercent: 80,
      projectedCount: 401,
      wouldExceed: false,
      warnThresholdHit: true,
      blockThresholdHit: false,
      remainingBudget: 100,
      monthStartUtc: new Date('2026-04-01T00:00:00Z'),
    });

    const notificationQueue = createFakeNotificationQueue();
    const publishQueueService = createFakePublishQueueService();
    const app = createTestApp({ publishQueueService, notificationQueue });
    const agent = await authenticatedAgent(app);

    // First POST in April 2026.
    Settings.now = () => new Date('2026-04-15T12:00:00Z').getTime();
    await agent.post('/api/posts').send(BODY);

    // Second POST in May 2026 → different billing month → different jobId.
    Settings.now = () => new Date('2026-05-01T00:00:00Z').getTime();
    await agent.post('/api/posts').send(BODY);

    expect(notificationQueue.count()).toBe(2);
    const jobIds = notificationQueue.getJobs().map((j: any) => j.id);
    expect(jobIds).toContain(`rate-limit-warn:${PROFILE_ID}:2026-04`);
    expect(jobIds).toContain(`rate-limit-warn:${PROFILE_ID}:2026-05`);
  });

  it('Test 6: wouldExceed (block, 409) does NOT enqueue a warn notification', async () => {
    mockCheckTwitterBudgetWithDb.mockResolvedValue({
      currentUsage: 500,
      budget: 500,
      warnThresholdPercent: 80,
      projectedCount: 501,
      wouldExceed: true,
      warnThresholdHit: true,
      blockThresholdHit: true,
      remainingBudget: 0,
      monthStartUtc: new Date('2026-04-01T00:00:00Z'),
    });

    const notificationQueue = createFakeNotificationQueue();
    const publishQueueService = createFakePublishQueueService();
    const app = createTestApp({ publishQueueService, notificationQueue });
    const agent = await authenticatedAgent(app);

    const res = await agent.post('/api/posts').send(BODY);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'twitter_budget_exceeded',
      budget: 500,
      currentCount: 500,
    });
    expect(mockCreatePost).not.toHaveBeenCalled();
    expect(notificationQueue.count()).toBe(0);
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });
});
