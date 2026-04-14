import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { RequestHandler } from 'express';

import { createApp } from '../../app.js';
import { createMockRedis } from '../helpers/mock-redis.js';

// T-04-04-06: the Bull-Board dashboard at /admin/queues MUST be session-gated.
// We mock the Bull-Board adapter modules so the suite doesn't need a real
// BullMQ queue — the assertion under test is middleware order and the
// 401-without-session path, not the adapter's internal behavior.

const adapterRouter: RequestHandler[] = [];

vi.mock('@bull-board/api', () => ({
  createBullBoard: vi.fn(),
}));

vi.mock('@bull-board/api/bullMQAdapter', () => {
  class FakeBullMQAdapter {
    constructor(_queue: unknown) {}
  }
  return { BullMQAdapter: FakeBullMQAdapter };
});

vi.mock('@bull-board/express', () => {
  class FakeExpressAdapter {
    setBasePath(_path: string) {
      return this;
    }
    getRouter() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Router } = require('express');
      const router = Router();
      // Use router.use so any sub-path under /admin/queues is handled.
      // Express 5's path-to-regexp@8 rejects bare '*' wildcards.
      router.use((req: any, res: any) => {
        if (req.method === 'POST') {
          res.status(200).json({ ok: true });
          return;
        }
        res.status(200).send('<html><body>bull-board</body></html>');
      });
      return router;
    }
  }
  return { ExpressAdapter: FakeExpressAdapter };
});

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

function createMockSql() {
  return Object.assign(
    () => Promise.resolve([{ '?column?': 1 }]),
    { end: vi.fn() },
  ) as any;
}

function createMockDb() {
  const chain: Record<string, any> = {};
  for (const m of ['from', 'where', 'values', 'returning', 'set', 'limit']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (val: unknown) => void) => resolve([]);
  return {
    select: vi.fn().mockReturnValue(chain),
    insert: vi.fn().mockReturnValue(chain),
    update: vi.fn().mockReturnValue(chain),
    delete: vi.fn().mockReturnValue(chain),
    transaction: vi.fn(),
  } as any;
}

function createTestApp() {
  return createApp({
    redis: createMockRedis(),
    sql: createMockSql(),
    db: createMockDb(),
    sessionSecret: 'test-secret-that-is-long-enough-for-session',
    publishQueueService: {
      publishQueue: { close: vi.fn() } as any,
      enqueuePublish: vi.fn(),
      cancelScheduled: vi.fn(),
    } as any,
    notificationQueue: { add: vi.fn(), close: vi.fn() } as any,
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

describe('GET /admin/queues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapterRouter.length = 0;
    process.env.CSRF_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('returns 401 when no session is present (T-04-04-06)', async () => {
    const app = createTestApp();

    const res = await request(app).get('/admin/queues');

    expect(res.status).toBe(401);
  });

  it('returns 200 when a valid session is present', async () => {
    const agent = await authenticatedAgent();

    const res = await agent.get('/admin/queues');

    expect(res.status).toBe(200);
    expect(res.text).toContain('bull-board');
  });

  it('serves sub-paths under the /admin/queues base path', async () => {
    const agent = await authenticatedAgent();

    const res = await agent.get('/admin/queues/api/queues');

    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated POSTs to /admin/queues subpaths (session gate first)', async () => {
    const app = createTestApp();

    const res = await request(app).post('/admin/queues/api/queues/publish');

    expect(res.status).toBe(401);
  });
});
