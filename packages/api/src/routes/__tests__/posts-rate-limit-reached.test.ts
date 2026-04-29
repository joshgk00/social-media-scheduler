import express from 'express';
import request from 'supertest';
import { DateTime, Settings } from 'luxon';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOB_NAMES, rateLimitReachedNotificationSchema } from '@sms/shared';

import { createPostsRouter } from '../posts.js';

const mockCheckPlatformBudgetWithDb = vi.fn();

vi.mock('../../services/rate-limit.service.js', () => ({
  checkPlatformBudgetWithDb: (...args: unknown[]) => mockCheckPlatformBudgetWithDb(...args),
}));

vi.mock('../../services/post.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/post.service.js')>(
    '../../services/post.service.js',
  );
  return {
    ...actual,
    createPost: vi.fn(),
    updatePost: vi.fn(),
    deletePost: vi.fn(),
    getPostById: vi.fn(),
    getPosts: vi.fn(),
    checkConflicts: vi.fn(),
  };
});

const USER_ID = '44444444-4444-4444-4444-444444444444';
const PROFILE_ID = '22222222-2222-2222-2222-222222222222';
const POST_ID = '11111111-1111-1111-1111-111111111111';
const FIXED_NOW = DateTime.fromISO('2026-04-28T12:00:00Z').toMillis();

function createSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    then: (resolve: (value: unknown[]) => void) => resolve(rows),
  };
  return chain;
}

function createDb(selectRows: unknown[][]) {
  let selectIndex = 0;
  return {
    select: vi.fn(() => createSelectChain(selectRows[selectIndex++] ?? [])),
  };
}

function createTestApp(input: {
  db: ReturnType<typeof createDb>;
  notificationQueue: { add: ReturnType<typeof vi.fn> };
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { id: 'session-1', userId: USER_ID };
    next();
  });
  app.use(createPostsRouter({
    db: input.db as never,
    notificationQueue: input.notificationQueue as never,
    publishQueueService: undefined,
  }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  Settings.now = () => FIXED_NOW;
  mockCheckPlatformBudgetWithDb.mockResolvedValue({
    blockThresholdHit: true,
    warnThresholdHit: false,
    currentUsage: 500,
    budget: 500,
  });
});

afterEach(() => {
  Settings.now = () => Date.now();
});

describe('posts rate_limit_reached producer', () => {
  it('POST enqueues one reached notification per profile and billing month', async () => {
    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
    const app = createTestApp({
      db: createDb([[{ id: PROFILE_ID, platform: 'twitter' }]]),
      notificationQueue,
    });

    const response = await request(app).post('/api/posts').send({
      platform: 'twitter',
      profileId: PROFILE_ID,
      text: 'Blocked by budget',
      status: 'scheduled',
      scheduledAt: '2099-12-31T23:59:00Z',
    });

    expect(response.status).toBe(409);
    expect(notificationQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.rateLimitReachedNotification,
      expect.objectContaining({
        kind: 'rate_limit_reached',
        userId: USER_ID,
        profileId: PROFILE_ID,
        correlationId: expect.any(String),
      }),
      { jobId: `rate-limit-reached:${PROFILE_ID}:2026-04` },
    );
    expect(rateLimitReachedNotificationSchema.safeParse(notificationQueue.add.mock.calls[0][1]).success).toBe(true);
  });

  it('PATCH block-threshold path also enqueues and keeps the 409 response body', async () => {
    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
    const app = createTestApp({
      db: createDb([
        [{
          id: POST_ID,
          profileId: PROFILE_ID,
          status: 'draft',
          postVersion: 1,
          platform: 'twitter',
        }],
        [{ id: PROFILE_ID, platform: 'twitter' }],
      ]),
      notificationQueue,
    });

    const response = await request(app).patch(`/api/posts/${POST_ID}`).send({
      platform: 'twitter',
      postVersion: 1,
      status: 'scheduled',
      scheduledAt: '2099-12-31T23:59:00Z',
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'twitter_budget_exceeded',
      budget: 500,
      currentCount: 500,
    });
    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
  });
});
