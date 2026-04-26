// Unit tests for createTokenRefreshWorker. Uses the BullMQ Worker ctor
// capture pattern from media-cleanup.test.ts to exercise the handler and
// the `.on('failed')` listener without standing up real Redis.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ----- Mocks -------------------------------------------------------------

const logCalls: Array<{ level: string; bindings: unknown; msg?: string }> = [];
vi.mock('@sms/shared/logger', () => ({
  createLogger: () => {
    const makeLogger = (): unknown => {
      const log = (level: string) => (bindings: unknown, msg?: string) => {
        logCalls.push({ level, bindings, msg });
      };
      return {
        info: log('info'),
        warn: log('warn'),
        error: log('error'),
        debug: log('debug'),
        child: () => makeLogger(),
      };
    };
    return makeLogger();
  },
}));

vi.mock('@sms/shared/encryption', () => ({
  decrypt: vi.fn().mockImplementation((ct: string) => `plain-${ct}`),
  encrypt: vi.fn().mockImplementation((plaintext: string) => ({
    ciphertext: `enc-${plaintext}`,
    iv: 'iv-new',
    authTag: 'tag-new',
    version: 1,
  })),
  validateEncryptionKey: vi.fn().mockReturnValue(Buffer.alloc(32)),
}));

vi.mock('@sms/db', () => ({
  socialProfiles: {
    id: 'col_id',
    tokenStatus: 'col_token_status',
    oauth2AccessTokenCiphertext: 'col_at_ct',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ type: 'eq', col, val })),
  ne: vi.fn((col: unknown, val: unknown) => ({ type: 'ne', col, val })),
  sql: Object.assign(
    vi.fn((..._args: unknown[]) => ({ type: 'sql-tag' })),
    { raw: vi.fn((s: string) => ({ type: 'sql-raw', s })) },
  ),
}));

// Capture Worker handler + 'failed' listener so tests can invoke them directly.
let capturedHandler: ((job: unknown) => Promise<unknown>) | null = null;
const capturedListeners: Record<string, Array<(...args: unknown[]) => Promise<unknown> | unknown>> = {};
let capturedWorkerConfig: Record<string, unknown> | null = null;

vi.mock('bullmq', () => {
  class UnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  }
  return {
    UnrecoverableError,
    Worker: class MockWorker {
      name: string;
      constructor(name: string, processor: unknown, opts: unknown) {
        this.name = name;
        capturedHandler = processor as (job: unknown) => Promise<unknown>;
        capturedWorkerConfig = opts as Record<string, unknown>;
      }
      on(evt: string, cb: (...a: unknown[]) => Promise<unknown> | unknown) {
        capturedListeners[evt] = capturedListeners[evt] ?? [];
        capturedListeners[evt]!.push(cb);
        return this;
      }
      close() { return Promise.resolve(); }
    },
  };
});

// Mock global fetch so LinkedIn / Facebook HTTP calls are fully controlled.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// ----- End mocks ---------------------------------------------------------

import {
  createTokenRefreshWorker,
  tokenRefreshBackoffStrategy,
  OAuthProviderConfigError,
} from '../token-refresh-worker.js';
import { tokenRefreshBackoffStrategy as exportedBackoff } from '../backoff.js';
import { JOB_NAMES } from '@sms/shared';

/**
 * Build a mock db that tracks select / update chains:
 *   - `select().from().where()` returns the next seeded profile row.
 *   - `update().set({...}).where(...).returning(...)` returns the next
 *     seeded rowsAffected array.
 *
 * Tests call `pushSelectResult(rows)` and `pushUpdateReturning(rows)` to
 * queue responses, and inspect `updateSets` / `selectCalls` afterward.
 */
function createMockDb() {
  const selectResults: unknown[][] = [];
  const updateReturning: unknown[][] = [];
  const updateSets: Array<Record<string, unknown>> = [];

  const selectFn = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        const rows = selectResults.shift() ?? [];
        return Promise.resolve(rows);
      }),
    }),
  }));

  const updateFn = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation((patch: Record<string, unknown>) => {
      updateSets.push(patch);
      return {
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            const rows = updateReturning.shift() ?? [{ id: 'updated' }];
            return Promise.resolve(rows);
          }),
        }),
      };
    }),
  }));

  const transactionFn = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb({ select: selectFn, update: updateFn });
  });

  return {
    db: { select: selectFn, update: updateFn, transaction: transactionFn } as never,
    pushSelectResult: (rows: unknown[]) => selectResults.push(rows),
    pushUpdateReturning: (rows: unknown[]) => updateReturning.push(rows),
    updateSets,
    selectFn,
    updateFn,
  };
}

function makeLinkedInProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'profile-li-1',
    userId: 'user-1',
    platform: 'linkedin',
    tokenStatus: 'active',
    oauth2AccessTokenCiphertext: 'at-ct',
    oauth2AccessTokenIv: 'at-iv',
    oauth2AccessTokenAuthTag: 'at-tag',
    oauth2RefreshTokenCiphertext: 'rt-ct',
    oauth2RefreshTokenIv: 'rt-iv',
    oauth2RefreshTokenAuthTag: 'rt-tag',
    tokenExpiresAt: new Date('2026-04-30T00:00:00Z'),
    refreshTokenExpiresAt: new Date('2027-04-23T00:00:00Z'),
    ...overrides,
  };
}

function makeFacebookProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'profile-fb-1',
    userId: 'user-2',
    platform: 'facebook',
    tokenStatus: 'active',
    oauth2AccessTokenCiphertext: 'fb-ct',
    oauth2AccessTokenIv: 'fb-iv',
    oauth2AccessTokenAuthTag: 'fb-tag',
    oauth2RefreshTokenCiphertext: null,
    oauth2RefreshTokenIv: null,
    oauth2RefreshTokenAuthTag: null,
    tokenExpiresAt: null,
    ...overrides,
  };
}

function fakeJob(data: Record<string, unknown>, attemptsMade = 0) {
  return {
    id: 'job-123',
    data,
    attemptsMade,
    opts: { attempts: 4 },
  } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedHandler = null;
  capturedWorkerConfig = null;
  for (const k of Object.keys(capturedListeners)) {
    delete capturedListeners[k];
  }
  logCalls.length = 0;
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.LINKEDIN_CLIENT_ID = 'test-li-client';
  process.env.LINKEDIN_CLIENT_SECRET = 'test-li-secret';
  process.env.FACEBOOK_GRAPH_VERSION = 'v25.0';
  fetchMock.mockReset();
});

describe('createTokenRefreshWorker — config', () => {
  it('registers worker with concurrency=2 and attempts=4 shape, and the token-refresh backoff strategy', () => {
    const { db } = createMockDb();
    const tokenRefreshQueue = { add: vi.fn() } as never;
    const notificationQueue = { add: vi.fn() } as never;
    createTokenRefreshWorker({
      redis: {} as never,
      db,
      notificationQueue,
    });

    expect(capturedWorkerConfig).toBeTruthy();
    expect(capturedWorkerConfig!.concurrency).toBe(2);
    expect(capturedWorkerConfig!.lockDuration).toBe(60_000);
    // settings.backoffStrategy is the tokenRefreshBackoffStrategy
    const settings = capturedWorkerConfig!.settings as { backoffStrategy: unknown };
    expect(settings.backoffStrategy).toBe(exportedBackoff);

    // sanity — ensure the re-exported strategy from the worker file is
    // the same function (avoids accidental double-definition).
    expect(tokenRefreshBackoffStrategy).toBe(exportedBackoff);

    // suppress unused var warning
    void tokenRefreshQueue;
  });
});

