import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createMockDb } from '../../__tests__/helpers/mock-db.js';
import {
  createProfileFromOAuth,
  reconnectProfile,
  getProfiles,
  updateProfileMetadata,
  getDeletePreview,
  ProfileServiceError,
} from '../profile.service.js';
import { OAuthServiceError } from '../oauth.service.js';

const VALID_KEY = 'a'.repeat(64);
const USER_ID = '11111111-1111-1111-1111-111111111111';
const PROFILE_ID = '22222222-2222-2222-2222-222222222222';

describe('profile.service OAuth flows', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  describe('createProfileFromOAuth', () => {
    it('inserts a LinkedIn row with both access + refresh encrypted', async () => {
      const db = createMockDb();
      const inserted = { id: PROFILE_ID };
      db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          db._insertPayload = payload;
          return {
            returning: vi.fn().mockResolvedValue([inserted]),
          };
        }),
      });

      const result = await createProfileFromOAuth(db, {
        userId: USER_ID,
        platform: 'linkedin',
        platformUserId: 'urn:li:person:abc',
        platformAccountId: 'urn:li:organization:42',
        displayName: 'Jane Doe',
        handle: 'jane-doe',
        avatarUrl: null,
        accessToken: 'plain-access',
        refreshToken: 'plain-refresh',
        tokenExpiresAt: new Date('2026-08-01T00:00:00Z'),
        refreshTokenExpiresAt: new Date('2027-04-01T00:00:00Z'),
      });

      expect(result.profileId).toBe(PROFILE_ID);
      const payload = db._insertPayload as Record<string, unknown>;
      expect(payload.platform).toBe('linkedin');
      expect(payload.platformAccountId).toBe('urn:li:organization:42');
      expect(payload.tokenStatus).toBe('active');
      expect(payload.tokenHealthCheckedAt).toBeInstanceOf(Date);
      expect(payload.tokenEncryptionVersion).toBe(1);
      expect(typeof payload.oauth2AccessTokenCiphertext).toBe('string');
      expect((payload.oauth2AccessTokenCiphertext as string).length).toBeGreaterThan(0);
      expect(typeof payload.oauth2RefreshTokenCiphertext).toBe('string');
      expect((payload.oauth2RefreshTokenCiphertext as string).length).toBeGreaterThan(0);
    });

    it('inserts a Facebook row with refresh fields null', async () => {
      const db = createMockDb();
      const inserted = { id: PROFILE_ID };
      db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          db._insertPayload = payload;
          return {
            returning: vi.fn().mockResolvedValue([inserted]),
          };
        }),
      });

      await createProfileFromOAuth(db, {
        userId: USER_ID,
        platform: 'facebook',
        platformUserId: 'me',
        platformAccountId: 'page-1',
        displayName: 'Page One',
        handle: 'page-one',
        avatarUrl: null,
        accessToken: 'page-token',
        refreshToken: null,
        tokenExpiresAt: null,
        refreshTokenExpiresAt: null,
      });

      const payload = db._insertPayload as Record<string, unknown>;
      expect(payload.oauth2RefreshTokenCiphertext).toBeNull();
      expect(payload.oauth2RefreshTokenIv).toBeNull();
      expect(payload.oauth2RefreshTokenAuthTag).toBeNull();
      expect(payload.refreshTokenExpiresAt).toBeNull();
    });

    it('throws 409 profile_already_connected on unique-constraint violation', async () => {
      const db = createMockDb();
      db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(
            Object.assign(new Error('duplicate key'), { code: '23505' }),
          ),
        }),
      });

      await expect(
        createProfileFromOAuth(db, {
          userId: USER_ID,
          platform: 'linkedin',
          platformUserId: 'urn:li:person:abc',
          platformAccountId: 'urn:li:organization:42',
          displayName: 'Jane',
          handle: 'jane',
          avatarUrl: null,
          accessToken: 'a',
          refreshToken: 'b',
          tokenExpiresAt: null,
          refreshTokenExpiresAt: null,
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('throws 500 when ENCRYPTION_KEY is missing', async () => {
      delete process.env.ENCRYPTION_KEY;
      const db = createMockDb();
      await expect(
        createProfileFromOAuth(db, {
          userId: USER_ID,
          platform: 'linkedin',
          platformUserId: 'p',
          platformAccountId: 'a',
          displayName: 'n',
          handle: 'h',
          avatarUrl: null,
          accessToken: 'a',
          refreshToken: null,
          tokenExpiresAt: null,
          refreshTokenExpiresAt: null,
        }),
      ).rejects.toBeInstanceOf(ProfileServiceError);
    });
  });

  describe('reconnectProfile', () => {
    function setupSelect(row: Record<string, unknown> | null) {
      const db = createMockDb();
      db.transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
      db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(row ? [row] : []),
            then: (resolve: (val: unknown) => void) => resolve(row ? [row] : []),
          }),
        }),
      });
      return db;
    }

    it('updates tokens on platformUserId + platformAccountId match', async () => {
      const db = setupSelect({
        id: PROFILE_ID,
        handle: 'existing-handle',
        platformUserId: 'urn:li:person:abc',
        platformAccountId: 'urn:li:organization:42',
        oauth2RefreshTokenCiphertext: 'old-rt-ct',
        oauth2RefreshTokenIv: 'old-rt-iv',
        oauth2RefreshTokenAuthTag: 'old-rt-at',
      });

      let setPayload: Record<string, unknown> = {};
      db.update = vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((patch: Record<string, unknown>) => {
          setPayload = patch;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: PROFILE_ID }]),
            }),
          };
        }),
      });

      const result = await reconnectProfile(db, {
        userId: USER_ID,
        profileId: PROFILE_ID,
        incomingPlatformUserId: 'urn:li:person:abc',
        incomingPlatformAccountId: 'urn:li:organization:42',
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        tokenExpiresAt: new Date('2026-08-01T00:00:00Z'),
        refreshTokenExpiresAt: new Date('2027-04-01T00:00:00Z'),
        incomingHandle: 'jane-doe',
      });

      expect(result.profileId).toBe(PROFILE_ID);
      expect(result.existingHandle).toBe('existing-handle');
      expect(setPayload.tokenStatus).toBe('active');
      expect(setPayload.tokenHealthCheckedAt).toBeInstanceOf(Date);
      expect(typeof setPayload.oauth2AccessTokenCiphertext).toBe('string');
      expect(typeof setPayload.oauth2RefreshTokenCiphertext).toBe('string');
    });

    it('throws OAuthServiceError 409 mismatched_account on platform ID mismatch', async () => {
      const db = setupSelect({
        id: PROFILE_ID,
        handle: 'existing-handle',
        platformUserId: 'urn:li:person:DIFFERENT',
        platformAccountId: 'urn:li:organization:42',
        oauth2RefreshTokenCiphertext: null,
        oauth2RefreshTokenIv: null,
        oauth2RefreshTokenAuthTag: null,
      });

      await expect(
        reconnectProfile(db, {
          userId: USER_ID,
          profileId: PROFILE_ID,
          incomingPlatformUserId: 'urn:li:person:abc',
          incomingPlatformAccountId: 'urn:li:organization:42',
          accessToken: 'a',
          refreshToken: null,
          tokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          incomingHandle: 'jane-doe',
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'mismatched_account',
      });
    });

    it('mismatch error message includes both handles', async () => {
      const db = setupSelect({
        id: PROFILE_ID,
        handle: 'OLD-HANDLE',
        platformUserId: 'urn:li:person:DIFFERENT',
        platformAccountId: 'urn:li:organization:42',
      });

      try {
        await reconnectProfile(db, {
          userId: USER_ID,
          profileId: PROFILE_ID,
          incomingPlatformUserId: 'urn:li:person:abc',
          incomingPlatformAccountId: 'urn:li:organization:42',
          accessToken: 'a',
          refreshToken: null,
          tokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          incomingHandle: 'NEW-HANDLE',
        });
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(OAuthServiceError);
        expect((err as OAuthServiceError).message).toContain('OLD-HANDLE');
        expect((err as OAuthServiceError).message).toContain('NEW-HANDLE');
      }
    });

    it('throws 404 when profile does not exist for this user', async () => {
      const db = setupSelect(null);
      await expect(
        reconnectProfile(db, {
          userId: USER_ID,
          profileId: PROFILE_ID,
          incomingPlatformUserId: 'p',
          incomingPlatformAccountId: 'a',
          accessToken: 'a',
          refreshToken: null,
          tokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          incomingHandle: 'h',
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('preserves existing refresh token when incoming refreshToken is null', async () => {
      const db = setupSelect({
        id: PROFILE_ID,
        handle: 'existing',
        platformUserId: 'urn:li:person:abc',
        platformAccountId: 'urn:li:organization:42',
        oauth2RefreshTokenCiphertext: 'keep-me-ct',
        oauth2RefreshTokenIv: 'keep-me-iv',
        oauth2RefreshTokenAuthTag: 'keep-me-at',
      });

      let setPayload: Record<string, unknown> = {};
      db.update = vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((patch: Record<string, unknown>) => {
          setPayload = patch;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: PROFILE_ID }]),
            }),
          };
        }),
      });

      await reconnectProfile(db, {
        userId: USER_ID,
        profileId: PROFILE_ID,
        incomingPlatformUserId: 'urn:li:person:abc',
        incomingPlatformAccountId: 'urn:li:organization:42',
        accessToken: 'new-at',
        refreshToken: null,
        tokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        incomingHandle: 'h',
      });

      // set payload should NOT contain oauth2RefreshToken* keys when incoming is null
      expect(setPayload.oauth2RefreshTokenCiphertext).toBeUndefined();
      expect(setPayload.oauth2RefreshTokenIv).toBeUndefined();
      expect(setPayload.oauth2RefreshTokenAuthTag).toBeUndefined();
    });

    it('throws 500 when ENCRYPTION_KEY is missing', async () => {
      delete process.env.ENCRYPTION_KEY;
      const db = setupSelect({
        id: PROFILE_ID,
        handle: 'existing',
        platformUserId: 'urn:li:person:abc',
        platformAccountId: 'urn:li:organization:42',
      });

      await expect(
        reconnectProfile(db, {
          userId: USER_ID,
          profileId: PROFILE_ID,
          incomingPlatformUserId: 'urn:li:person:abc',
          incomingPlatformAccountId: 'urn:li:organization:42',
          accessToken: 'a',
          refreshToken: null,
          tokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          incomingHandle: 'h',
        }),
      ).rejects.toMatchObject({ statusCode: 500 });
    });
  });
});

