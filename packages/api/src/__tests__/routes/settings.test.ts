import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock auth service (settings.ts imports verifyPassword, hashPassword, etc.)
vi.mock('../../services/auth.service.js', () => ({
  findUserByEmail: vi.fn(),
  verifyPassword: vi.fn(),
  getUserById: vi.fn(),
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

vi.mock('../../middleware/auth-guard.js', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    next();
  },
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

import { createSettingsRouter } from '../../routes/settings.js';

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

function createMockRedis() {
  return {
    scanStream: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} }),
  } as any;
}

function createTestApp(authenticated = true, dbOverride?: any) {
  const app = express();
  app.use(express.json());

  app.use((req: any, _res: any, next: any) => {
    if (authenticated) {
      req.session = { userId: 'test-user-id', id: 'sess-1' };
    } else {
      req.session = {};
    }
    next();
  });

  const db = dbOverride ?? createMockDb();
  const redis = createMockRedis();
  app.use(createSettingsRouter({ db, redis }));

  app.use((_req: any, res: any) => {
    res.status(404).json({ error: 'Not found' });
  });

  return { app, db };
}

describe('GET /api/settings/storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without authenticated session', async () => {
    const { app } = createTestApp(false);
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
    const { app } = createTestApp(true, db);

    const res = await request(app).get('/api/settings/storage');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalSize');
    expect(res.body).toHaveProperty('imageSize');
    expect(res.body).toHaveProperty('videoSize');
    expect(res.body).toHaveProperty('imageCount');
    expect(res.body).toHaveProperty('videoCount');
    expect(res.body.totalSize).toBe(1048576);
    expect(res.body.imageSize).toBe(524288);
    expect(res.body.videoSize).toBe(524288);
    expect(res.body.imageCount).toBe(5);
    expect(res.body.videoCount).toBe(2);
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
    const { app } = createTestApp(true, db);

    const res = await request(app).get('/api/settings/storage');

    expect(res.status).toBe(200);
    expect(res.body.totalSize).toBe(0);
    expect(res.body.imageSize).toBe(0);
    expect(res.body.videoSize).toBe(0);
    expect(res.body.imageCount).toBe(0);
    expect(res.body.videoCount).toBe(0);
  });
});

describe('PUT /api/settings/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts legacy preference updates without defaultLandingPage', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .put('/api/settings/preferences')
      .send({
        timezone: 'UTC',
        dateFormat: 'MMM d, yyyy',
        entriesPerPage: 25,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      timezone: 'UTC',
      dateFormat: 'MMM d, yyyy',
      entriesPerPage: 25,
      defaultLandingPage: '/dashboard',
    });
  });

  it('writes provided defaultLandingPage without reading the fallback value', async () => {
    const updateChain: Record<string, any> = {};
    for (const method of ['where', 'returning']) {
      updateChain[method] = vi.fn().mockReturnValue(updateChain);
    }
    updateChain.set = vi.fn().mockReturnValue(updateChain);
    updateChain.then = (resolve: (value: unknown[]) => void) => resolve([]);
    const db = {
      ...createMockDb(),
      update: vi.fn().mockReturnValue(updateChain),
    };
    const { app } = createTestApp(true, db);

    const res = await request(app)
      .put('/api/settings/preferences')
      .send({
        timezone: 'UTC',
        dateFormat: 'MMM d, yyyy',
        entriesPerPage: 25,
        defaultLandingPage: '/posts',
      });

    expect(res.status).toBe(200);
    expect(res.body.defaultLandingPage).toBe('/posts');
    expect(db.select).not.toHaveBeenCalled();
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      defaultLandingPage: '/posts',
    }));
  });
});