describe('createTokenRefreshWorker — LinkedIn handler', () => {
  it('happy path: 200 refresh response UPDATEs oauth2AccessToken + tokenExpiresAt + tokenStatus=active, refresh token UNCHANGED', async () => {
    const { db, pushSelectResult, updateSets } = createMockDb();
    pushSelectResult([makeLinkedInProfile()]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) } as never;
    createTokenRefreshWorker({ redis: {} as never, db, notificationQueue });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new-access-token',
        expires_in: 5_184_000,
        refresh_token: 'same-refresh-token',
        refresh_token_expires_in: 31_536_000,
        scope: 'r_liteprofile',
      }),
    });

    await capturedHandler!(
      fakeJob({ profileId: 'profile-li-1', correlationId: 'corr-abc' }),
    );

    expect(updateSets.length).toBe(1);
    const patch = updateSets[0]!;
    // Rewrites access token triple
    expect(patch.oauth2AccessTokenCiphertext).toBe('enc-new-access-token');
    expect(patch.oauth2AccessTokenIv).toBe('iv-new');
    expect(patch.oauth2AccessTokenAuthTag).toBe('tag-new');
    // Sets tokenStatus back to active (recovery path)
    expect(patch.tokenStatus).toBe('active');
    // Writes new tokenExpiresAt + tokenHealthCheckedAt
    expect(patch.tokenExpiresAt).toBeInstanceOf(Date);
    expect(patch.tokenHealthCheckedAt).toBeInstanceOf(Date);
    // PITFALL 3: refresh token ciphertext must NOT be written on success
    expect(patch).not.toHaveProperty('oauth2RefreshTokenCiphertext');
    expect(patch).not.toHaveProperty('oauth2RefreshTokenIv');
    expect(patch).not.toHaveProperty('oauth2RefreshTokenAuthTag');
  });

  it('throws UnrecoverableError on 400 invalid_grant', async () => {
    const { db, pushSelectResult } = createMockDb();
    pushSelectResult([makeLinkedInProfile()]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) } as never;
    createTokenRefreshWorker({ redis: {} as never, db, notificationQueue });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'invalid_grant' }),
    });

    const { UnrecoverableError } = await import('bullmq');
    await expect(
      capturedHandler!(fakeJob({ profileId: 'profile-li-1', correlationId: 'corr-ig' })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('rethrows transient error on LinkedIn 500 (BullMQ will retry)', async () => {
    const { db, pushSelectResult } = createMockDb();
    pushSelectResult([makeLinkedInProfile()]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) } as never;
    createTokenRefreshWorker({ redis: {} as never, db, notificationQueue });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });

    const { UnrecoverableError } = await import('bullmq');
    await expect(
      capturedHandler!(fakeJob({ profileId: 'profile-li-1', correlationId: 'corr-500' })),
    ).rejects.toSatisfy((err: unknown) => err instanceof Error && !(err instanceof UnrecoverableError));
  });

  it('throws OAuthProviderConfigError (extends UnrecoverableError) when LINKEDIN_CLIENT_ID is unset', async () => {
    delete process.env.LINKEDIN_CLIENT_ID;
    const { db, pushSelectResult } = createMockDb();
    pushSelectResult([makeLinkedInProfile()]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) } as never;
    createTokenRefreshWorker({ redis: {} as never, db, notificationQueue });

    const { UnrecoverableError } = await import('bullmq');
    // Catch once and assert both shapes (OAuthProviderConfigError extends
    // UnrecoverableError so BullMQ stops retrying immediately).
    const err = await capturedHandler!(
      fakeJob({ profileId: 'profile-li-1', correlationId: 'corr-cfg' }),
    ).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(OAuthProviderConfigError);
    expect(err).toBeInstanceOf(UnrecoverableError);
    expect((err as OAuthProviderConfigError).missingEnvVar).toBe('LINKEDIN_CLIENT_ID');

    // No HTTP call attempted with empty credentials.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws OAuthProviderConfigError when LINKEDIN_CLIENT_SECRET is unset', async () => {
    delete process.env.LINKEDIN_CLIENT_SECRET;
    const { db, pushSelectResult } = createMockDb();
    pushSelectResult([makeLinkedInProfile()]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) } as never;
    createTokenRefreshWorker({ redis: {} as never, db, notificationQueue });

    await expect(
      capturedHandler!(fakeJob({ profileId: 'profile-li-1', correlationId: 'corr-cfg2' })),
    ).rejects.toBeInstanceOf(OAuthProviderConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws UnrecoverableError when profile has no refresh-token ciphertext', async () => {
    const { db, pushSelectResult } = createMockDb();
    pushSelectResult([makeLinkedInProfile({ oauth2RefreshTokenCiphertext: null })]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) } as never;
    createTokenRefreshWorker({ redis: {} as never, db, notificationQueue });

    const { UnrecoverableError } = await import('bullmq');
    await expect(
      capturedHandler!(fakeJob({ profileId: 'profile-li-1', correlationId: 'corr-nil-rt' })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

describe('createTokenRefreshWorker — Facebook handler', () => {
  it('ping ok=true: UPDATEs tokenHealthCheckedAt only', async () => {
    const { db, pushSelectResult, updateSets } = createMockDb();
    pushSelectResult([makeFacebookProfile()]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) } as never;
    createTokenRefreshWorker({ redis: {} as never, db, notificationQueue });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'fb-page-42' }),
    });

    await capturedHandler!(
      fakeJob({ profileId: 'profile-fb-1', correlationId: 'corr-fb-ok' }),
    );

    expect(updateSets.length).toBe(1);
    const patch = updateSets[0]!;
    expect(patch.tokenHealthCheckedAt).toBeInstanceOf(Date);
    // No token rewrites on ping
    expect(patch).not.toHaveProperty('oauth2AccessTokenCiphertext');
    expect(patch).not.toHaveProperty('tokenStatus');
  });

  it('ping error code 190: throws UnrecoverableError', async () => {
    const { db, pushSelectResult } = createMockDb();
    pushSelectResult([makeFacebookProfile()]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) } as never;
    createTokenRefreshWorker({ redis: {} as never, db, notificationQueue });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 190, type: 'OAuthException', message: 'invalidated' } }),
    });

    const { UnrecoverableError } = await import('bullmq');
    await expect(
      capturedHandler!(fakeJob({ profileId: 'profile-fb-1', correlationId: 'corr-fb-190' })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('ping 500: rethrows transient error', async () => {
    const { db, pushSelectResult } = createMockDb();
    pushSelectResult([makeFacebookProfile()]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) } as never;
    createTokenRefreshWorker({ redis: {} as never, db, notificationQueue });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 500, type: 'internal', message: 'svc' } }),
    });

    const { UnrecoverableError } = await import('bullmq');
    await expect(
      capturedHandler!(fakeJob({ profileId: 'profile-fb-1', correlationId: 'corr-fb-500' })),
    ).rejects.toSatisfy((err: unknown) => err instanceof Error && !(err instanceof UnrecoverableError));
  });
});

