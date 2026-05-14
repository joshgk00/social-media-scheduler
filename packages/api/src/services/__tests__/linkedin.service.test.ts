import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  fetchUserInfo,
  fetchPostableOrgs,
  LinkedInApiError,
} from '../linkedin.service.js';

// Stub global.fetch so tests exercise real URL + header shapes without hitting
// the network. One handler table per test keeps expectations local.
type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

function mockFetchOnce(handler: FetchHandler) {
  // @ts-expect-error — override only for this test
  global.fetch = vi.fn().mockImplementation(handler);
}

describe('linkedin.service', () => {
  beforeEach(() => {
    process.env.LINKEDIN_API_VERSION = '202604';
  });

  afterEach(() => {
    delete (global as Record<string, unknown>).fetch;
    delete process.env.LINKEDIN_API_VERSION;
  });

  describe('buildAuthorizeUrl', () => {
    it('produces the canonical v2/authorization URL with URL-encoded scope', async () => {
      const url = await buildAuthorizeUrl({
        state: 'abc123',
        clientId: 'client-id-1',
        redirectUri: 'https://example.com/api/oauth/callback/linkedin',
        scope: 'openid profile email w_member_social',
      });

      expect(url.startsWith('https://www.linkedin.com/oauth/v2/authorization?')).toBe(true);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('client_id')).toBe('client-id-1');
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://example.com/api/oauth/callback/linkedin',
      );
      expect(parsed.searchParams.get('state')).toBe('abc123');
      expect(parsed.searchParams.get('scope')).toBe('openid profile email w_member_social');
    });
  });

  describe('exchangeAuthorizationCode', () => {
    it('POSTs form-urlencoded to the token endpoint and returns JSON', async () => {
      const capturedInit: { body?: string; headers?: Record<string, string> } = {};
      mockFetchOnce(async (url, init) => {
        capturedInit.body = init?.body as string;
        capturedInit.headers = init?.headers as Record<string, string>;
        expect(url).toBe('https://www.linkedin.com/oauth/v2/accessToken');
        return new Response(
          JSON.stringify({
            access_token: 'at',
            expires_in: 5184000,
            refresh_token: 'rt',
            refresh_token_expires_in: 31536000,
            scope: 'openid profile email',
          }),
          { status: 200 },
        );
      });

      const result = await exchangeAuthorizationCode({
        code: 'auth-code',
        clientId: 'cid',
        clientSecret: 'secret',
        redirectUri: 'https://ex.com/cb',
      });

      expect(result.access_token).toBe('at');
      expect(result.refresh_token).toBe('rt');
      expect(capturedInit.body).toContain('grant_type=authorization_code');
      expect(capturedInit.body).toContain('code=auth-code');
      expect(capturedInit.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
    });

    it('throws LinkedInApiError on 400', async () => {
      mockFetchOnce(async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
      await expect(
        exchangeAuthorizationCode({
          code: 'bad',
          clientId: 'cid',
          clientSecret: 'secret',
          redirectUri: 'https://ex.com/cb',
        }),
      ).rejects.toBeInstanceOf(LinkedInApiError);
    });
  });

  describe('refreshAccessToken', () => {
    it('POSTs refresh_token grant and returns the token payload', async () => {
      mockFetchOnce(async () =>
        new Response(
          JSON.stringify({
            access_token: 'new-at',
            expires_in: 5184000,
            refresh_token: 'rt-same',
            refresh_token_expires_in: 31536000,
            scope: 'openid',
          }),
          { status: 200 },
        ),
      );

      const result = await refreshAccessToken({
        refreshToken: 'rt-same',
        clientId: 'cid',
        clientSecret: 'secret',
      });

      expect(result.access_token).toBe('new-at');
    });

    it('throws LinkedInApiError on 400', async () => {
      mockFetchOnce(async () => new Response('err', { status: 400 }));
      await expect(
        refreshAccessToken({ refreshToken: 'bad', clientId: 'cid', clientSecret: 'secret' }),
      ).rejects.toBeInstanceOf(LinkedInApiError);
    });
  });

  describe('fetchUserInfo', () => {
    it('GETs userinfo with Bearer header', async () => {
      const captured: { url?: string; auth?: string } = {};
      mockFetchOnce(async (url, init) => {
        captured.url = url;
        captured.auth = (init?.headers as Record<string, string>)?.Authorization;
        return new Response(JSON.stringify({ sub: 'u1', name: 'Jane' }), { status: 200 });
      });

      const info = await fetchUserInfo('access-token');
      expect(info.sub).toBe('u1');
      expect(captured.url).toBe('https://api.linkedin.com/v2/userinfo');
      expect(captured.auth).toBe('Bearer access-token');
    });
  });

  describe('fetchPostableOrgs', () => {
    it('reads the `organization` field when present', async () => {
      const captured: { headers?: Record<string, string> } = {};
      mockFetchOnce(async (_url, init) => {
        captured.headers = init?.headers as Record<string, string>;
        return new Response(
          JSON.stringify({
            elements: [{ organization: 'urn:li:organization:111' }],
          }),
          { status: 200 },
        );
      });

      const orgs = await fetchPostableOrgs({ accessToken: 'at', apiVersion: '202604' });
      expect(orgs).toHaveLength(1);
      expect(orgs[0].orgUrn).toBe('urn:li:organization:111');
      expect(captured.headers?.['X-Restli-Protocol-Version']).toBe('2.0.0');
      expect(captured.headers?.['Linkedin-Version']).toBe('202604');
    });

    it('falls back to `organizationTarget` when `organization` is missing', async () => {
      mockFetchOnce(async () =>
        new Response(
          JSON.stringify({
            elements: [{ organizationTarget: 'urn:li:organization:222' }],
          }),
          { status: 200 },
        ),
      );

      const orgs = await fetchPostableOrgs({ accessToken: 'at', apiVersion: '202604' });
      expect(orgs).toHaveLength(1);
      expect(orgs[0].orgUrn).toBe('urn:li:organization:222');
    });

    it('skips elements missing both fields without throwing', async () => {
      mockFetchOnce(async () =>
        new Response(
          JSON.stringify({
            elements: [
              { organization: 'urn:li:organization:333' },
              { unrelated: true },
            ],
          }),
          { status: 200 },
        ),
      );

      const orgs = await fetchPostableOrgs({ accessToken: 'at', apiVersion: '202604' });
      expect(orgs).toHaveLength(1);
      expect(orgs[0].orgUrn).toBe('urn:li:organization:333');
    });

    it('throws LinkedInApiError on non-2xx', async () => {
      mockFetchOnce(async () => new Response('nope', { status: 401 }));
      await expect(
        fetchPostableOrgs({ accessToken: 'at', apiVersion: '202604' }),
      ).rejects.toBeInstanceOf(LinkedInApiError);
    });
  });
});