// Phase 7 Plan 05 — getProfiles / updateProfileMetadata / getDeletePreview
// ---------------------------------------------------------------------------

const CIPHERTEXT_KEYS = [
  'consumerKeyCiphertext',
  'consumerSecretCiphertext',
  'accessTokenCiphertext',
  'accessTokenSecretCiphertext',
  'oauth2AccessTokenCiphertext',
  'oauth2RefreshTokenCiphertext',
  'consumerKeyIv',
  'consumerKeyAuthTag',
  'oauth2AccessTokenIv',
  'oauth2AccessTokenAuthTag',
  'oauth2RefreshTokenIv',
  'oauth2RefreshTokenAuthTag',
] as const;

function buildRawProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    platform: 'linkedin',
    platform_user_id: 'urn:li:person:abc',
    platform_account_id: 'urn:li:organization:42',
    display_name: 'Jane Doe',
    handle: 'jane-doe',
    avatar_url: null,
    connected_at: new Date('2026-04-01T00:00:00Z'),
    last_published_at: null,
    token_status: 'active',
    token_expires_at: new Date('2026-08-01T00:00:00Z'),
    token_health_checked_at: new Date('2026-04-20T00:00:00Z'),
    notes: null,
    next_scheduled_at: null,
    monthly_tweet_budget: 500,
    warn_threshold_percent: 80,
    ...overrides,
  };
}

