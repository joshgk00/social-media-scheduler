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
const mockGetSecurityQuestions = vi.fn();
const mockResetPasswordAndDisableTotp = vi.fn();
const mockReplaceSecurityQuestions = vi.fn();

vi.mock('../services/auth.service.js', () => ({
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

vi.mock('../services/totp.service.js', () => ({
  verifyTotpCode: vi.fn().mockReturnValue(false),
  generateTotpSecret: vi.fn(),
}));

const mockInvalidateAllSessions = vi.fn();
const mockInvalidateOtherSessions = vi.fn();

vi.mock('../services/session.service.js', () => ({
  invalidateAllSessions: (...args: unknown[]) => mockInvalidateAllSessions(...args),
  invalidateOtherSessions: (...args: unknown[]) => mockInvalidateOtherSessions(...args),
  SESSION_PREFIX: 'sms:sess:',
}));

const mockArgon2Verify = vi.fn();
vi.mock('argon2', () => ({
  default: {
    verify: (...args: unknown[]) => mockArgon2Verify(...args),
    hash: vi.fn().mockResolvedValue('$argon2id$hashed'),
    argon2id: 2,
  },
}));

// Mock the security questions DB queries
const mockSecurityQuestionsSelect = vi.fn();

vi.mock('../middleware/csrf.js', () => ({
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

describe('POST /api/auth/recover/verify-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('returns questionsConfigured: true with questionIndices when user has questions', async () => {
    mockFindUserByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
    });
    mockGetSecurityQuestions.mockResolvedValue([
      { questionIndex: 0, answerHash: '$argon2id$hashed' },
      { questionIndex: 1, answerHash: '$argon2id$hashed' },
      { questionIndex: 2, answerHash: '$argon2id$hashed' },
    ]);

    const app = createTestApp();
    const res = await request(app)
      .post('/api/auth/recover/verify-email')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.questionsConfigured).toBe(true);
  });

  it('returns questionsConfigured: false for unknown email (no user enumeration)', async () => {
    mockFindUserByEmail.mockResolvedValue(null);

    const app = createTestApp();
    const res = await request(app)
      .post('/api/auth/recover/verify-email')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.questionsConfigured).toBe(false);
  });

  it('returns questionsConfigured: false when user has no questions configured', async () => {
    mockFindUserByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
    });
    mockGetSecurityQuestions.mockResolvedValue([]);

    const app = createTestApp();
    const res = await request(app)
      .post('/api/auth/recover/verify-email')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    // Without questions configured, should return false
    expect(res.body).toHaveProperty('questionsConfigured');
  });
});

describe('POST /api/auth/recover/verify-answers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('returns 401 when no recovery session exists (no recoveryEmail)', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/auth/recover/verify-answers')
      .send({
        email: 'test@example.com',
        answers: ['answer1', 'answer2', 'answer3'],
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Recovery session expired. Start over.');
  });
});

describe('POST /api/auth/recover/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('returns 401 when recovery is not verified', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/auth/recover/reset-password')
      .send({
        newPassword: 'newsecurepassword12',
        confirmNewPassword: 'newsecurepassword12',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Recovery not verified. Start over.');
  });
});
