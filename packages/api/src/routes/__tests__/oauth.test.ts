import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

import { createMockRedis } from '../../__tests__/helpers/mock-redis.js';

// Hoisted service mocks so we can assert calls from within handlers.
const hoisted = vi.hoisted(() => ({
  linkedinBuildAuthorizeUrl: vi.fn(),
  linkedinExchange: vi.fn(),
  linkedinUserInfo: vi.fn(),
  linkedinFetchOrgs: vi.fn(),
  fbBuildAuthorizeUrl: vi.fn(),
  fbExchange: vi.fn(),
  fbShortToLong: vi.fn(),
  fbFetchPages: vi.fn(),
  createProfileFromOAuth: vi.fn(),
  reconnectProfile: vi.fn(),
}));

vi.mock('../../services/linkedin.service.js', () => ({
  buildAuthorizeUrl: hoisted.linkedinBuildAuthorizeUrl,
  exchangeAuthorizationCode: hoisted.linkedinExchange,
  fetchUserInfo: hoisted.linkedinUserInfo,
  fetchPostableOrgs: hoisted.linkedinFetchOrgs,
  LinkedInApiError: class LinkedInApiError extends Error {
    constructor(public status: number, public body: string) {
      super(`LinkedIn ${status}`);
    }
  },
}));

vi.mock('../../services/facebook.service.js', () => ({
  buildAuthorizeUrl: hoisted.fbBuildAuthorizeUrl,
  exchangeAuthorizationCode: hoisted.fbExchange,
  exchangeShortLivedToken: hoisted.fbShortToLong,
  fetchUserPages: hoisted.fbFetchPages,
  FacebookApiError: class FacebookApiError extends Error {
    constructor(public status: number, public body: string, public code?: number) {
      super(`Facebook ${status}`);
    }
  },
}));

vi.mock('../../services/profile.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/profile.service.js')>(
    '../../services/profile.service.js',
  );
  return {
    ...actual,
    createProfileFromOAuth: hoisted.createProfileFromOAuth,
    reconnectProfile: hoisted.reconnectProfile,
  };
});

import { createOAuthRouter } from '../oauth.js';
import { OAuthServiceError } from '../../services/oauth.service.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';

function createTestApp(options: { redis: any; authenticated?: boolean; db?: any }) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (options.authenticated !== false) {
      req.session = { userId: USER_ID, id: 'sess-1' };
    } else {
      req.session = {};
    }
    next();
  });
  app.use(createOAuthRouter({ db: options.db ?? {}, redis: options.redis }));
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  return app;
}

