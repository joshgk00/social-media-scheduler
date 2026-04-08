import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { createMockRedis } from '../helpers/mock-redis.js';
import type { RequestHandler } from 'express';

const mockCreateProfile = vi.fn();
const mockGetProfiles = vi.fn();
const mockGetProfileById = vi.fn();
const mockDeleteProfile = vi.fn();

vi.mock('../../services/profile.service.js', () => ({
  createProfile: (...args: unknown[]) => mockCreateProfile(...args),
  getProfiles: (...args: unknown[]) => mockGetProfiles(...args),
  getProfileById: (...args: unknown[]) => mockGetProfileById(...args),
  deleteProfile: (...args: unknown[]) => mockDeleteProfile(...args),
}));

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
    const methods = ['from', 'where', 'values', 'returning', 'set', 'limit', 'offset', 'orderBy', 'innerJoin'];
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

const SAFE_PROFILE = {
  id: 'profile-uuid-1',
  platform: 'twitter',
  platformUserId: '12345',
  displayName: 'Test User',
  handle: 'testuser',
  avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
  tokenEncryptionVersion: 1,
  connectedAt: new Date().toISOString(),
  lastPublishedAt: null,
};

describe('profiles routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  describe('POST /api/profiles', () => {
    it('returns 201 with profile data on successful credential validation', async () => {
      mockCreateProfile.mockResolvedValueOnce(SAFE_PROFILE);
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/profiles')
        .send({
          consumerKey: 'ck-value',
          consumerSecret: 'cs-value',
          accessToken: 'at-value',
          accessTokenSecret: 'ats-value',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', SAFE_PROFILE.id);
      expect(res.body).toHaveProperty('platform', 'twitter');
    });

    it('returns 422 when Twitter credential validation fails', async () => {
      mockCreateProfile.mockRejectedValueOnce(new Error('Could not verify these credentials.'));
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/profiles')
        .send({
          consumerKey: 'bad-key',
          consumerSecret: 'bad-secret',
          accessToken: 'bad-token',
          accessTokenSecret: 'bad-token-secret',
        });

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Could not verify');
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/api/profiles')
        .send({
          consumerKey: 'ck-value',
          consumerSecret: 'cs-value',
          accessToken: 'at-value',
          accessTokenSecret: 'ats-value',
        });

      expect(res.status).toBe(401);
    });

    it('does not include consumer keys or secrets in response body', async () => {
      mockCreateProfile.mockResolvedValueOnce(SAFE_PROFILE);
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/profiles')
        .send({
          consumerKey: 'ck-value',
          consumerSecret: 'cs-value',
          accessToken: 'at-value',
          accessTokenSecret: 'ats-value',
        });

      expect(res.status).toBe(201);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain('consumerKey');
      expect(body).not.toContain('consumerSecret');
      expect(body).not.toContain('accessToken');
      expect(body).not.toContain('accessTokenSecret');
      expect(body).not.toContain('Ciphertext');
      expect(body).not.toContain('AuthTag');
    });

    it('returns 409 when profile already connected for same Twitter account', async () => {
      const duplicateError = Object.assign(
        new Error('This Twitter account is already connected.'),
        { statusCode: 409 },
      );
      mockCreateProfile.mockRejectedValueOnce(duplicateError);
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/profiles')
        .send({
          consumerKey: 'ck-value',
          consumerSecret: 'cs-value',
          accessToken: 'at-value',
          accessTokenSecret: 'ats-value',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already connected');
    });

    it.todo('does not log consumer keys or secrets');
    it.todo('distinguishes invalid credentials from rate-limited and transient failures');
  });

  describe('GET /api/profiles', () => {
    it('returns array of profiles without credential data', async () => {
      mockGetProfiles.mockResolvedValueOnce([SAFE_PROFILE]);
      const agent = await authenticatedAgent();

      const res = await agent.get('/api/profiles');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain('Ciphertext');
      expect(body).not.toContain('Iv');
      expect(body).not.toContain('AuthTag');
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/profiles');

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/profiles/:id', () => {
    it('returns 200 on successful deletion', async () => {
      mockDeleteProfile.mockResolvedValueOnce(true);
      const agent = await authenticatedAgent();

      const res = await agent.delete('/api/profiles/profile-uuid-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });

    it('returns 404 when profile not found', async () => {
      mockDeleteProfile.mockResolvedValueOnce(false);
      const agent = await authenticatedAgent();

      const res = await agent.delete('/api/profiles/nonexistent-id');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Profile not found');
    });
  });
});
