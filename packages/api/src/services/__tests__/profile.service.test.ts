import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createMockDb } from '../../__tests__/helpers/mock-db.js';
import {
  createProfileFromOAuth,
  reconnectProfile,
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
