import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createMockRedis } from './helpers/mock-redis.js';
import type { RequestHandler } from 'express';

const mockUserExists = vi.fn();
const mockCreateUser = vi.fn();
const mockFindUserByEmail = vi.fn();
const mockVerifyPassword = vi.fn();
const mockGetUserById = vi.fn();
const mockUpdateLastLogin = vi.fn();
const mockHashPassword = vi.fn();

vi.mock('../services/auth.service.js', () => ({
  userExists: (...args: unknown[]) => mockUserExists(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  updateLastLogin: (...args: unknown[]) => mockUpdateLastLogin(...args),
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  getSecurityQuestions: vi.fn().mockResolvedValue([]),
  resetPasswordAndDisableTotp: vi.fn().mockResolvedValue(undefined),
  replaceSecurityQuestions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/totp.service.js', () => ({
  verifyTotpCode: vi.fn().mockReturnValue(false),
  generateTotpSecret: vi.fn(),
}));

// CSRF passthrough for route testing -- CSRF middleware has its own test
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

function createTestApp() {
  return createApp({
    redis: createMockRedis(),
    sql: createMockSql(),
    db: {} as any,
    sessionSecret: 'test-secret-that-is-long-enough-for-session',
  });
}

describe('GET /api/auth/setup-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('returns needsSetup: true when no users exist', async () => {
    mockUserExists.mockResolvedValue(false);
    const app = createTestApp();
    const res = await request(app).get('/api/auth/setup-status');

    expect(res.status).toBe(200);
    expect(res.body.needsSetup).toBe(true);
  });

  it('returns needsSetup: false when user exists', async () => {
    mockUserExists.mockResolvedValue(true);
    const app = createTestApp();
    const res = await request(app).get('/api/auth/setup-status');

    expect(res.status).toBe(200);
    expect(res.body.needsSetup).toBe(false);
  });
});

describe('POST /api/auth/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('creates user and returns 201 with valid data', async () => {
    mockUserExists.mockResolvedValue(false);
    mockCreateUser.mockResolvedValue({ id: 'test-id', email: 'test@example.com' });
    const app = createTestApp();

    const res = await request(app)
      .post('/api/auth/setup')
      .send({
        email: 'test@example.com',
        password: 'securepassword12',
        confirmPassword: 'securepassword12',
        timezone: 'America/New_York',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 when user already exists', async () => {
    mockUserExists.mockResolvedValue(true);
    const app = createTestApp();

    const res = await request(app)
      .post('/api/auth/setup')
      .send({
        email: 'test@example.com',
        password: 'securepassword12',
        confirmPassword: 'securepassword12',
        timezone: 'America/New_York',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Account already exists.');
  });

  it('returns 400 with invalid data', async () => {
    const app = createTestApp();

    const res = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('catches DB unique constraint violation as fallback', async () => {
    mockUserExists.mockResolvedValue(false);
    const dbError = new Error('unique constraint') as any;
    dbError.code = '23505';
    mockCreateUser.mockRejectedValue(dbError);
    const app = createTestApp();

    const res = await request(app)
      .post('/api/auth/setup')
      .send({
        email: 'test@example.com',
        password: 'securepassword12',
        confirmPassword: 'securepassword12',
        timezone: 'America/New_York',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Account already exists.');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('returns 200 with valid credentials (no 2FA)', async () => {
    mockFindUserByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
      passwordHash: '$argon2id$hash',
      totpEnabled: false,
    });
    mockVerifyPassword.mockResolvedValue(true);
    mockUpdateLastLogin.mockResolvedValue(undefined);
    const app = createTestApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'securepassword12' });

    expect(res.status).toBe(200);
    expect(res.body.requiresTwoFactor).toBe(false);
  });

  it('returns 401 with wrong password', async () => {
    mockFindUserByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
      passwordHash: '$argon2id$hash',
      totpEnabled: false,
    });
    mockVerifyPassword.mockResolvedValue(false);
    const app = createTestApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword12' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });

  it('returns 401 with non-existent email', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    const app = createTestApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'securepassword12' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });

  it('returns requiresTwoFactor: true when 2FA is enabled', async () => {
    mockFindUserByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
      passwordHash: '$argon2id$hash',
      totpEnabled: true,
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    mockVerifyPassword.mockResolvedValue(true);
    const app = createTestApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'securepassword12' });

    expect(res.status).toBe(200);
    expect(res.body.requiresTwoFactor).toBe(true);
  });
});

describe('POST /api/auth/login/verify-2fa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('returns 401 with no pending 2FA session', async () => {
    const app = createTestApp();

    const res = await request(app)
      .post('/api/auth/login/verify-2fa')
      .send({ code: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('No pending two-factor authentication.');
  });
});

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('returns 401 without authenticated session', async () => {
    const app = createTestApp();

    const res = await request(app)
      .post('/api/auth/logout');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('returns 401 without session', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/csrf-token', () => {
  beforeEach(() => {
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('returns a CSRF token', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/auth/csrf-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.token).toBe('test-csrf-token');
  });
});
