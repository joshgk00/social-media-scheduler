import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { RequestHandler } from 'express';

import { createApp } from '../../app.js';
import { createMockRedis } from '../helpers/mock-redis.js';

// LIMIT-01 + T-04-04-03/04: ownership + mass-assignment coverage for the
// rate-limit config endpoints used by the "Rate limit settings" modal.

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

// CSRF pass-through: the middleware ignores GET/HEAD/OPTIONS by default in
// csrf-csrf config, so GETs here don't need a token. PATCH would normally
// require one — the suite mocks it out so PATCH-specific logic (Zod,
// ownership, response shape) can be asserted without plumbing tokens.
vi.mock('../../middleware/csrf.js', () => ({
  doubleCsrfProtection: ((_req: any, _res: any, next: any) => next()) as RequestHandler,
  generateCsrfToken: (_req: any, _res: any) => 'test-csrf-token',
}));

vi.mock('../../routes/admin.js', () => ({
  createAdminRouter: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Router } = require('express');
    return Router();
  },
}));

// Mock the rate-limit service so we control what the route handlers see
// without needing a real DB + profile row.
const mockCheckTwitterBudgetWithDb = vi.fn();
vi.mock('../../services/rate-limit.service.js', () => ({
  loadTwitterUsage: vi.fn(),
  checkTwitterBudgetWithDb: (...args: unknown[]) =>
    mockCheckTwitterBudgetWithDb(...args),
  checkBulkBudgetWithDb: vi.fn(),
}));

const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440050';
const OTHER_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440051';

// Controls whether the ownership SELECT returns a row (GET path) and
// whether the UPDATE ... RETURNING yields rows (PATCH path).
const dbState: { ownsProfile: boolean; updateReturns: boolean } = {
  ownsProfile: true,
  updateReturns: true,
};

function createMockSql() {
  return Object.assign(
    () => Promise.resolve([{ '?column?': 1 }]),
    { end: vi.fn() },
  ) as any;
}

function createMockDb() {
  const db: any = {
    select: vi.fn().mockImplementation(() => {
      const chain: Record<string, any> = {};
      for (const m of ['from', 'limit', 'offset', 'orderBy', 'innerJoin', 'leftJoin']) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.where = vi.fn().mockImplementation(() => ({
        then: (resolve: (val: unknown) => void) =>
          resolve(dbState.ownsProfile ? [{ id: PROFILE_ID }] : []),
      }));
      chain.then = (resolve: (val: unknown) => void) =>
        resolve(dbState.ownsProfile ? [{ id: PROFILE_ID }] : []);
      return chain;
    }),
    update: vi.fn().mockImplementation(() => {
      const chain: Record<string, any> = {};
      for (const m of ['set', 'where']) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.returning = vi.fn().mockResolvedValue(
        dbState.updateReturns ? [{ id: PROFILE_ID }] : [],
      );
      return chain;
    }),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };
  return db;
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

function stubBudgetState(overrides: Partial<any> = {}) {
  mockCheckTwitterBudgetWithDb.mockResolvedValue({
    currentUsage: 120,
    budget: 500,
    warnThresholdPercent: 80,
    projectedCount: 120,
    wouldExceed: false,
    warnThresholdHit: false,
    blockThresholdHit: false,
    remainingBudget: 380,
    monthStartUtc: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  });
}

describe('GET /api/profiles/:id/rate-limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.ownsProfile = true;
    dbState.updateReturns = true;
    process.env.CSRF_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('returns the rate-limit state for an owned profile', async () => {
    stubBudgetState({
      currentUsage: 250,
      budget: 500,
      warnThresholdPercent: 80,
    });
    const agent = await authenticatedAgent();

    const res = await agent.get(`/api/profiles/${PROFILE_ID}/rate-limit`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      profileId: PROFILE_ID,
      currentCount: 250,
      budget: 500,
      warnThresholdPercent: 80,
      warnThresholdHit: false,
      blockThresholdHit: false,
    });
    expect(res.body.monthStartUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns 404 for a profile owned by a different user', async () => {
    dbState.ownsProfile = false;
    const agent = await authenticatedAgent();

    const res = await agent.get(`/api/profiles/${OTHER_PROFILE_ID}/rate-limit`);

    expect(res.status).toBe(404);
    expect(mockCheckTwitterBudgetWithDb).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/profiles/:id/rate-limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.ownsProfile = true;
    dbState.updateReturns = true;
    process.env.CSRF_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('returns 200 and an updated state on valid input', async () => {
    stubBudgetState({ budget: 1000, warnThresholdPercent: 75 });
    const agent = await authenticatedAgent();

    const res = await agent
      .patch(`/api/profiles/${PROFILE_ID}/rate-limit`)
      .send({ monthlyTweetBudget: 1000, warnThresholdPercent: 75 });

    expect(res.status).toBe(200);
    expect(res.body.budget).toBe(1000);
    expect(res.body.warnThresholdPercent).toBe(75);
  });

  it('returns 400 when monthlyTweetBudget is below the 1 lower bound', async () => {
    const agent = await authenticatedAgent();

    const res = await agent
      .patch(`/api/profiles/${PROFILE_ID}/rate-limit`)
      .send({ monthlyTweetBudget: 0, warnThresholdPercent: 80 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when monthlyTweetBudget exceeds the 10000 upper bound', async () => {
    const agent = await authenticatedAgent();

    const res = await agent
      .patch(`/api/profiles/${PROFILE_ID}/rate-limit`)
      .send({ monthlyTweetBudget: 10001, warnThresholdPercent: 80 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when warnThresholdPercent is 100 (must be <= 99)', async () => {
    const agent = await authenticatedAgent();

    const res = await agent
      .patch(`/api/profiles/${PROFILE_ID}/rate-limit`)
      .send({ monthlyTweetBudget: 500, warnThresholdPercent: 100 });

    expect(res.status).toBe(400);
  });

  it('rejects unknown keys via .strict() (mass-assignment guard, T-04-04-04)', async () => {
    const agent = await authenticatedAgent();

    const res = await agent
      .patch(`/api/profiles/${PROFILE_ID}/rate-limit`)
      .send({
        monthlyTweetBudget: 500,
        warnThresholdPercent: 80,
        userId: 'other-user',
      });

    expect(res.status).toBe(400);
  });

  it('returns 404 for a profile owned by a different user', async () => {
    dbState.updateReturns = false;
    stubBudgetState();
    const agent = await authenticatedAgent();

    const res = await agent
      .patch(`/api/profiles/${OTHER_PROFILE_ID}/rate-limit`)
      .send({ monthlyTweetBudget: 500, warnThresholdPercent: 80 });

    expect(res.status).toBe(404);
  });

  it('returns 401 without a session', async () => {
    const app = createTestApp();
    const res = await request(app)
      .patch(`/api/profiles/${PROFILE_ID}/rate-limit`)
      .send({ monthlyTweetBudget: 500, warnThresholdPercent: 80 });

    expect(res.status).toBe(401);
  });

  it('returns 400 when the body omits required fields', async () => {
    const agent = await authenticatedAgent();

    const res = await agent
      .patch(`/api/profiles/${PROFILE_ID}/rate-limit`)
      .send({ monthlyTweetBudget: 500 });

    expect(res.status).toBe(400);
  });
});
