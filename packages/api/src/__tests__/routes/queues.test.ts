import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { createMockRedis } from '../helpers/mock-redis.js';
import type { RequestHandler } from 'express';

const mockCreateQueue = vi.fn();
const mockUpdateQueue = vi.fn();
const mockDeleteQueue = vi.fn();
const mockGetQueues = vi.fn();
const mockGetQueueById = vi.fn();
const mockCopyQueueConfig = vi.fn();
const mockAddPostToQueue = vi.fn();
const mockRemovePostFromQueue = vi.fn();
const mockGetQueuePosts = vi.fn();
const mockMovePostUp = vi.fn();
const mockMovePostDown = vi.fn();

vi.mock('../../services/queue.service.js', async () => {
  const { QueueServiceError } = await vi.importActual<typeof import('../../services/queue.service.js')>('../../services/queue.service.js');
  return {
    createQueue: (...args: unknown[]) => mockCreateQueue(...args),
    updateQueue: (...args: unknown[]) => mockUpdateQueue(...args),
    deleteQueue: (...args: unknown[]) => mockDeleteQueue(...args),
    getQueues: (...args: unknown[]) => mockGetQueues(...args),
    getQueueById: (...args: unknown[]) => mockGetQueueById(...args),
    copyQueueConfig: (...args: unknown[]) => mockCopyQueueConfig(...args),
    addPostToQueue: (...args: unknown[]) => mockAddPostToQueue(...args),
    removePostFromQueue: (...args: unknown[]) => mockRemovePostFromQueue(...args),
    getQueuePosts: (...args: unknown[]) => mockGetQueuePosts(...args),
    movePostUp: (...args: unknown[]) => mockMovePostUp(...args),
    movePostDown: (...args: unknown[]) => mockMovePostDown(...args),
    QueueServiceError,
  };
});

const mockCreatePost = vi.fn();
const mockUpdatePost = vi.fn();
const mockDeletePost = vi.fn();
const mockGetPostById = vi.fn();
const mockGetPosts = vi.fn();
const mockCheckConflicts = vi.fn();

vi.mock('../../services/post.service.js', () => {
  class PostServiceError extends Error {
    constructor(message: string, public readonly statusCode: number) {
      super(message);
      this.name = 'PostServiceError';
    }
  }
  return {
    createPost: (...args: unknown[]) => mockCreatePost(...args),
    updatePost: (...args: unknown[]) => mockUpdatePost(...args),
    deletePost: (...args: unknown[]) => mockDeletePost(...args),
    getPostById: (...args: unknown[]) => mockGetPostById(...args),
    getPosts: (...args: unknown[]) => mockGetPosts(...args),
    checkConflicts: (...args: unknown[]) => mockCheckConflicts(...args),
    PostServiceError,
  };
});

const mockCreateProfile = vi.fn();
const mockGetProfiles = vi.fn();
const mockGetProfileById = vi.fn();
const mockDeleteProfile = vi.fn();

vi.mock('../../services/profile.service.js', () => {
  class ProfileServiceError extends Error {
    constructor(message: string, public readonly statusCode: number) {
      super(message);
      this.name = 'ProfileServiceError';
    }
  }
  return {
    createProfile: (...args: unknown[]) => mockCreateProfile(...args),
    getProfiles: (...args: unknown[]) => mockGetProfiles(...args),
    getProfileById: (...args: unknown[]) => mockGetProfileById(...args),
    deleteProfile: (...args: unknown[]) => mockDeleteProfile(...args),
    ProfileServiceError,
  };
});

const mockFindUserByEmail = vi.fn();
const mockVerifyPassword = vi.fn();
const mockGetUserById = vi.fn();
const mockHashPassword = vi.fn();
const mockUserExists = vi.fn();
const mockCreateUser = vi.fn();
const mockUpdateLastLogin = vi.fn();
const mockGetSecurityQuestions = vi.fn();
const mockResetPasswordAndDisableTotp = vi.fn();
const mockReplaceSecurityQuestions = vi.fn();

