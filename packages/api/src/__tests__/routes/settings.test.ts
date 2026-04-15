import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { createMockRedis } from '../helpers/mock-redis.js';

const mockGetUserById = vi.fn();

vi.mock('../../services/auth.service.js', () => ({
  findUserByEmail: vi.fn(),
  verifyPassword: vi.fn(),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  hashPassword: vi.fn(),
  userExists: vi.fn(),
  createUser: vi.fn(),
  updateLastLogin: vi.fn(),
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

vi.mock('argon2', () => ({
  default: {
    verify: vi.fn(),
    hash: vi.fn().mockResolvedValue('$argon2id$hashed'),
    argon2id: 2,
  },
}));

vi.mock('../../middleware/csrf.js', () => ({
  doubleCsrfProtection: ((_req: any, _res: any, next: any) => next()) as any,
  generateCsrfToken: () => 'test-csrf-token',
}));

vi.mock('sharp', () => ({
  default: vi.fn().mockReturnValue({
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    toFormat: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue({}),
  }),
}));

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

function createMockDb(executeResult?: unknown[]) {
  const chainable = (terminal: unknown = []) => {
    const chain: Record<string, any> = {};
    const methods = ['from', 'where', 'values', 'returning', 'set', 'limit'];
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
    execute: vi.fn().mockResolvedValue(executeResult ?? []),
  } as any;
}

function createTestApp(dbOverride?: any) {
  const db = dbOverride ?? createMockDb();
  return {
    app: createApp({
      redis: createMockRedis(),
      sql: createMockSql(),
      db,
      sessionSecret: 'test-secret-that-is-long-enough-for-session',
    }),
    db,
  };
}

describe('GET /api/settings/storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('returns 401 without authenticated session', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/settings/storage');
    expect(res.status).toBe(401);
  });

  it('returns 200 with storage usage data when media exists', async () => {
    const mockExecuteResult = [{
      total_size: '1048576',
      image_size: '524288',
      video_size: '524288',
      image_count: 5,
      video_count: 2,
    }];

    const db = createMockDb(mockExecuteResult);

    mockGetUserById.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      profileImagePath: null,
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      entriesPerPage: 25,
      passwordHash: '$argon2id$hashed',
      totpEnabled: false,
      totpSecret: null,
    });

    const { app } = createTestApp(db);

    const agent = request.agent(app);
    // Login to get a session
    await agent.post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'testpassword',
    });

    const res = await agent.get('/api/settings/storage');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalSize');
    expect(res.body).toHaveProperty('imageSize');
    expect(res.body).toHaveProperty('videoSize');
    expect(res.body).toHaveProperty('imageCount');
    expect(res.body).toHaveProperty('videoCount');
  });

  it('returns zeros when no media exists', async () => {
    const mockExecuteResult = [{
      total_size: '0',
      image_size: '0',
      video_size: '0',
      image_count: 0,
      video_count: 0,
    }];

    const db = createMockDb(mockExecuteResult);

    mockGetUserById.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      profileImagePath: null,
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      entriesPerPage: 25,
      passwordHash: '$argon2id$hashed',
      totpEnabled: false,
      totpSecret: null,
    });

    const { app } = createTestApp(db);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'testpassword',
    });

    const res = await agent.get('/api/settings/storage');

    expect(res.status).toBe(200);
    expect(res.body.totalSize).toBe(0);
    expect(res.body.imageSize).toBe(0);
    expect(res.body.videoSize).toBe(0);
    expect(res.body.imageCount).toBe(0);
    expect(res.body.videoCount).toBe(0);
  });
});