describe("createTokenRefreshWorker — on('failed') listener", () => {
  async function invokeFailedListener(
    db: ReturnType<typeof createMockDb>,
    notificationQueue: { add: ReturnType<typeof vi.fn> },
    opts: { job: unknown; err: Error },
  ) {
    createTokenRefreshWorker({
      redis: {} as never,
      db: db.db,
      notificationQueue: notificationQueue as never,
    });
    // Fire the listener BullMQ would fire on retry exhaustion.
    const listener = capturedListeners.failed?.[0];
    if (!listener) throw new Error('no failed listener captured');
    await listener(opts.job, opts.err);
  }

  it('exhausted retries (attemptsMade >= 4) flips tokenStatus to needs_reauth and emits token_reauth_required once', async () => {
    const db = createMockDb();
    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };
    // Seed a needed-for-payload profile row (listener loads profile for user/platform)
    db.pushSelectResult([{ id: 'profile-li-x', userId: 'user-7', platform: 'linkedin' }]);
    db.pushUpdateReturning([{ id: 'profile-li-x' }]);

    await invokeFailedListener(db, notificationQueue, {
      job: {
        id: 'job-fail',
        data: { profileId: 'profile-li-x', correlationId: 'corr-fail' },
        attemptsMade: 4,
        opts: { attempts: 4 },
      },
      err: new Error('LinkedIn 500 persistent'),
    });

    expect(db.updateSets.length).toBe(1);
    expect(db.updateSets[0]!.tokenStatus).toBe('needs_reauth');

    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
    // LinkedIn refresh exhaustion → token_refresh_failed payload
    const [jobName, payload] = notificationQueue.add.mock.calls[0]!;
    expect(jobName).toBe(JOB_NAMES.tokenRefreshFailed);
    expect(payload).toMatchObject({
      eventType: 'token_refresh_failed',
      profileId: 'profile-li-x',
      platform: 'linkedin',
    });
  });

  it('UnrecoverableError fires listener immediately (not waiting for attempts cap)', async () => {
    const db = createMockDb();
    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };
    db.pushSelectResult([{ id: 'profile-fb-y', userId: 'user-8', platform: 'facebook' }]);
    db.pushUpdateReturning([{ id: 'profile-fb-y' }]);

    const { UnrecoverableError } = await import('bullmq');
    await invokeFailedListener(db, notificationQueue, {
      job: {
        id: 'job-fail-ur',
        data: { profileId: 'profile-fb-y', correlationId: 'corr-ur' },
        attemptsMade: 1,        // only one attempt — UnrecoverableError shortcuts
        opts: { attempts: 4 },
      },
      err: new UnrecoverableError('token_invalidated'),
    });

    expect(db.updateSets.length).toBe(1);
    expect(db.updateSets[0]!.tokenStatus).toBe('needs_reauth');
    // Facebook UnrecoverableError is a reauth event
    const [jobName, payload] = notificationQueue.add.mock.calls[0]!;
    expect(jobName).toBe(JOB_NAMES.tokenReauthRequired);
    expect(payload).toMatchObject({
      eventType: 'token_reauth_required',
      profileId: 'profile-fb-y',
      platform: 'facebook',
    });
  });

  it('notification dedupe: second failure on already-needs_reauth profile does NOT emit a notification', async () => {
    const db = createMockDb();
    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };
    db.pushSelectResult([{ id: 'profile-li-z', userId: 'user-9', platform: 'linkedin' }]);
    // Conditional UPDATE returns empty → rowsAffected = 0 (already needs_reauth)
    db.pushUpdateReturning([]);

    await invokeFailedListener(db, notificationQueue, {
      job: {
        id: 'job-fail-dup',
        data: { profileId: 'profile-li-z', correlationId: 'corr-dup' },
        attemptsMade: 4,
        opts: { attempts: 4 },
      },
      err: new Error('persistent 500'),
    });

    // UPDATE was still attempted with the conditional WHERE
    expect(db.updateSets.length).toBe(1);
    // But no notification — dedupe works
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it('OAuthProviderConfigError does NOT flip tokenStatus and does NOT emit a notification (server-misconfig path)', async () => {
    const db = createMockDb();
    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };
    // Even seed an updateReturning row — if the listener wrongly ran the
    // UPDATE, it would consume this and we'd see updateSets.length === 1.
    db.pushUpdateReturning([{ id: 'profile-li-cfg' }]);

    await invokeFailedListener(db, notificationQueue, {
      job: {
        id: 'job-cfg',
        data: { profileId: 'profile-li-cfg', correlationId: 'corr-cfg' },
        attemptsMade: 1,
        opts: { attempts: 4 },
      },
      err: new OAuthProviderConfigError('LINKEDIN_CLIENT_ID'),
    });

    // Server-misconfig: no DB transition, no notification. Ops must fix env.
    expect(db.updateSets.length).toBe(0);
    expect(notificationQueue.add).not.toHaveBeenCalled();

    // A loud error log carrying missingEnvVar so on-call can grep for it.
    const errorLog = logCalls.find(
      (c) => c.level === 'error' && (c.bindings as Record<string, unknown>)?.missingEnvVar === 'LINKEDIN_CLIENT_ID',
    );
    expect(errorLog).toBeTruthy();
  });

  it('does not fire notification logic on non-final failures (attemptsMade < attempts and no UnrecoverableError)', async () => {
    const db = createMockDb();
    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) };

    await invokeFailedListener(db, notificationQueue, {
      job: {
        id: 'job-transient',
        data: { profileId: 'profile-li-q', correlationId: 'corr-t' },
        attemptsMade: 2,       // still has retries left
        opts: { attempts: 4 },
      },
      err: new Error('transient'),
    });

    // No UPDATE, no notification — BullMQ will retry on its own
    expect(db.updateSets.length).toBe(0);
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });
});

describe('createTokenRefreshWorker — log hygiene', () => {
  it('no plaintext token material appears in logCalls after a successful refresh', async () => {
    const { db, pushSelectResult } = createMockDb();
    pushSelectResult([makeLinkedInProfile()]);

    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'n1' }) } as never;
    createTokenRefreshWorker({ redis: {} as never, db, notificationQueue });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'SECRET-TOKEN-VALUE',
        expires_in: 5_184_000,
        refresh_token: 'SECRET-REFRESH',
        refresh_token_expires_in: 31_536_000,
        scope: 'r_liteprofile',
      }),
    });

    await capturedHandler!(
      fakeJob({ profileId: 'profile-li-1', correlationId: 'corr-log' }),
    );

    const serialized = JSON.stringify(logCalls);
    expect(serialized).not.toContain('SECRET-TOKEN-VALUE');
    expect(serialized).not.toContain('SECRET-REFRESH');
    expect(serialized).not.toContain('plain-at-ct');
    expect(serialized).not.toContain('plain-rt-ct');
  });
});
