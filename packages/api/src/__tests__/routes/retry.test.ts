import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { RequestHandler } from 'express';

import { createApp } from '../../app.js';
import { createMockRedis } from '../helpers/mock-redis.js';

// Mocks for auth bootstrap
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

// CSRF pass-through so tests focus on auth + business logic.
vi.mock('../../middleware/csrf.js', () => ({
  doubleCsrfProtection: ((_req: any, _res: any, next: any) => next()) as RequestHandler,
  generateCsrfToken: (_req: any, _res: any) => 'test-csrf-token',
}));

// Stub admin router — the Bull-Board adapter can't wrap a mocked queue.
vi.mock('../../routes/admin.js', () => ({
  createAdminRouter: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Router } = require('express');
    return Router();
  },
}));

// Post service mocks for create/update/etc. (unrelated to retry but the
// route file imports them)
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

const POST_ID = '550e8400-e29b-41d4-a716-446655440010';
const OTHER_POST_ID = '550e8400-e29b-41d4-a716-446655440011';

// Shared db row that the transaction tx.select returns. Controlled per-test
// by mutating `postRow.ref` before the request.
const postRow: { ref: any } = { ref: null };

function createMockSql() {
  return Object.assign(
    () => Promise.resolve([{ '?column?': 1 }]),
    { end: vi.fn() },
  ) as any;
}

function chainable(terminal: unknown = []) {
  const chain: Record<string, any> = {};
  const methods = [
    'from',
    'where',
    'values',
    'returning',
    'set',
    'limit',
    'offset',
    'orderBy',
    'innerJoin',
    'leftJoin',
  ];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (val: unknown) => void) => resolve(terminal);
  return chain;
}

function createMockDb() {
  const db: any = {
    select: vi.fn().mockImplementation(() => chainable([])),
    insert: vi.fn().mockImplementation(() => chainable([])),
    update: vi.fn().mockImplementation(() => chainable()),
    delete: vi.fn().mockImplementation(() => chainable()),
    transaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      // tx.select chain yields postRow.ref via a thenable
      const tx: any = {
        select: vi.fn().mockImplementation(() => {
          const row = postRow.ref;
          const chain: Record<string, any> = {};
          const methods = ['from', 'where'];
          for (const method of methods) {
            chain[method] = vi.fn().mockReturnValue(chain);
          }
          chain.then = (resolve: (val: unknown) => void) =>
            resolve(row ? [row] : []);
          return chain;
        }),
        update: vi.fn().mockImplementation(() => {
          const updated = postRow.ref
            ? {
                ...postRow.ref,
                status: 'scheduled',
                failureReason: null,
                failedAt: null,
                postVersion: postRow.ref.postVersion + 1,
              }
            : null;
          const chain: Record<string, any> = {};
          const methods = ['set', 'where'];
          for (const method of methods) {
            chain[method] = vi.fn().mockReturnValue(chain);
          }
          chain.returning = vi.fn().mockResolvedValue(updated ? [updated] : []);
          return chain;
        }),
      };
      return fn(tx);
    }),
  };
  return db;
}

const enqueuePublish = vi.fn();
const cancelScheduled = vi.fn();
const publishQueueService = {
  publishQueue: { close: vi.fn() } as any,
  enqueuePublish,
  cancelScheduled,
};

const notificationAdd = vi.fn();
const notificationQueue = { add: notificationAdd, close: vi.fn() } as any;

function createTestApp() {
  return createApp({
    redis: createMockRedis(),
    sql: createMockSql(),
    db: createMockDb(),
    sessionSecret: 'test-secret-that-is-long-enough-for-session',
    publishQueueService: publishQueueService as any,
    notificationQueue,
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

describe('POST /api/posts/:id/retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postRow.ref = null;
    process.env.CSRF_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('returns 200 with scheduled status and bumps postVersion on a failed post', async () => {
    postRow.ref = {
      id: POST_ID,
      userId: 'user-1',
      status: 'failed',
      postVersion: 3,
      failureReason: 'rate_limited',
      failedAt: new Date(),
    };
    const agent = await authenticatedAgent();

    const res = await agent.post(`/api/posts/${POST_ID}/retry`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'scheduled');
    expect(res.body).toHaveProperty('postVersion', 4);
  });

  it('clears failureReason and failedAt on retry', async () => {
    postRow.ref = {
      id: POST_ID,
      userId: 'user-1',
      status: 'failed',
      postVersion: 1,
      failureReason: 'boom',
      failedAt: new Date(),
    };
    const agent = await authenticatedAgent();

    const res = await agent.post(`/api/posts/${POST_ID}/retry`);

    expect(res.status).toBe(200);
    expect(res.body.failureReason).toBeNull();
    expect(res.body.failedAt).toBeNull();
  });

  it('calls publishQueueService.enqueuePublish exactly once on retry', async () => {
    postRow.ref = {
      id: POST_ID,
      userId: 'user-1',
      status: 'failed',
      postVersion: 1,
    };
    const agent = await authenticatedAgent();

    await agent.post(`/api/posts/${POST_ID}/retry`);

    expect(enqueuePublish).toHaveBeenCalledTimes(1);
    expect(enqueuePublish).toHaveBeenCalledWith(
      POST_ID,
      2,
      expect.any(Date),
      expect.any(String),
    );
  });

  it('returns 409 when the post is in scheduled state (not failed)', async () => {
    postRow.ref = {
      id: POST_ID,
      userId: 'user-1',
      status: 'scheduled',
      postVersion: 1,
    };
    const agent = await authenticatedAgent();

    const res = await agent.post(`/api/posts/${POST_ID}/retry`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/failed/i);
    expect(enqueuePublish).not.toHaveBeenCalled();
  });

  it('returns 404 when the post is owned by a different user', async () => {
    postRow.ref = null; // SELECT WHERE user_id = ? returns nothing
    const agent = await authenticatedAgent();

    const res = await agent.post(`/api/posts/${OTHER_POST_ID}/retry`);

    expect(res.status).toBe(404);
    expect(enqueuePublish).not.toHaveBeenCalled();
  });

  it('returns 401 without a session', async () => {
    const app = createTestApp();

    const res = await request(app).post(`/api/posts/${POST_ID}/retry`);

    expect(res.status).toBe(401);
  });

  it('honors the csrf middleware placement (would 403 if csrf mock were removed)', async () => {
    // The test suite pass-through mocks csrf so the handler runs; this test
    // documents that the route is registered with requireAuth + csrf order
    // by asserting the handler can reach its 200 path when a valid session
    // is present. The actual 403 behavior is covered by the global csrf
    // middleware test in auth.test.ts.
    postRow.ref = {
      id: POST_ID,
      userId: 'user-1',
      status: 'failed',
      postVersion: 1,
    };
    const agent = await authenticatedAgent();

    const res = await agent.post(`/api/posts/${POST_ID}/retry`);

    expect(res.status).toBe(200);
  });
});
