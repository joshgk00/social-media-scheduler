import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { RequestHandler } from 'express';
import { postHistoryResponseSchema } from '@sms/shared';

import { createApp } from '../../app.js';
import { createMockRedis } from '../helpers/mock-redis.js';

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

// Stub admin router — Bull-Board adapter rejects non-BullMQ queues.
vi.mock('../../routes/admin.js', () => ({
  createAdminRouter: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Router } = require('express');
    return Router();
  },
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

const POST_ID = '550e8400-e29b-41d4-a716-446655440020';
const OTHER_POST_ID = '550e8400-e29b-41d4-a716-446655440021';

// Controlled per-test: (a) whether the ownership SELECT finds the post, and
// (b) what post_attempts rows to return in attempt_num order.
const ownershipRow: { ref: any } = { ref: null };
const attemptRows: { rows: any[] } = { rows: [] };

function createMockSql() {
  return Object.assign(
    () => Promise.resolve([{ '?column?': 1 }]),
    { end: vi.fn() },
  ) as any;
}

function makeAttempt(overrides: Partial<any> = {}) {
  return {
    id: crypto.randomUUID(),
    postId: POST_ID,
    attemptNum: 1,
    startedAt: new Date('2026-04-15T10:00:00Z'),
    finishedAt: new Date('2026-04-15T10:00:05Z'),
    outcome: 'transient_fail',
    httpStatus: 429,
    errorCode: 'rate_limited',
    errorMessage: 'slow down',
    platformPostId: null,
    ...overrides,
  };
}

function createMockDb() {
  let selectCallIndex = 0;
  const db: any = {
    select: vi.fn().mockImplementation(() => {
      const isFirstCall = selectCallIndex === 0;
      selectCallIndex++;
      const chain: Record<string, any> = {};
      const methods = ['from', 'where', 'limit', 'offset', 'innerJoin', 'leftJoin'];
      for (const method of methods) {
        chain[method] = vi.fn().mockReturnValue(chain);
      }
      // The handler issues:
      //   1. ownership SELECT on `posts`
      //   2. full SELECT on `postAttempts` with orderBy
      chain.orderBy = vi.fn().mockImplementation(() => ({
        then: (resolve: (val: unknown) => void) => resolve(attemptRows.rows),
      }));
      chain.then = (resolve: (val: unknown) => void) => {
        if (isFirstCall) {
          resolve(ownershipRow.ref ? [ownershipRow.ref] : []);
        } else {
          resolve(attemptRows.rows);
        }
      };
      return chain;
    }),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };
  // Reset selectCallIndex on each use via closure? It's per-db instance so each
  // createTestApp call gets a fresh counter — fine.
  return db;
}

const publishQueueService = {
  publishQueue: { close: vi.fn() } as any,
  enqueuePublish: vi.fn(),
  cancelScheduled: vi.fn(),
};
const notificationQueue = { add: vi.fn(), close: vi.fn() } as any;

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

describe('GET /api/posts/:id/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownershipRow.ref = null;
    attemptRows.rows = [];
    process.env.CSRF_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('returns empty cycles for a post with zero attempts', async () => {
    ownershipRow.ref = { id: POST_ID };
    attemptRows.rows = [];
    const agent = await authenticatedAgent();

    const res = await agent.get(`/api/posts/${POST_ID}/history`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ postId: POST_ID, cycles: [] });
  });

  it('returns a single cycle when attempt_num is strictly increasing', async () => {
    ownershipRow.ref = { id: POST_ID };
    attemptRows.rows = [
      makeAttempt({ attemptNum: 1 }),
      makeAttempt({ attemptNum: 2 }),
      makeAttempt({ attemptNum: 3 }),
      makeAttempt({ attemptNum: 4 }),
    ];
    const agent = await authenticatedAgent();

    const res = await agent.get(`/api/posts/${POST_ID}/history`);

    expect(res.status).toBe(200);
    expect(res.body.cycles).toHaveLength(1);
    expect(res.body.cycles[0]).toHaveLength(4);
  });

  it('splits into two cycles when attempt_num resets to 1', async () => {
    ownershipRow.ref = { id: POST_ID };
    attemptRows.rows = [
      makeAttempt({ attemptNum: 1 }),
      makeAttempt({ attemptNum: 2 }),
      makeAttempt({ attemptNum: 1, outcome: 'success' }),
      makeAttempt({ attemptNum: 2 }),
      makeAttempt({ attemptNum: 3 }),
    ];
    const agent = await authenticatedAgent();

    const res = await agent.get(`/api/posts/${POST_ID}/history`);

    expect(res.status).toBe(200);
    expect(res.body.cycles).toHaveLength(2);
    expect(res.body.cycles[0]).toHaveLength(2);
    expect(res.body.cycles[1]).toHaveLength(3);
  });

  it('returns 404 when the post is owned by a different user', async () => {
    ownershipRow.ref = null;
    const agent = await authenticatedAgent();

    const res = await agent.get(`/api/posts/${OTHER_POST_ID}/history`);

    expect(res.status).toBe(404);
  });

  it('returns 401 without a session', async () => {
    const app = createTestApp();
    const res = await request(app).get(`/api/posts/${POST_ID}/history`);
    expect(res.status).toBe(401);
  });

  it('response shape validates against postHistoryResponseSchema', async () => {
    ownershipRow.ref = { id: POST_ID };
    attemptRows.rows = [
      makeAttempt({ attemptNum: 1 }),
      makeAttempt({ attemptNum: 2, outcome: 'success', platformPostId: 'tweet-123' }),
    ];
    const agent = await authenticatedAgent();

    const res = await agent.get(`/api/posts/${POST_ID}/history`);

    expect(res.status).toBe(200);
    expect(() => postHistoryResponseSchema.parse(res.body)).not.toThrow();
  });
});