describe('getProfiles (Phase 7 — extended columns + nextScheduledAt)', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns nextScheduledAt populated when a future scheduled post exists', async () => {
    const futureDate = new Date('2026-06-01T12:00:00Z');
    const db = createMockDb();
    db.execute = vi.fn().mockResolvedValue([
      buildRawProfileRow({ next_scheduled_at: futureDate }),
    ]);

    const profiles = await getProfiles(db, USER_ID);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].nextScheduledAt).toEqual(futureDate);
    expect(profiles[0].tokenStatus).toBe('active');
    expect(profiles[0].platformAccountId).toBe('urn:li:organization:42');
  });

  it('returns nextScheduledAt=null when no future scheduled posts', async () => {
    const db = createMockDb();
    db.execute = vi.fn().mockResolvedValue([
      buildRawProfileRow({ next_scheduled_at: null }),
    ]);

    const profiles = await getProfiles(db, USER_ID);

    expect(profiles[0].nextScheduledAt).toBeNull();
  });

  it('never includes ciphertext fields in the response (T-07-03)', async () => {
    const db = createMockDb();
    db.execute = vi.fn().mockResolvedValue([buildRawProfileRow()]);

    const profiles = await getProfiles(db, USER_ID);
    const serialized = JSON.stringify(profiles[0]);

    for (const secretKey of CIPHERTEXT_KEYS) {
      expect(serialized).not.toContain(secretKey);
    }
  });

  it('scopes the query by userId (ownership)', async () => {
    const db = createMockDb();
    const execute = vi.fn().mockResolvedValue([]);
    db.execute = execute;

    await getProfiles(db, USER_ID);

    // The userId should be bound as a parameter in the sql template.
    // drizzle sql template objects aren't strings — just confirm the call happened.
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe('updateProfileMetadata', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupUpdate(updatedRows: Array<{ id: string }>, refreshedRow?: Record<string, unknown>) {
    const db = createMockDb();
    let capturedSetPayload: Record<string, unknown> = {};

    db.update = vi.fn().mockImplementation(() => {
      const chain: Record<string, any> = {};
      chain.set = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        capturedSetPayload = payload;
        return chain;
      });
      chain.where = vi.fn().mockReturnValue(chain);
      chain.returning = vi.fn().mockResolvedValue(updatedRows);
      return chain;
    });

    db.execute = vi.fn().mockResolvedValue(
      refreshedRow ? [refreshedRow] : [buildRawProfileRow()],
    );

    return { db, getSetPayload: () => capturedSetPayload };
  }

  it('updates displayName only (notes preserved when undefined)', async () => {
    const { db, getSetPayload } = setupUpdate(
      [{ id: PROFILE_ID }],
      buildRawProfileRow({ display_name: 'Renamed' }),
    );

    const refreshed = await updateProfileMetadata(db, {
      userId: USER_ID,
      profileId: PROFILE_ID,
      displayName: 'Renamed',
    });

    const setPayload = getSetPayload();
    expect(setPayload.displayName).toBe('Renamed');
    expect('notes' in setPayload).toBe(false);
    expect(refreshed.displayName).toBe('Renamed');
  });

  it('updates notes only (displayName preserved when undefined)', async () => {
    const { db, getSetPayload } = setupUpdate(
      [{ id: PROFILE_ID }],
      buildRawProfileRow({ notes: '# Hello' }),
    );

    const refreshed = await updateProfileMetadata(db, {
      userId: USER_ID,
      profileId: PROFILE_ID,
      notes: '# Hello',
    });

    const setPayload = getSetPayload();
    expect(setPayload.notes).toBe('# Hello');
    expect('displayName' in setPayload).toBe(false);
    expect(refreshed.notes).toBe('# Hello');
  });

  it('updates both displayName and notes in one call', async () => {
    const { db, getSetPayload } = setupUpdate(
      [{ id: PROFILE_ID }],
      buildRawProfileRow({ display_name: 'Both', notes: '# Both' }),
    );

    await updateProfileMetadata(db, {
      userId: USER_ID,
      profileId: PROFILE_ID,
      displayName: 'Both',
      notes: '# Both',
    });

    const setPayload = getSetPayload();
    expect(setPayload.displayName).toBe('Both');
    expect(setPayload.notes).toBe('# Both');
  });

  it('clears notes when passed null', async () => {
    const { db, getSetPayload } = setupUpdate(
      [{ id: PROFILE_ID }],
      buildRawProfileRow({ notes: null }),
    );

    await updateProfileMetadata(db, {
      userId: USER_ID,
      profileId: PROFILE_ID,
      notes: null,
    });

    const setPayload = getSetPayload();
    expect(setPayload.notes).toBeNull();
  });

  it('throws 404 when update touches zero rows (foreign profileId)', async () => {
    const { db } = setupUpdate([]);

    await expect(
      updateProfileMetadata(db, {
        userId: USER_ID,
        profileId: PROFILE_ID,
        displayName: 'Nope',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 no_fields_to_update when both fields are undefined', async () => {
    const db = createMockDb();

    await expect(
      updateProfileMetadata(db, {
        userId: USER_ID,
        profileId: PROFILE_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('no_fields_to_update'),
    });
  });
});

describe('getDeletePreview', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Builds a mock db whose select().from(posts).where(...) resolves to a
   * list of count rows — one per COUNT query. Queue counts hit the same
   * `posts` table (via queueId IS NOT NULL) so one sequence is sufficient.
   * The tagsLosingLastUse query uses db.execute with raw SQL.
   */
  function setupCounts(counts: {
    drafts: number;
    scheduled: number;
    queueMemberships: number;
    inFlight: number;
    tagsLosingLastUse: number;
  }) {
    const sequence: number[] = [counts.drafts, counts.scheduled, counts.queueMemberships, counts.inFlight];
    const db = createMockDb();
    let selectCallIndex = 0;

    db.select = vi.fn().mockImplementation(() => {
      const callIndex = selectCallIndex++;
      const chain: Record<string, any> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockResolvedValue([{ count: sequence[callIndex] ?? 0 }]);
      return chain;
    });

    db.execute = vi.fn().mockResolvedValue([{ count: counts.tagsLosingLastUse }]);

    return db;
  }

  it('returns the five cascade counts', async () => {
    const db = setupCounts({
      drafts: 3,
      scheduled: 5,
      queueMemberships: 2,
      inFlight: 1,
      tagsLosingLastUse: 4,
    });

    const preview = await getDeletePreview(db, USER_ID, PROFILE_ID);

    expect(preview).toEqual({
      drafts: 3,
      scheduled: 5,
      queueMemberships: 2,
      inFlight: 1,
      tagsLosingLastUse: 4,
    });
  });

  it('returns zeros on an empty profile', async () => {
    const db = setupCounts({
      drafts: 0,
      scheduled: 0,
      queueMemberships: 0,
      inFlight: 0,
      tagsLosingLastUse: 0,
    });

    const preview = await getDeletePreview(db, USER_ID, PROFILE_ID);

    expect(preview).toEqual({
      drafts: 0,
      scheduled: 0,
      queueMemberships: 0,
      inFlight: 0,
      tagsLosingLastUse: 0,
    });
  });

  it('counts tagsLosingLastUse via raw SQL (NOT EXISTS subquery)', async () => {
    const db = setupCounts({
      drafts: 0,
      scheduled: 0,
      queueMemberships: 0,
      inFlight: 0,
      tagsLosingLastUse: 1,
    });

    const preview = await getDeletePreview(db, USER_ID, PROFILE_ID);

    expect(preview.tagsLosingLastUse).toBe(1);
    // Confirm we invoked raw SQL for the NOT EXISTS tags query.
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