vi.mock('../../services/auth.service.js', () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  userExists: (...args: unknown[]) => mockUserExists(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  updateLastLogin: (...args: unknown[]) => mockUpdateLastLogin(...args),
  getSecurityQuestions: (...args: unknown[]) => mockGetSecurityQuestions(...args),
  resetPasswordAndDisableTotp: (...args: unknown[]) => mockResetPasswordAndDisableTotp(...args),
  replaceSecurityQuestions: (...args: unknown[]) => mockReplaceSecurityQuestions(...args),
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

vi.mock('sharp', () => {
  const sharpInstance = {
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    toFormat: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue({}),
  };
  return { default: vi.fn().mockReturnValue(sharpInstance) };
});

vi.mock('node:fs/promises', () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

function createMockSql() {
  return Object.assign(
    () => Promise.resolve([{ '?column?': 1 }]),
    { end: vi.fn() },
  ) as any;
}

function createMockDb() {
  const chainable = (terminal: unknown = []) => {
    const chain: Record<string, any> = {};
    const methods = ['from', 'where', 'values', 'returning', 'set', 'limit', 'offset', 'orderBy', 'innerJoin', 'leftJoin', 'groupBy'];
    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    chain.then = (resolve: (val: unknown) => void) => resolve(terminal);
    return chain;
  };

  return {
    select: vi.fn().mockReturnValue(chainable([])),
    insert: vi.fn().mockReturnValue(chainable([])),
    update: vi.fn().mockReturnValue(chainable()),
    delete: vi.fn().mockReturnValue(chainable()),
    transaction: vi.fn(),
  } as any;
}

function createTestApp() {
  return createApp({
    redis: createMockRedis(),
    sql: createMockSql(),
    db: createMockDb(),
    sessionSecret: 'test-secret-that-is-long-enough-for-session',
  });
}

async function authenticatedAgent() {
  const app = createTestApp();
  const agent = request.agent(app);

  mockUserExists.mockResolvedValueOnce(true);
  mockFindUserByEmail.mockResolvedValueOnce({
    id: 'user-1',
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

const QUEUE_ID = '550e8400-e29b-41d4-a716-446655440010';
const POST_ID = '550e8400-e29b-41d4-a716-446655440011';
const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440012';

const VALID_QUEUE_INPUT = {
  name: 'Morning Twitter Queue',
  profileId: PROFILE_ID,
  intervalType: 'fixed',
  intervalValue: 4,
  intervalUnit: 'hours',
  daysOfWeek: [1, 2, 3, 4, 5],
  hourSlots: [9, 12, 15, 18],
};

const SAMPLE_QUEUE = {
  id: QUEUE_ID,
  userId: 'user-1',
  profileId: PROFILE_ID,
  name: 'Morning Twitter Queue',
  intervalType: 'fixed',
  intervalValue: 4,
  intervalUnit: 'hours',
  daysOfWeek: [1, 2, 3, 4, 5],
  hourSlots: [9, 12, 15, 18],
  seasonalStart: null,
  seasonalEnd: null,
  seasonalRepeat: false,
  isRecycling: false,
  isPaused: false,
  cursorPosition: 0,
  startDate: null,
  lastPublishedAt: null,
  nextRunAt: '2026-04-14T09:00:00.000Z',
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const SAMPLE_QUEUE_LIST_ITEM = {
  id: QUEUE_ID,
  name: 'Morning Twitter Queue',
  profileId: PROFILE_ID,
  profileName: 'Test User',
  network: 'twitter',
  isPaused: false,
  isRecycling: false,
  lastPublishedAt: null,
  nextRunAt: '2026-04-14T09:00:00.000Z',
  cursorPosition: 0,
  seasonalStart: null,
  seasonalEnd: null,
  hourSlots: [9, 12, 15, 18],
  daysOfWeek: [1, 2, 3, 4, 5],
  notes: null,
  postCount: 3,
};

describe('queues routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  describe('POST /api/queues', () => {
    it('returns 201 with queue object on valid input', async () => {
      mockCreateQueue.mockResolvedValueOnce(SAMPLE_QUEUE);
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/queues')
        .send(VALID_QUEUE_INPUT);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', QUEUE_ID);
      expect(res.body).toHaveProperty('name', 'Morning Twitter Queue');
      expect(res.body).toHaveProperty('profileId', PROFILE_ID);
    });

    it('returns 400 when name is missing', async () => {
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/queues')
        .send({ ...VALID_QUEUE_INPUT, name: '' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });

    it('returns 400 when hourSlots has value outside 6-23 range', async () => {
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/queues')
        .send({ ...VALID_QUEUE_INPUT, hourSlots: [5, 9, 12] });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });

    it('returns 400 when daysOfWeek is empty', async () => {
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/queues')
        .send({ ...VALID_QUEUE_INPUT, daysOfWeek: [] });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/api/queues')
        .send(VALID_QUEUE_INPUT);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/queues', () => {
    it('returns 200 with array of queues for authenticated user', async () => {
      mockGetQueues.mockResolvedValueOnce([SAMPLE_QUEUE_LIST_ITEM]);
      const agent = await authenticatedAgent();

      const res = await agent.get('/api/queues');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toHaveProperty('id', QUEUE_ID);
    });

    it('passes status filter to service', async () => {
      mockGetQueues.mockResolvedValueOnce([]);
      const agent = await authenticatedAgent();

      await agent.get('/api/queues?status=active');

      expect(mockGetQueues).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.objectContaining({ status: 'active' }),
      );
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/queues');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/queues/:id', () => {
    it('returns 200 for owned queue', async () => {
      mockGetQueueById.mockResolvedValueOnce(SAMPLE_QUEUE);
      const agent = await authenticatedAgent();

      const res = await agent.get(`/api/queues/${QUEUE_ID}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', QUEUE_ID);
    });

    it('returns 404 for non-owned queue', async () => {
      mockGetQueueById.mockResolvedValueOnce(null);
      const agent = await authenticatedAgent();

      const res = await agent.get(`/api/queues/${QUEUE_ID}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Queue not found');
    });
  });

  describe('PUT /api/queues/:id', () => {
    it('updates schedule configuration', async () => {
      const updatedQueue = { ...SAMPLE_QUEUE, intervalValue: 6 };
      mockUpdateQueue.mockResolvedValueOnce(updatedQueue);
      const agent = await authenticatedAgent();

      const res = await agent
        .put(`/api/queues/${QUEUE_ID}`)
        .send({ intervalValue: 6 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('intervalValue', 6);
    });

    it('returns 404 for non-owned queue', async () => {
      const { QueueServiceError } = await import('../../services/queue.service.js');
      mockUpdateQueue.mockRejectedValueOnce(new QueueServiceError('Queue not found', 404));
      const agent = await authenticatedAgent();

      const res = await agent
        .put(`/api/queues/${QUEUE_ID}`)
        .send({ intervalValue: 6 });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/queues/:id', () => {
    it('returns 204 and removes queue', async () => {
      mockDeleteQueue.mockResolvedValueOnce(undefined);
      const agent = await authenticatedAgent();

      const res = await agent.delete(`/api/queues/${QUEUE_ID}`);

      expect(res.status).toBe(204);
    });

    it('returns 404 for non-owned queue', async () => {
      const { QueueServiceError } = await import('../../services/queue.service.js');
      mockDeleteQueue.mockRejectedValueOnce(new QueueServiceError('Queue not found', 404));
      const agent = await authenticatedAgent();

      const res = await agent.delete(`/api/queues/${QUEUE_ID}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/queues/:id/config', () => {
    it('returns schedule config fields only', async () => {
      const config = {
        name: 'Morning Twitter Queue',
        profileId: PROFILE_ID,
        intervalType: 'fixed',
        intervalValue: 4,
        intervalUnit: 'hours',
        daysOfWeek: [1, 2, 3, 4, 5],
        hourSlots: [9, 12, 15, 18],
        seasonalStart: null,
        seasonalEnd: null,
        seasonalRepeat: false,
        isRecycling: false,
        notes: null,
      };
      mockCopyQueueConfig.mockResolvedValueOnce(config);
      const agent = await authenticatedAgent();

      const res = await agent.get(`/api/queues/${QUEUE_ID}/config`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', 'Morning Twitter Queue');
      expect(res.body).not.toHaveProperty('id');
      expect(res.body).not.toHaveProperty('isPaused');
      expect(res.body).not.toHaveProperty('cursorPosition');
    });
  });

  describe('POST /api/queues/:id/posts', () => {
    it('adds post to queue and returns 201', async () => {
      mockAddPostToQueue.mockResolvedValueOnce(undefined);
      const agent = await authenticatedAgent();

      const res = await agent
        .post(`/api/queues/${QUEUE_ID}/posts`)
        .send({ postId: POST_ID });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('success', true);
    });

    it('returns 409 when post is already in another queue', async () => {
      const { QueueServiceError } = await import('../../services/queue.service.js');
      mockAddPostToQueue.mockRejectedValueOnce(
        new QueueServiceError('Post is already assigned to another queue', 409),
      );
      const agent = await authenticatedAgent();

      const res = await agent
        .post(`/api/queues/${QUEUE_ID}/posts`)
        .send({ postId: POST_ID });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already assigned');
    });

    it('returns 400 when postId is missing', async () => {
      const agent = await authenticatedAgent();

      const res = await agent
        .post(`/api/queues/${QUEUE_ID}/posts`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/queues/:id/posts', () => {
    it('returns posts ordered by position', async () => {
      const queuePosts = [
        { id: POST_ID, text: 'First post', status: 'queued', hasSpinnableText: false, autoDestructAfter: null, queuePosition: 1, platformPostId: null, publishedAt: null },
        { id: '550e8400-e29b-41d4-a716-446655440099', text: 'Second post', status: 'queued', hasSpinnableText: false, autoDestructAfter: null, queuePosition: 2, platformPostId: null, publishedAt: null },
      ];
      mockGetQueuePosts.mockResolvedValueOnce(queuePosts);
      const agent = await authenticatedAgent();

      const res = await agent.get(`/api/queues/${QUEUE_ID}/posts`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].queuePosition).toBe(1);
      expect(res.body[1].queuePosition).toBe(2);
    });

    it('passes queue search params through to the service', async () => {
      mockGetQueuePosts.mockResolvedValueOnce([]);
      const agent = await authenticatedAgent();

      const res = await agent.get(`/api/queues/${QUEUE_ID}/posts?search=announcement&searchScope=queue`);

      expect(res.status).toBe(200);
      expect(mockGetQueuePosts).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        QUEUE_ID,
        { search: 'announcement' },
      );
    });
  });

  describe('POST /api/queues/:id/posts/:postId/move-up', () => {
    it('swaps positions correctly', async () => {
      mockMovePostUp.mockResolvedValueOnce(undefined);
      const agent = await authenticatedAgent();

      const res = await agent
        .post(`/api/queues/${QUEUE_ID}/posts/${POST_ID}/move-up`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(mockMovePostUp).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        QUEUE_ID,
        POST_ID,
      );
    });

    it('returns 200 as no-op when post is at position 1', async () => {
      mockMovePostUp.mockResolvedValueOnce(undefined);
      const agent = await authenticatedAgent();

      const res = await agent
        .post(`/api/queues/${QUEUE_ID}/posts/${POST_ID}/move-up`);

      expect(res.status).toBe(200);
    });

    it('returns 404 when post not in queue', async () => {
      const { QueueServiceError } = await import('../../services/queue.service.js');
      mockMovePostUp.mockRejectedValueOnce(
        new QueueServiceError('Post not found in this queue', 404),
      );
      const agent = await authenticatedAgent();

      const res = await agent
        .post(`/api/queues/${QUEUE_ID}/posts/${POST_ID}/move-up`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/queues/:id/posts/:postId/move-down', () => {
    it('swaps positions correctly', async () => {
      mockMovePostDown.mockResolvedValueOnce(undefined);
      const agent = await authenticatedAgent();

      const res = await agent
        .post(`/api/queues/${QUEUE_ID}/posts/${POST_ID}/move-down`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(mockMovePostDown).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        QUEUE_ID,
        POST_ID,
      );
    });
  });

  describe('DELETE /api/queues/:id/posts/:postId', () => {
    it('removes post from queue', async () => {
      mockRemovePostFromQueue.mockResolvedValueOnce(undefined);
      const agent = await authenticatedAgent();

      const res = await agent
        .delete(`/api/queues/${QUEUE_ID}/posts/${POST_ID}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });

    it('returns 404 when post not in queue', async () => {
      const { QueueServiceError } = await import('../../services/queue.service.js');
      mockRemovePostFromQueue.mockRejectedValueOnce(
        new QueueServiceError('Post not found in this queue', 404),
      );
      const agent = await authenticatedAgent();

      const res = await agent
        .delete(`/api/queues/${QUEUE_ID}/posts/${POST_ID}`);

      expect(res.status).toBe(404);
    });
  });

  describe('authentication enforcement', () => {
    it('GET /api/queues returns 401 without session', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/queues');
      expect(res.status).toBe(401);
    });

    it('POST /api/queues returns 401 without session', async () => {
      const app = createTestApp();
      const res = await request(app).post('/api/queues').send(VALID_QUEUE_INPUT);
      expect(res.status).toBe(401);
    });

    it('PUT /api/queues/:id returns 401 without session', async () => {
      const app = createTestApp();
      const res = await request(app).put(`/api/queues/${QUEUE_ID}`).send({ intervalValue: 6 });
      expect(res.status).toBe(401);
    });

    it('DELETE /api/queues/:id returns 401 without session', async () => {
      const app = createTestApp();
      const res = await request(app).delete(`/api/queues/${QUEUE_ID}`);
      expect(res.status).toBe(401);
    });

    it('POST /api/queues/:id/posts/:postId/move-up returns 401 without session', async () => {
      const app = createTestApp();
      const res = await request(app).post(`/api/queues/${QUEUE_ID}/posts/${POST_ID}/move-up`);
      expect(res.status).toBe(401);
    });
  });
});
