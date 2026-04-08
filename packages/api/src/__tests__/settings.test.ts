import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createMockRedis } from './helpers/mock-redis.js';
import type { RequestHandler } from 'express';

const mockFindUserByEmail = vi.fn();
const mockVerifyPassword = vi.fn();
const mockGetUserById = vi.fn();
const mockHashPassword = vi.fn();
const mockUserExists = vi.fn();
const mockCreateUser = vi.fn();
const mockUpdateLastLogin = vi.fn();

vi.mock('../services/auth.service.js', () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  userExists: (...args: unknown[]) => mockUserExists(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  updateLastLogin: (...args: unknown[]) => mockUpdateLastLogin(...args),
}));

const mockGenerateTotpSecret = vi.fn();
const mockVerifyTotpCode = vi.fn();

vi.mock('../services/totp.service.js', () => ({
  verifyTotpCode: (...args: unknown[]) => mockVerifyTotpCode(...args),
  generateTotpSecret: (...args: unknown[]) => mockGenerateTotpSecret(...args),
}));

const mockInvalidateOtherSessions = vi.fn();
const mockInvalidateAllSessions = vi.fn();

vi.mock('../services/session.service.js', () => ({
  invalidateOtherSessions: (...args: unknown[]) => mockInvalidateOtherSessions(...args),
  invalidateAllSessions: (...args: unknown[]) => mockInvalidateAllSessions(...args),
}));

const mockArgon2Hash = vi.fn().mockResolvedValue('$argon2id$hashed');
const mockArgon2Verify = vi.fn();

vi.mock('argon2', () => ({
  default: {
    verify: (...args: unknown[]) => mockArgon2Verify(...args),
    hash: (...args: unknown[]) => mockArgon2Hash(...args),
    argon2id: 2,
  },
}));

vi.mock('../middleware/csrf.js', () => ({
  doubleCsrfProtection: ((_req: any, _res: any, next: any) => next()) as RequestHandler,
  generateCsrfToken: (_req: any, _res: any) => 'test-csrf-token',
}));

// Mock sharp for profile image tests
vi.mock('sharp', () => {
  const sharpInstance = {
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    toFormat: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue({}),
  };
  return {
    default: vi.fn().mockReturnValue(sharpInstance),
  };
});

// Mock fs for file cleanup
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

describe('Settings Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  describe('PUT /api/settings/profile', () => {
    it('returns 401 without authenticated session', async () => {
      const app = createTestApp();
      const res = await request(app)
        .put('/api/settings/profile')
        .send({ firstName: 'Test', lastName: 'User' });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/settings/preferences', () => {
    it('returns 401 without authenticated session', async () => {
      const app = createTestApp();
      const res = await request(app)
        .put('/api/settings/preferences')
        .send({ timezone: 'UTC', dateFormat: 'YYYY-MM-DD', entriesPerPage: 25 });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/settings/password', () => {
    it('returns 401 without authenticated session', async () => {
      const app = createTestApp();
      const res = await request(app)
        .put('/api/settings/password')
        .send({
          currentPassword: 'old-password',
          newPassword: 'newsecurepassword12',
          confirmNewPassword: 'newsecurepassword12',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/settings/2fa/setup', () => {
    it('returns 401 without authenticated session', async () => {
      const app = createTestApp();
      const res = await request(app).post('/api/settings/2fa/setup');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/settings/2fa/verify', () => {
    it('returns 401 without authenticated session', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/api/settings/2fa/verify')
        .send({ code: '123456' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/settings/2fa/disable', () => {
    it('returns 401 without authenticated session', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/api/settings/2fa/disable')
        .send({ password: 'mypassword', code: '123456' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/settings/security-questions', () => {
    it('returns 401 without authenticated session', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/settings/security-questions');

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/settings/security-questions', () => {
    it('returns 401 without authenticated session', async () => {
      const app = createTestApp();
      const res = await request(app)
        .put('/api/settings/security-questions')
        .send({
          questions: [
            { questionIndex: 0, answer: 'Fluffy' },
            { questionIndex: 3, answer: 'Nickname' },
            { questionIndex: 7, answer: 'Acme Corp' },
          ],
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/settings/sessions', () => {
    it('returns 401 without authenticated session', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/settings/sessions');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/settings/sessions/logout-others', () => {
    it('returns 401 without authenticated session', async () => {
      const app = createTestApp();
      const res = await request(app).post('/api/settings/sessions/logout-others');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/settings/profile/image', () => {
    it('returns 401 without authenticated session', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/api/settings/profile/image')
        .attach('image', Buffer.from('fake image data'), 'test.jpg');

      expect(res.status).toBe(401);
    });
  });
});
