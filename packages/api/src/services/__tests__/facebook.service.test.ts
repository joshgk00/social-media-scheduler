import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  exchangeShortLivedToken,
  fetchUserPages,
  pingPageToken,
  FacebookApiError,
} from '../facebook.service.js';

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

function mockFetchOnce(handler: FetchHandler) {
  // @ts-expect-error — override only for this test
  global.fetch = vi.fn().mockImplementation(handler);
}

describe('facebook.service', () => {
  beforeEach(() => {
    process.env.FACEBOOK_GRAPH_VERSION = 'v25.0';
  });

  afterEach(() => {
    delete (global as Record<string, unknown>).fetch;
    delete process.env.FACEBOOK_GRAPH_VERSION;
  });

  describe('buildAuthorizeUrl', () => {
    it('builds the Facebook dialog URL with scope and state', async () => {
      const url = await buildAuthorizeUrl({
        state: 'abc',
        appId: 'app-1',
        redirectUri: 'https://ex.com/cb',
        scope: 'pages_show_list,pages_read_engagement,pages_manage_posts',
      });

      expect(url.startsWith('https://www.facebook.com/v25.0/dialog/oauth?')).toBe(true);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('client_id')).toBe('app-1');
      expect(parsed.searchParams.get('state')).toBe('abc');
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('scope')).toBe(
        'pages_show_list,pages_read_engagement,pages_manage_posts',
      );
    });
  });

  describe('exchangeAuthorizationCode', () => {
    it('GETs the token endpoint and returns shortLivedToken', async () => {
      mockFetchOnce(async (url) => {
        expect(url).toContain('graph.facebook.com/v25.0/oauth/access_token');
        expect(url).toContain('code=abc');
        return new Response(
          JSON.stringify({ access_token: 'short-token', expires_in: 3600 }),
          { status: 200 },
        );
      });

      const result = await exchangeAuthorizationCode({
        code: 'abc',
        appId: 'a',
        appSecret: 's',
        redirectUri: 'https://ex.com/cb',
        graphVersion: 'v25.0',
      });

      expect(result.shortLivedToken).toBe('short-token');
      expect(result.expiresIn).toBe(3600);
    });

    it('throws FacebookApiError on 400', async () => {
      mockFetchOnce(async () =>
        new Response(
          JSON.stringify({ error: { message: 'bad code', code: 100 } }),
          { status: 400 },
        ),
      );
      await expect(
        exchangeAuthorizationCode({
          code: 'bad',
          appId: 'a',
          appSecret: 's',
          redirectUri: 'https://ex.com/cb',
          graphVersion: 'v25.0',
        }),
      ).rejects.toBeInstanceOf(FacebookApiError);
    });
  });

  describe('exchangeShortLivedToken', () => {
    it('returns longLivedUserToken on success', async () => {
      mockFetchOnce(async (url) => {
        expect(url).toContain('grant_type=fb_exchange_token');
        return new Response(
          JSON.stringify({ access_token: 'long-token', expires_in: 5184000 }),
          { status: 200 },
        );
      });

      const result = await exchangeShortLivedToken({
        shortLivedToken: 'short',
        appId: 'a',
        appSecret: 's',
        graphVersion: 'v25.0',
      });

      expect(result.longLivedUserToken).toBe('long-token');
      expect(result.expiresIn).toBe(5184000);
    });

    it('throws FacebookApiError on 400', async () => {
      mockFetchOnce(async () => new Response('{"error":{"code":190}}', { status: 400 }));
      await expect(
        exchangeShortLivedToken({
          shortLivedToken: 'bad',
          appId: 'a',
          appSecret: 's',
          graphVersion: 'v25.0',
        }),
      ).rejects.toBeInstanceOf(FacebookApiError);
    });
  });

  describe('fetchUserPages', () => {
    it('filters to pages that include CREATE_CONTENT task', async () => {
      mockFetchOnce(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'page-1',
                name: 'Page One',
                access_token: 'page-1-token',
                tasks: ['CREATE_CONTENT', 'MANAGE'],
              },
              {
                id: 'page-2',
                name: 'Page Two',
                access_token: 'page-2-token',
                tasks: ['MODERATE'],
              },
            ],
          }),
          { status: 200 },
        ),
      );

      const pages = await fetchUserPages({
        longLivedUserToken: 'long',
        graphVersion: 'v25.0',
      });

      expect(pages).toHaveLength(1);
      expect(pages[0].id).toBe('page-1');
    });

    it('returns an empty list when the user has no qualifying pages', async () => {
      mockFetchOnce(async () =>
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );

      const pages = await fetchUserPages({
        longLivedUserToken: 'long',
        graphVersion: 'v25.0',
      });
      expect(pages).toEqual([]);
    });
  });

  describe('pingPageToken', () => {
    it('returns {ok: true} on 200', async () => {
      mockFetchOnce(async () =>
        new Response(JSON.stringify({ id: 'page-1' }), { status: 200 }),
      );

      const result = await pingPageToken({ pageToken: 'tkn', graphVersion: 'v25.0' });
      expect(result).toEqual({ ok: true });
    });

    it('returns {ok: false, errorCode: 190} on 401 and does not throw', async () => {
      mockFetchOnce(async () =>
        new Response(
          JSON.stringify({ error: { code: 190, message: 'expired' } }),
          { status: 401 },
        ),
      );

      const result = await pingPageToken({ pageToken: 'tkn', graphVersion: 'v25.0' });
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe(190);
    });
  });
});
