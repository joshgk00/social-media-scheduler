import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { createMockRedis } from '../helpers/mock-redis.js';
import type { RequestHandler } from 'express';

const mockCreateProfile = vi.fn();
const mockGetProfiles = vi.fn();
const mockGetProfileById = vi.fn();
const mockDeleteProfile = vi.fn();
const mockUpdateProfileMetadata = vi.fn();
const mockGetDeletePreview = vi.fn();

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
    updateProfileMetadata: (...args: unknown[]) => mockUpdateProfileMetadata(...args),
    getDeletePreview: (...args: unknown[]) => mockGetDeletePreview(...args),
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

const PROFILE_UUID = '550e8400-e29b-41d4-a716-446655440001';

const SAFE_PROFILE = {
  id: PROFILE_UUID,
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
          platform: 'twitter',
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
      const { ProfileServiceError } = await import('../../services/profile.service.js');
      mockCreateProfile.mockRejectedValueOnce(new ProfileServiceError('Could not verify these credentials.', 422));
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/profiles')
        .send({
          platform: 'twitter',
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
          platform: 'twitter',
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
          platform: 'twitter',
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
      const { ProfileServiceError } = await import('../../services/profile.service.js');
      mockCreateProfile.mockRejectedValueOnce(new ProfileServiceError('This Twitter account is already connected.', 409));
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/profiles')
        .send({
          platform: 'twitter',
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

      const res = await agent.delete(`/api/profiles/${PROFILE_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });

    it('returns 404 when profile not found', async () => {
      mockDeleteProfile.mockResolvedValueOnce(false);
      const agent = await authenticatedAgent();

      const res = await agent.delete('/api/profiles/550e8400-e29b-41d4-a716-446655440099');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Profile not found');
    });

    it('returns 409 when profile has in-flight posts', async () => {
      const { ProfileServiceError } = await import('../../services/profile.service.js');
      mockDeleteProfile.mockRejectedValueOnce(
        new ProfileServiceError('Cannot delete profile with in-flight posts', 409),
      );
      const agent = await authenticatedAgent();

      const res = await agent.delete(`/api/profiles/${PROFILE_UUID}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('in-flight posts');
    });
  });

  // Phase 7 Plan 05 — PATCH metadata + delete-preview + extended GET list
  // ---------------------------------------------------------------------

  const EXTENDED_PROFILE = {
    id: PROFILE_UUID,
    platform: 'linkedin',
    platformUserId: 'urn:li:person:abc',
    platformAccountId: 'urn:li:organization:42',
    displayName: 'Jane Doe',
    handle: 'jane-doe',
    avatarUrl: null,
    connectedAt: new Date('2026-04-01T00:00:00Z').toISOString(),
    lastPublishedAt: null,
    tokenStatus: 'active',
    tokenExpiresAt: new Date('2026-08-01T00:00:00Z').toISOString(),
    tokenHealthCheckedAt: new Date('2026-04-20T00:00:00Z').toISOString(),
    notes: null,
    nextScheduledAt: null,
    monthlyTweetBudget: 500,
    warnThresholdPercent: 80,
  };

  describe('PATCH /api/profiles/:id', () => {
    it('returns 200 with refreshed row for valid displayName', async () => {
      mockUpdateProfileMetadata.mockResolvedValueOnce({
        ...EXTENDED_PROFILE,
        displayName: 'Renamed',
      });
      const agent = await authenticatedAgent();

      const res = await agent
        .patch(`/api/profiles/${PROFILE_UUID}`)
        .send({ displayName: 'Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Renamed');
      expect(mockUpdateProfileMetadata).toHaveBeenCalledTimes(1);
      // Service signature is (db, args) — args lives at index [1].
      const args = mockUpdateProfileMetadata.mock.calls[0][1];
      expect(args.displayName).toBe('Renamed');
    });

    it('returns 200 with notes stored when notes-only provided', async () => {
      mockUpdateProfileMetadata.mockResolvedValueOnce({
        ...EXTENDED_PROFILE,
        notes: '# Hello',
      });
      const agent = await authenticatedAgent();

      const res = await agent
        .patch(`/api/profiles/${PROFILE_UUID}`)
        .send({ notes: '# Hello' });

      expect(res.status).toBe(200);
      expect(res.body.notes).toBe('# Hello');
    });

    it('returns 200 with notes cleared when notes=null', async () => {
      mockUpdateProfileMetadata.mockResolvedValueOnce({
        ...EXTENDED_PROFILE,
        notes: null,
      });
      const agent = await authenticatedAgent();

      const res = await agent
        .patch(`/api/profiles/${PROFILE_UUID}`)
        .send({ notes: null });

      expect(res.status).toBe(200);
      expect(res.body.notes).toBeNull();
      // Service signature is (db, args) — args lives at index [1].
      const args = mockUpdateProfileMetadata.mock.calls[0][1];
      expect(args.notes).toBeNull();
    });

    it('returns 400 when body is empty ({}) — service throws no_fields_to_update', async () => {
      const { ProfileServiceError } = await import('../../services/profile.service.js');
      mockUpdateProfileMetadata.mockRejectedValueOnce(
        new ProfileServiceError('no_fields_to_update', 400),
      );
      const agent = await authenticatedAgent();

      const res = await agent
        .patch(`/api/profiles/${PROFILE_UUID}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when notes exceeds 5000 chars (Zod)', async () => {
      const agent = await authenticatedAgent();

      const res = await agent
        .patch(`/api/profiles/${PROFILE_UUID}`)
        .send({ notes: 'x'.repeat(5001) });

      expect(res.status).toBe(400);
      expect(mockUpdateProfileMetadata).not.toHaveBeenCalled();
    });

    it('returns 400 when body includes unknown keys (strict schema)', async () => {
      const agent = await authenticatedAgent();

      const res = await agent
        .patch(`/api/profiles/${PROFILE_UUID}`)
        .send({ displayName: 'x', platform: 'linkedin' });

      expect(res.status).toBe(400);
      expect(mockUpdateProfileMetadata).not.toHaveBeenCalled();
    });

    it('returns 404 when service throws profile_not_found', async () => {
      const { ProfileServiceError } = await import('../../services/profile.service.js');
      mockUpdateProfileMetadata.mockRejectedValueOnce(
        new ProfileServiceError('profile_not_found', 404),
      );
      const agent = await authenticatedAgent();

      const res = await agent
        .patch(`/api/profiles/${PROFILE_UUID}`)
        .send({ displayName: 'New' });

      expect(res.status).toBe(404);
    });

    it('returns 401 without a session', async () => {
      const app = createTestApp();
      const res = await request(app)
        .patch(`/api/profiles/${PROFILE_UUID}`)
        .send({ displayName: 'New' });

      expect(res.status).toBe(401);
    });

    it('returns 400 when :id is not a valid UUID', async () => {
      const agent = await authenticatedAgent();

      const res = await agent
        .patch('/api/profiles/not-a-uuid')
        .send({ displayName: 'New' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/profiles/:id/delete-preview', () => {
    it('returns 200 with the five cascade counts', async () => {
      mockGetDeletePreview.mockResolvedValueOnce({
        drafts: 3,
        scheduled: 5,
        queueMemberships: 2,
        tagsLosingLastUse: 1,
        inFlight: 0,
      });
      const agent = await authenticatedAgent();

      const res = await agent.get(`/api/profiles/${PROFILE_UUID}/delete-preview`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        drafts: 3,
        scheduled: 5,
        queueMemberships: 2,
        tagsLosingLastUse: 1,
        inFlight: 0,
      });
    });

    it('returns 401 without a session', async () => {
      const app = createTestApp();
      const res = await request(app).get(`/api/profiles/${PROFILE_UUID}/delete-preview`);
      expect(res.status).toBe(401);
    });

    it('returns 400 when :id is not a valid UUID', async () => {
      const agent = await authenticatedAgent();
      const res = await agent.get('/api/profiles/not-a-uuid/delete-preview');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/profiles (Phase 7 extended shape)', () => {
    it('response includes tokenStatus, tokenExpiresAt, tokenHealthCheckedAt, notes, nextScheduledAt', async () => {
      mockGetProfiles.mockResolvedValueOnce([EXTENDED_PROFILE]);
      const agent = await authenticatedAgent();

      const res = await agent.get('/api/profiles');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      const row = res.body[0];
      expect(row).toHaveProperty('tokenStatus', 'active');
      expect(row).toHaveProperty('tokenExpiresAt');
      expect(row).toHaveProperty('tokenHealthCheckedAt');
      expect(row).toHaveProperty('notes');
      expect(row).toHaveProperty('nextScheduledAt');
      expect(row).toHaveProperty('platformAccountId', 'urn:li:organization:42');
    });

    it('response does NOT include ciphertext fields (T-07-03)', async () => {
      mockGetProfiles.mockResolvedValueOnce([EXTENDED_PROFILE]);
      const agent = await authenticatedAgent();

      const res = await agent.get('/api/profiles');

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('Ciphertext');
      expect(serialized).not.toContain('AuthTag');
      expect(serialized).not.toMatch(/oauth2[A-Za-z]*Iv/);
    });
  });
});
