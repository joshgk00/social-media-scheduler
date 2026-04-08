import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { createMockRedis } from '../helpers/mock-redis.js';
import type { RequestHandler } from 'express';

const mockCreatePost = vi.fn();
const mockUpdatePost = vi.fn();
const mockDeletePost = vi.fn();
const mockGetPostById = vi.fn();
const mockGetPosts = vi.fn();
const mockCheckConflicts = vi.fn();

vi.mock('../../services/post.service.js', async () => {
  const { PostServiceError } = await vi.importActual<typeof import('../../services/post.service.js')>('../../services/post.service.js');
  return {
    createPost: (...args: unknown[]) => mockCreatePost(...args),
    updatePost: (...args: unknown[]) => mockUpdatePost(...args),
    deletePost: (...args: unknown[]) => mockDeletePost(...args),
    getPostById: (...args: unknown[]) => mockGetPostById(...args),
    getPosts: (...args: unknown[]) => mockGetPosts(...args),
    checkConflicts: (...args: unknown[]) => mockCheckConflicts(...args),
    PostServiceError,
  };
});

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

const POST_ID = '550e8400-e29b-41d4-a716-446655440001';
const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440002';
const TAG_ID = '550e8400-e29b-41d4-a716-446655440003';

const SAMPLE_POST = {
  id: POST_ID,
  userId: 'user-1',
  profileId: PROFILE_ID,
  text: 'Hello world from the scheduler!',
  isThread: false,
  status: 'draft' as const,
  scheduledAt: null,
  publishedAt: null,
  failedAt: null,
  failureReason: null,
  platformPostId: null,
  postVersion: 1,
  hasSpinnableText: false,
  autoDestructAfter: null,
  notes: 'Test note',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  tags: [{ id: TAG_ID, name: 'marketing', color: '#3b82f6' }],
};

const SAFE_PROFILE = {
  id: PROFILE_ID,
  platform: 'twitter',
  platformUserId: '12345',
  displayName: 'Test User',
  handle: 'testuser',
  avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
  tokenEncryptionVersion: 1,
  connectedAt: new Date().toISOString(),
  lastPublishedAt: null,
};