describe('oauth router', () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
    // multi() GET+DEL
    redis.multi = vi.fn().mockImplementation(() => {
      let getKey: string | null = null;
      let delKey: string | null = null;
      const chain = {
        get: vi.fn().mockImplementation((key: string) => {
          getKey = key;
          return chain;
        }),
        del: vi.fn().mockImplementation((key: string) => {
          delKey = key;
          return chain;
        }),
        exec: vi.fn().mockImplementation(async () => {
          const value = getKey ? await redis.get(getKey) : null;
          if (delKey) await redis.del(delKey);
          return [[null, value], [null, value ? 1 : 0]];
        }),
      };
      return chain;
    });

    process.env.LINKEDIN_CLIENT_ID = 'li-client';
    process.env.LINKEDIN_CLIENT_SECRET = 'li-secret';
    process.env.FACEBOOK_APP_ID = 'fb-app';
    process.env.FACEBOOK_APP_SECRET = 'fb-secret';
    process.env.OAUTH_REDIRECT_BASE_URL = 'https://example.com';
    process.env.LINKEDIN_API_VERSION = '202604';
    process.env.FACEBOOK_GRAPH_VERSION = 'v25.0';

    hoisted.linkedinBuildAuthorizeUrl.mockReset();
    hoisted.linkedinExchange.mockReset();
    hoisted.linkedinUserInfo.mockReset();
    hoisted.linkedinFetchOrgs.mockReset();
    hoisted.fbBuildAuthorizeUrl.mockReset();
    hoisted.fbExchange.mockReset();
    hoisted.fbShortToLong.mockReset();
    hoisted.fbFetchPages.mockReset();
    hoisted.createProfileFromOAuth.mockReset();
    hoisted.reconnectProfile.mockReset();
  });

  afterEach(() => {
    delete process.env.LINKEDIN_CLIENT_ID;
    delete process.env.LINKEDIN_CLIENT_SECRET;
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;
    delete process.env.OAUTH_REDIRECT_BASE_URL;
  });

  describe('GET /api/oauth/start/:platform', () => {
    it('returns 401 without session', async () => {
      const app = createTestApp({ redis, authenticated: false });
      const res = await request(app).get('/api/oauth/start/linkedin');
      expect(res.status).toBe(401);
    });

    it('302s to LinkedIn with state nonce stored in Redis', async () => {
      hoisted.linkedinBuildAuthorizeUrl.mockImplementation(async (args: any) => {
        return `https://www.linkedin.com/oauth/v2/authorization?state=${args.state}`;
      });

      const app = createTestApp({ redis });
      const res = await request(app).get('/api/oauth/start/linkedin');

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization\?state=/);
      expect(redis.set).toHaveBeenCalled();
      const setCall = (redis.set as any).mock.calls[0];
      expect(setCall[0]).toMatch(/^oauth:state:/);
      expect(setCall[2]).toBe('EX');
      expect(setCall[3]).toBe(600);
    });

    it('302s to Facebook when platform=facebook', async () => {
      hoisted.fbBuildAuthorizeUrl.mockImplementation(async (args: any) => {
        return `https://www.facebook.com/v25.0/dialog/oauth?state=${args.state}`;
      });

      const app = createTestApp({ redis });
      const res = await request(app).get('/api/oauth/start/facebook');

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^https:\/\/www\.facebook\.com\/v25\.0\/dialog\/oauth\?state=/);
    });
  });

  describe('GET /api/oauth/callback/:platform', () => {
    it('redirects with oauth_error=access_denied when provider sends error=access_denied', async () => {
      const app = createTestApp({ redis });
      const res = await request(app).get(
        '/api/oauth/callback/linkedin?state=any&error=access_denied',
      );
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/profiles?oauth_error=access_denied');
    });

    it('redirects with oauth_error=invalid_state when nonce missing', async () => {
      const app = createTestApp({ redis });
      const res = await request(app).get('/api/oauth/callback/linkedin?state=bogus&code=X');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/profiles?oauth_error=invalid_state');
    });

    it('on valid state completes flow and redirects to returnTo?connect=<tempToken>', async () => {
      // Seed a state payload
      const statePayload = {
        userId: USER_ID,
        platform: 'linkedin' as const,
        scope: 'openid profile email w_member_social',
        returnTo: '/profiles',
        reconnectProfileId: null,
      };
      await redis.set('oauth:state:valid-nonce', JSON.stringify(statePayload), 'EX', 600);

      hoisted.linkedinExchange.mockResolvedValue({
        access_token: 'at',
        expires_in: 5184000,
        refresh_token: 'rt',
        refresh_token_expires_in: 31536000,
        scope: 'openid',
      });
      hoisted.linkedinUserInfo.mockResolvedValue({
        sub: 'urn:li:person:abc',
        name: 'Jane Doe',
      });
      hoisted.linkedinFetchOrgs.mockResolvedValue([]);

      const app = createTestApp({ redis });
      const res = await request(app).get(
        '/api/oauth/callback/linkedin?state=valid-nonce&code=CODE',
      );

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^\/profiles\?connect=/);

      // Pending key should exist in the mock
      const pendingKeys = Array.from((redis as any).set.mock.calls)
        .map((call: any) => call[0])
        .filter((k: string) => k.startsWith('oauth:pending:'));
      expect(pendingKeys.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/oauth/pending/:tempToken', () => {
    it('returns the pending account list without token material', async () => {
      const pendingPayload = {
        userId: USER_ID,
        platform: 'linkedin',
        platformUserId: 'urn:li:person:abc',
        displayName: 'Jane',
        handle: 'jane',
        userToken: 'SECRET-TOKEN',
        refreshToken: 'SECRET-REFRESH',
        refreshTokenExpiresInSeconds: 31536000,
        tokenExpiresInSeconds: 5184000,
        accounts: [
          { platformAccountId: 'urn:li:person:abc', name: 'Jane', subLabel: 'Personal' },
        ],
      };
      await redis.set('oauth:pending:token-abc', JSON.stringify(pendingPayload), 'EX', 900);

      const app = createTestApp({ redis });
      const res = await request(app).get('/api/oauth/pending/token-abc');

      expect(res.status).toBe(200);
      expect(res.body.platform).toBe('linkedin');
      expect(res.body.accounts).toHaveLength(1);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('SECRET-TOKEN');
      expect(serialized).not.toContain('SECRET-REFRESH');
    });

    it('returns 404 when tempToken missing', async () => {
      const app = createTestApp({ redis });
      const res = await request(app).get('/api/oauth/pending/does-not-exist');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/oauth/finalize', () => {
    it('creates a new profile when reconnectProfileId is null', async () => {
      const statePayload = {
        userId: USER_ID,
        platform: 'linkedin' as const,
        scope: 'openid',
        returnTo: '/profiles',
        reconnectProfileId: null,
      };
      const pendingPayload = {
        userId: USER_ID,
        platform: 'linkedin',
        platformUserId: 'urn:li:person:abc',
        displayName: 'Jane',
        handle: 'jane',
        userToken: 'access-token',
        refreshToken: 'refresh-token',
        refreshTokenExpiresInSeconds: 31536000,
        tokenExpiresInSeconds: 5184000,
        reconnectProfileId: null,
        accounts: [
          { platformAccountId: 'urn:li:organization:42', name: 'Acme' },
        ],
      };
      await redis.set('oauth:pending:tok-1', JSON.stringify(pendingPayload), 'EX', 900);
      void statePayload;

      hoisted.createProfileFromOAuth.mockResolvedValue({ profileId: 'prof-1' });

      const app = createTestApp({ redis });
      const res = await request(app)
        .post('/api/oauth/finalize')
        .send({ tempToken: 'tok-1', platformAccountId: 'urn:li:organization:42' });

      expect(res.status).toBe(201);
      expect(res.body.profileId).toBe('prof-1');
      expect(hoisted.createProfileFromOAuth).toHaveBeenCalledTimes(1);
      // Redis pending key consumed
      expect(await redis.get('oauth:pending:tok-1')).toBeNull();
    });

    it('returns 409 with both handles and tempToken on reconnect mismatch', async () => {
      const pendingPayload = {
        userId: USER_ID,
        platform: 'linkedin',
        platformUserId: 'urn:li:person:NEW',
        displayName: 'New',
        handle: 'new-handle',
        userToken: 'at',
        refreshToken: 'rt',
        tokenExpiresInSeconds: 5184000,
        reconnectProfileId: 'profile-1',
        accounts: [
          { platformAccountId: 'urn:li:organization:42', name: 'Acme' },
        ],
      };
      await redis.set('oauth:pending:tok-2', JSON.stringify(pendingPayload), 'EX', 900);

      hoisted.reconnectProfile.mockRejectedValue(
        new OAuthServiceError(
          'Existing profile is @old-handle; reconnect attempted with @new-handle',
          409,
          'mismatched_account',
        ),
      );

      const app = createTestApp({ redis });
      const res = await request(app)
        .post('/api/oauth/finalize')
        .send({ tempToken: 'tok-2', platformAccountId: 'urn:li:organization:42' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('mismatched_account');
      expect(res.body.existingHandle).toBe('old-handle');
      expect(res.body.incomingHandle).toBe('new-handle');
      // Mismatch returns a re-issued tempToken (original was consumed) so the
      // frontend can call /finalize-as-new without going back through the IdP.
      expect(typeof res.body.tempToken).toBe('string');
      expect(res.body.tempToken.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/oauth/finalize-as-new', () => {
    it('always calls createProfileFromOAuth even when reconnectProfileId is set', async () => {
      const pendingPayload = {
        userId: USER_ID,
        platform: 'linkedin',
        platformUserId: 'urn:li:person:abc',
        displayName: 'Jane',
        handle: 'jane',
        userToken: 'at',
        refreshToken: 'rt',
        tokenExpiresInSeconds: 5184000,
        reconnectProfileId: 'some-profile-id',
        accounts: [
          { platformAccountId: 'urn:li:organization:42', name: 'Acme' },
        ],
      };
      await redis.set('oauth:pending:tok-3', JSON.stringify(pendingPayload), 'EX', 900);

      hoisted.createProfileFromOAuth.mockResolvedValue({ profileId: 'new-prof' });

      const app = createTestApp({ redis });
      const res = await request(app)
        .post('/api/oauth/finalize-as-new')
        .send({ tempToken: 'tok-3', platformAccountId: 'urn:li:organization:42' });

      expect(res.status).toBe(201);
      expect(res.body.profileId).toBe('new-prof');
      expect(hoisted.createProfileFromOAuth).toHaveBeenCalledTimes(1);
      expect(hoisted.reconnectProfile).not.toHaveBeenCalled();
    });
  });
});
