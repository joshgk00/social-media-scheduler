// Route-level coverage for `routes/rate-limit.ts` — the new collection /
// single-profile endpoints introduced by Plan 03. The legacy test file in
// this directory (`rate-limit.test.ts`) exercises the older
// `/api/profiles/:id/rate-limit` config endpoint living in `profiles.ts`,
// which does NOT read `monthResetAtUtc`. This file covers the actual route
// touched by the issue-#35 fix:
//   GET /api/rate-limit/:profileId
//
// Specifically asserts that the JSON `windowResetAt` is the start of the
// NEXT UTC month (the future boundary), not `monthStartUtc` (the current
// boundary, which is always in the past).
//
// Uses an isolated Express harness rather than `createApp` so the test
// doesn't need the full session/CSRF/Redis scaffolding — the router is
// pure (no auth dependency besides a session-injecting middleware) and
// the service layer is mocked.

import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCheckTwitterBudgetWithDb = vi.fn();
const mockLoadLinkedInUsage = vi.fn();
const mockLoadFacebookUsage = vi.fn();

vi.mock('../../services/rate-limit.service.js', () => ({
  checkTwitterBudgetWithDb: (...args: unknown[]) =>
    mockCheckTwitterBudgetWithDb(...args),
  loadLinkedInUsage: (...args: unknown[]) => mockLoadLinkedInUsage(...args),
  loadFacebookUsage: (...args: unknown[]) => mockLoadFacebookUsage(...args),
}));

vi.mock('@sms/db', () => ({
  socialProfiles: {
    id: { name: 'id' },
    platform: { name: 'platform' },
    userId: { name: 'user_id' },
  },
}));

// Import after mocks are declared.
import { createRateLimitRouter } from '../../routes/rate-limit.js';

const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440099';
const USER_ID = 'user-issue-35';

interface OwnedRow {
  id: string;
  platform: 'twitter' | 'linkedin' | 'facebook';
}

let ownedRows: OwnedRow[] = [];

function createMockDb() {
  return {
    select: vi.fn().mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      (chain as { from: () => unknown }).from = vi.fn().mockReturnValue(chain);
      (chain as { where: () => unknown }).where = vi
        .fn()
        .mockImplementation(() => Promise.resolve(ownedRows));
      return chain;
    }),
  } as unknown as Parameters<typeof createRateLimitRouter>[0]['db'];
}

function buildApp() {
  const app = express();
  app.use(
    session({
      secret: 'issue-35-test-secret-that-is-long-enough-for-session-cookie',
      resave: false,
      saveUninitialized: false,
    }),
  );
  // Inject a fixed session userId so requireAuth passes.
  app.use((req, _res, next) => {
    req.session.userId = USER_ID;
    next();
  });
  app.use(createRateLimitRouter({ db: createMockDb() }));
  return app;
}

describe('GET /api/rate-limit/:profileId — issue #35 windowResetAt wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownedRows = [{ id: PROFILE_ID, platform: 'twitter' }];
  });

  it('returns windowResetAt as the start of the next UTC month (not monthStartUtc)', async () => {
    // The service is stubbed to return the May 2026 window — reset must be
    // the start of June 2026, which is strictly after the start of May.
    mockCheckTwitterBudgetWithDb.mockResolvedValue({
      currentUsage: 120,
      budget: 500,
      warnThresholdPercent: 80,
      projectedCount: 120,
      wouldExceed: false,
      warnThresholdHit: false,
      blockThresholdHit: false,
      remainingBudget: 380,
      monthStartUtc: new Date('2026-05-01T00:00:00Z'),
      monthResetAtUtc: new Date('2026-06-01T00:00:00Z'),
    });

    const res = await request(buildApp()).get(`/api/rate-limit/${PROFILE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.windowResetAt).toBe('2026-06-01T00:00:00.000Z');
    expect(res.body.monthStartUtc).toBe('2026-05-01T00:00:00.000Z');
    // Invariant the bug violated: reset must be strictly after window start.
    expect(new Date(res.body.windowResetAt).getTime()).toBeGreaterThan(
      new Date(res.body.monthStartUtc).getTime(),
    );
  });

  it('does not leak the previous bug: windowResetAt must not equal monthStartUtc', async () => {
    // Regression guard. If a refactor reverts `windowResetAt` back to
    // `state.monthStartUtc.toISOString()` (the issue-#35 bug), this assertion
    // fails.
    mockCheckTwitterBudgetWithDb.mockResolvedValue({
      currentUsage: 0,
      budget: 500,
      warnThresholdPercent: 80,
      projectedCount: 0,
      wouldExceed: false,
      warnThresholdHit: false,
      blockThresholdHit: false,
      remainingBudget: 500,
      monthStartUtc: new Date('2026-05-01T00:00:00Z'),
      monthResetAtUtc: new Date('2026-06-01T00:00:00Z'),
    });

    const res = await request(buildApp()).get(`/api/rate-limit/${PROFILE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.windowResetAt).not.toBe(res.body.monthStartUtc);
  });
});