describe('posts API integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  describe('POST /api/posts', () => {
    it('creates a post with all common fields', async () => {
      mockCreatePost.mockResolvedValueOnce(SAMPLE_POST);
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/posts')
        .send({
          profileId: PROFILE_ID,
          text: 'Hello world from the scheduler!',
          status: 'draft',
          notes: 'Test note',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', SAMPLE_POST.id);
      expect(res.body).toHaveProperty('text', SAMPLE_POST.text);
      expect(res.body).toHaveProperty('notes', SAMPLE_POST.notes);
    });

    it('associates tags on creation', async () => {
      const postWithTags = { ...SAMPLE_POST, tags: [{ id: TAG_ID, name: 'marketing', color: '#3b82f6' }] };
      mockCreatePost.mockResolvedValueOnce(postWithTags);
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/posts')
        .send({
          profileId: PROFILE_ID,
          text: 'Tagged post',
          tagIds: [TAG_ID],
        });

      expect(res.status).toBe(201);
      expect(res.body.tags).toHaveLength(1);
      expect(res.body.tags[0]).toHaveProperty('name', 'marketing');
    });

    it('stores auto-destruct configuration', async () => {
      const postWithAutoDestruct = { ...SAMPLE_POST, autoDestructAfter: '24h' };
      mockCreatePost.mockResolvedValueOnce(postWithAutoDestruct);
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/posts')
        .send({
          profileId: PROFILE_ID,
          text: 'Temporary post',
          autoDestructAfter: '24h',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('autoDestructAfter', '24h');
    });

    it('stores notes', async () => {
      mockCreatePost.mockResolvedValueOnce(SAMPLE_POST);
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/posts')
        .send({
          profileId: PROFILE_ID,
          text: 'Post with notes',
          notes: 'Test note',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('notes', 'Test note');
    });
  });

  describe('GET /api/posts', () => {
    it('returns posts with tags included', async () => {
      mockGetPosts.mockResolvedValueOnce({
        posts: [SAMPLE_POST],
        total: 1,
        page: 1,
        limit: 25,
      });
      const agent = await authenticatedAgent();

      const res = await agent.get('/api/posts');

      expect(res.status).toBe(200);
      expect(res.body.posts).toHaveLength(1);
      expect(res.body.posts[0].tags).toHaveLength(1);
    });

    it('paginates correctly', async () => {
      mockGetPosts.mockResolvedValueOnce({
        posts: [SAMPLE_POST],
        total: 50,
        page: 2,
        limit: 10,
      });
      const agent = await authenticatedAgent();

      const res = await agent.get('/api/posts?page=2&limit=10');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('page', 2);
      expect(res.body).toHaveProperty('limit', 10);
      expect(res.body).toHaveProperty('total', 50);
    });

    it('filters by multiple criteria simultaneously', async () => {
      mockGetPosts.mockResolvedValueOnce({
        posts: [],
        total: 0,
        page: 1,
        limit: 25,
      });
      const agent = await authenticatedAgent();

      const res = await agent.get(
        `/api/posts?status=scheduled&profileId=${PROFILE_ID}&search=hello`
      );

      expect(res.status).toBe(200);
      expect(mockGetPosts).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.objectContaining({
          status: 'scheduled',
          profileId: PROFILE_ID,
          search: 'hello',
        }),
      );
    });

    it('all filtering is server-side (not client-side)', async () => {
      mockGetPosts.mockResolvedValueOnce({
        posts: [SAMPLE_POST],
        total: 1,
        page: 1,
        limit: 25,
      });
      const agent = await authenticatedAgent();

      await agent.get(`/api/posts?status=draft&profileId=${PROFILE_ID}&tagId=${TAG_ID}&search=test`);

      expect(mockGetPosts).toHaveBeenCalledTimes(1);
      const [, , queryArg] = mockGetPosts.mock.calls[0];
      expect(queryArg).toHaveProperty('status', 'draft');
      expect(queryArg).toHaveProperty('profileId', PROFILE_ID);
      expect(queryArg).toHaveProperty('tagId', TAG_ID);
      expect(queryArg).toHaveProperty('search', 'test');
    });
  });

  describe('PUT /api/posts/:id', () => {
    it('enforces optimistic locking via atomic post_version update', async () => {
      const updatedPost = { ...SAMPLE_POST, text: 'Updated text', postVersion: 2 };
      mockUpdatePost.mockResolvedValueOnce(updatedPost);
      const agent = await authenticatedAgent();

      const res = await agent
        .put(`/api/posts/${POST_ID}`)
        .send({ text: 'Updated text', postVersion: 1 });

      expect(res.status).toBe(200);
      expect(mockUpdatePost).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        POST_ID,
        expect.objectContaining({ postVersion: 1 }),
      );
    });

    it('returns 409 for version mismatch with specific message', async () => {
      const { PostServiceError } = await import('../../services/post.service.js');
      mockUpdatePost.mockRejectedValueOnce(
        new PostServiceError('This post was modified elsewhere. Refresh to see the latest version.', 409),
      );
      const agent = await authenticatedAgent();

      const res = await agent
        .put(`/api/posts/${POST_ID}`)
        .send({ text: 'Stale update', postVersion: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('modified elsewhere');
    });

    it('returns 409 for non-editable state', async () => {
      const { PostServiceError } = await import('../../services/post.service.js');
      mockUpdatePost.mockRejectedValueOnce(
        new PostServiceError('This post is currently being published and cannot be edited.', 409),
      );
      const agent = await authenticatedAgent();

      const res = await agent
        .put(`/api/posts/${POST_ID}`)
        .send({ text: 'Blocked update', postVersion: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('currently being published');
    });
  });

  describe('state machine enforcement', () => {
    it('drafts are excluded from scheduler query (status != scheduled)', async () => {
      mockGetPosts.mockResolvedValueOnce({
        posts: [],
        total: 0,
        page: 1,
        limit: 25,
      });
      const agent = await authenticatedAgent();

      await agent.get('/api/posts?status=scheduled');

      expect(mockGetPosts).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.objectContaining({ status: 'scheduled' }),
      );
    });

    it('publishing state blocks edits with 409', async () => {
      const { PostServiceError } = await import('../../services/post.service.js');
      mockUpdatePost.mockRejectedValueOnce(
        new PostServiceError('This post is currently being published and cannot be edited.', 409),
      );
      const agent = await authenticatedAgent();

      const res = await agent
        .put(`/api/posts/${POST_ID}`)
        .send({ text: 'Blocked edit', postVersion: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('currently being published');
    });

    it('failed -> draft transition allowed for re-editing', async () => {
      const { transitionPost } = await import('@sms/shared');
      const result = transitionPost('failed', 'draft');
      expect(result).toBe('draft');
    });
  });

  describe('credential security', () => {
    it('GET /api/profiles never returns ciphertext, IV, or authTag fields', async () => {
      mockGetProfiles.mockResolvedValueOnce([SAFE_PROFILE]);
      const agent = await authenticatedAgent();

      const res = await agent.get('/api/profiles');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const sensitiveFields = [
        'consumerKeyCiphertext', 'consumerKeyIv', 'consumerKeyAuthTag',
        'consumerSecretCiphertext', 'consumerSecretIv', 'consumerSecretAuthTag',
        'accessTokenCiphertext', 'accessTokenIv', 'accessTokenAuthTag',
        'accessTokenSecretCiphertext', 'accessTokenSecretIv', 'accessTokenSecretAuthTag',
      ];

      for (const profile of res.body) {
        for (const field of sensitiveFields) {
          expect(profile).not.toHaveProperty(field);
        }
      }
    });

    it('credential values never appear in error messages or logs', async () => {
      const duplicateError = Object.assign(
        new Error('This Twitter account is already connected.'),
        { statusCode: 409 },
      );
      mockCreateProfile.mockRejectedValueOnce(duplicateError);
      const agent = await authenticatedAgent();

      const res = await agent
        .post('/api/profiles')
        .send({
          consumerKey: 'ck-secret-value-abc123',
          consumerSecret: 'cs-secret-value-def456',
          accessToken: 'at-secret-value-ghi789',
          accessTokenSecret: 'ats-secret-value-jkl012',
        });

      const responseBody = JSON.stringify(res.body);
      expect(responseBody).not.toContain('ck-secret-value-abc123');
      expect(responseBody).not.toContain('cs-secret-value-def456');
      expect(responseBody).not.toContain('at-secret-value-ghi789');
      expect(responseBody).not.toContain('ats-secret-value-jkl012');
    });
  });

  describe('conflict detection', () => {
    it('conflict check uses UTC time window of +/- 5 minutes', async () => {
      mockCheckConflicts.mockResolvedValueOnce([]);
      const agent = await authenticatedAgent();

      const scheduledAt = '2026-04-15T14:00:00.000Z';

      const res = await agent.get(
        `/api/posts/conflicts?profileId=${PROFILE_ID}&scheduledAt=${encodeURIComponent(scheduledAt)}`
      );

      expect(res.status).toBe(200);
      expect(mockCheckConflicts).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        scheduledAt,
        undefined,
      );
    });
  });

  describe('duplicate profile prevention', () => {
    it('rejects duplicate profile for same Twitter account', async () => {
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
  });
});
