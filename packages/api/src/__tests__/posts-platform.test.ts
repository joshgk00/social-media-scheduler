// Wave 0 RED stubs (now GREEN under Plan 03) for the POST /api/posts route's
// per-platform validation. Drives POST-LI-01, POST-FB-01, T-API-01, T-API-03.
//
// Tightened in Plan 03: real createApp wiring, real auth bootstrap (login then
// reuse the session cookie via supertest.agent), per-test mocks for the
// post.service factory functions.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { RequestHandler } from 'express';

import { createApp } from '../app.js';
import { createMockRedis } from './helpers/mock-redis.js';

const VALID_PROFILE_ID = '00000000-0000-4000-8000-00000000aaaa';

// Auth bootstrap mocks — same pattern as warn-notification.test.ts.
const mockFindUserByEmail = vi.fn();
const mockVerifyPassword = vi.fn();
const mockUserExists = vi.fn();
const mockUpdateLastLogin = vi.fn();

vi.mock('../services/auth.service.js', () => ({
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

vi.mock('../services/totp.service.js', () => ({
  verifyTotpCode: vi.fn(),
  generateTotpSecret: vi.fn(),
}));

vi.mock('../services/session.service.js', () => ({
  invalidateOtherSessions: vi.fn(),
  invalidateAllSessions: vi.fn(),
  SESSION_PREFIX: 'sms:sess:',
}));

// CSRF pass-through so we don't have to plumb tokens through supertest.
vi.mock('../middleware/csrf.js', () => ({
  doubleCsrfProtection: ((_req: any, _res: any, next: any) => next()) as RequestHandler,
  generateCsrfToken: (_req: any, _res: any) => 'test-csrf-token',
}));

vi.mock('../routes/admin.js', () => ({
  createAdminRouter: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Router } = require('express');
    return Router();
  },
}));

const mockCreatePost = vi.fn();
vi.mock('../services/post.service.js', async () => {
  const actual = await vi.importActual<typeof import('../services/post.service.js')>(
    '../services/post.service.js',
  );
  return {
    ...actual,
    createPost: (...args: unknown[]) => mockCreatePost(...args),
    updatePost: vi.fn(),
    deletePost: vi.fn(),
    getPostById: vi.fn(),
    getPosts: vi.fn(),
    checkConflicts: vi.fn(),
  };
});

// The route looks up the profile to confirm platform + ownership before
// running pre-flight. Mock returns a LinkedIn profile for VALID_PROFILE_ID.
const mockCheckPlatformBudgetWithDb = vi.fn();
vi.mock('../services/rate-limit.service.js', () => ({
  loadTwitterUsage: vi.fn(),
  loadLinkedInUsage: vi.fn(),
  loadFacebookUsage: vi.fn(),
  checkTwitterBudgetWithDb: vi.fn(),
  checkBulkBudgetWithDb: vi.fn(),
  checkLinkedInBudgetWithDb: vi.fn(),
  checkFacebookBudgetWithDb: vi.fn(),
  checkPlatformBudgetWithDb: (...args: unknown[]) => mockCheckPlatformBudgetWithDb(...args),
}));

function createMockSql() {
  return Object.assign(() => Promise.resolve([{ '?column?': 1 }]), { end: vi.fn() }) as any;
}

function createMockDb(profilePlatform: 'twitter' | 'linkedin' | 'facebook') {
  const db: any = {
    select: vi.fn().mockImplementation(() => {
      const chain: Record<string, any> = {};
      for (const m of ['from', 'limit', 'offset', 'orderBy', 'innerJoin', 'leftJoin']) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.where = vi.fn().mockImplementation(() => ({
        then: (resolve: (val: unknown) => void) =>
          resolve([{ id: VALID_PROFILE_ID, platform: profilePlatform, userId: 'user-1' }]),
      }));
      chain.then = (resolve: (val: unknown) => void) =>
        resolve([{ id: VALID_PROFILE_ID, platform: profilePlatform, userId: 'user-1' }]);
      return chain;
    }),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };
  return db;
}

function createTestApp(profilePlatform: 'twitter' | 'linkedin' | 'facebook' = 'linkedin') {
  return createApp({
    redis: createMockRedis(),
    sql: createMockSql(),
    db: createMockDb(profilePlatform),
    sessionSecret: 'test-secret-that-is-long-enough-for-session',
  });
}

async function authenticatedAgent(profilePlatform: 'twitter' | 'linkedin' | 'facebook' = 'linkedin') {
  const app = createTestApp(profilePlatform);
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

describe('POST /api/posts platform branch (POST-LI-01, POST-FB-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    mockCheckPlatformBudgetWithDb.mockResolvedValue({
      blockThresholdHit: false,
      warnThresholdHit: false,
    });
  });

  it('accepts a valid linkedin payload and persists platform=linkedin (POST-LI-01)', async () => {
    mockCreatePost.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-00000000cccc',
      profileId: VALID_PROFILE_ID,
      platform: 'linkedin',
      text: 'hello world',
      status: 'draft',
    });
    const agent = await authenticatedAgent('linkedin');

    const response = await agent
      .post('/api/posts')
      .send({
        platform: 'linkedin',
        profileId: VALID_PROFILE_ID,
        text: 'hello world',
        visibility: 'PUBLIC',
        status: 'draft',
      });

    expect(response.status).toBe(201);
    expect(response.body.platform).toBe('linkedin');
  });

  it('rejects linkedin text > 3000 chars on the server (T-API-01)', async () => {
    const agent = await authenticatedAgent('linkedin');

    const response = await agent
      .post('/api/posts')
      .send({
        platform: 'linkedin',
        profileId: VALID_PROFILE_ID,
        text: 'a'.repeat(3001),
        visibility: 'PUBLIC',
        status: 'draft',
      });
    expect(response.status).toBe(400);
  });

  it('rejects facebook text > 63206 chars on the server (T-API-01)', async () => {
    const agent = await authenticatedAgent('facebook');

    const response = await agent
      .post('/api/posts')
      .send({
        platform: 'facebook',
        profileId: VALID_PROFILE_ID,
        text: 'a'.repeat(63207),
        status: 'draft',
      });
    expect(response.status).toBe(400);
  });

  it('rejects mixed payload (linkedin + linkUrl) — T-API-03', async () => {
    const agent = await authenticatedAgent('linkedin');

    const response = await agent
      .post('/api/posts')
      .send({
        platform: 'linkedin',
        profileId: VALID_PROFILE_ID,
        text: 'hello',
        visibility: 'PUBLIC',
        linkUrl: 'https://example.com',
        status: 'draft',
      });
    expect(response.status).toBe(400);
  });
});
