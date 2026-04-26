import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  createOAuthState,
  consumeOAuthState,
  createPendingSelection,
  consumePendingSelection,
  peekPendingSelection,
  validateReturnTo,
  OAuthServiceError,
  type OAuthStatePayload,
  type PendingSelectionPayload,
} from '../oauth.service.js';

// Minimal Redis stub that tracks SET arguments and supports atomic GET+DEL
// pipelines. Using a hand-rolled stub avoids adding an ioredis-mock dev
// dependency just for this test — the service only needs a narrow surface.
interface StubRedis {
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  multi: ReturnType<typeof vi.fn>;
}

function createStubRedis(): StubRedis {
  const store = new Map<string, string>();
  const stub: StubRedis = {
    set: vi.fn().mockImplementation(async (key: string, value: string, _mode: string, _ttl: number) => {
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn().mockImplementation(async (key: string) => {
      return store.get(key) ?? null;
    }),
    del: vi.fn().mockImplementation(async (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }),
    multi: vi.fn().mockImplementation(() => {
      let getResult: string | null = null;
      let delKey: string | null = null;
      let getKey: string | null = null;
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
          if (getKey) getResult = store.get(getKey) ?? null;
          if (delKey) store.delete(delKey);
          // ioredis exec returns [[err, reply], ...]
          return [[null, getResult], [null, delKey && getResult ? 1 : 0]];
        }),
      };
      return chain;
    }),
  };
  return stub;
}

const baseStatePayload: OAuthStatePayload = {
  userId: '11111111-1111-1111-1111-111111111111',
  platform: 'linkedin',
  scope: 'openid profile email w_member_social',
  returnTo: '/profiles',
  reconnectProfileId: null,
};

const basePendingPayload: PendingSelectionPayload = {
  userId: '11111111-1111-1111-1111-111111111111',
  platform: 'linkedin',
  platformUserId: 'urn:li:person:abc',
  displayName: 'Jane Doe',
  handle: 'jane-doe',
  userToken: 'plaintext-access-token',
  refreshToken: 'plaintext-refresh-token',
  refreshTokenExpiresInSeconds: 31_536_000,
  tokenExpiresInSeconds: 5184000,
  accounts: [
    { platformAccountId: 'urn:li:organization:42', name: 'Acme Org' },
  ],
};

describe('oauth.service', () => {
  let redis: ReturnType<typeof createStubRedis>;

  beforeEach(() => {
    redis = createStubRedis();
  });

  describe('createOAuthState', () => {
    it('stores the payload with 600s TTL and returns a base64url nonce', async () => {
      const nonce = await createOAuthState(redis as unknown as import('ioredis').Redis, baseStatePayload);
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThanOrEqual(43);
      // base64url charset
      expect(/^[A-Za-z0-9_-]+$/.test(nonce)).toBe(true);

      expect(redis.set).toHaveBeenCalledTimes(1);
      const [key, value, mode, ttl] = redis.set.mock.calls[0];
      expect(key).toBe(`oauth:state:${nonce}`);
      expect(JSON.parse(value as string)).toEqual(baseStatePayload);
      expect(mode).toBe('EX');
      expect(ttl).toBe(600);
    });
  });

  describe('consumeOAuthState', () => {
    it('returns the payload on the first call (atomic GET+DEL)', async () => {
      const nonce = await createOAuthState(redis as unknown as import('ioredis').Redis, baseStatePayload);
      const payload = await consumeOAuthState(redis as unknown as import('ioredis').Redis, nonce);
      expect(payload).toEqual(baseStatePayload);
      expect(redis.multi).toHaveBeenCalled();
    });

    it('returns null on replay (second consume)', async () => {
      const nonce = await createOAuthState(redis as unknown as import('ioredis').Redis, baseStatePayload);
      await consumeOAuthState(redis as unknown as import('ioredis').Redis, nonce);
      const second = await consumeOAuthState(redis as unknown as import('ioredis').Redis, nonce);
      expect(second).toBeNull();
    });

    it('returns null when nonce does not exist', async () => {
      const result = await consumeOAuthState(redis as unknown as import('ioredis').Redis, 'does-not-exist');
      expect(result).toBeNull();
    });
  });

  describe('createPendingSelection', () => {
    it('stores payload with 600s TTL and returns a tempToken distinct from the nonce', async () => {
      const token = await createPendingSelection(redis as unknown as import('ioredis').Redis, basePendingPayload);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThanOrEqual(43);

      const [key, _value, mode, ttl] = redis.set.mock.calls[0];
      expect(key).toBe(`oauth:pending:${token}`);
      expect(mode).toBe('EX');
      // PENDING_TTL_SECONDS = 10 * 60 — aligned with STATE_TTL so the pending
      // selection cannot outlive the state nonce that produced it.
      expect(ttl).toBe(600);
    });
  });

  describe('peekPendingSelection', () => {
    it('returns payload without deleting', async () => {
      const token = await createPendingSelection(redis as unknown as import('ioredis').Redis, basePendingPayload);
      const peeked = await peekPendingSelection(redis as unknown as import('ioredis').Redis, token);
      expect(peeked).toEqual(basePendingPayload);
      // peek used get, not multi
      expect(redis.multi).not.toHaveBeenCalled();
      // Second peek should still return the payload
      const second = await peekPendingSelection(redis as unknown as import('ioredis').Redis, token);
      expect(second).toEqual(basePendingPayload);
    });

    it('returns null when tempToken missing', async () => {
      const peeked = await peekPendingSelection(redis as unknown as import('ioredis').Redis, 'missing-token');
      expect(peeked).toBeNull();
    });
  });

  describe('consumePendingSelection', () => {
    it('returns payload then deletes (atomic)', async () => {
      const token = await createPendingSelection(redis as unknown as import('ioredis').Redis, basePendingPayload);
      const consumed = await consumePendingSelection(redis as unknown as import('ioredis').Redis, token);
      expect(consumed).toEqual(basePendingPayload);
      const replay = await consumePendingSelection(redis as unknown as import('ioredis').Redis, token);
      expect(replay).toBeNull();
    });
  });

  describe('validateReturnTo', () => {
    it('defaults to /profiles when undefined', () => {
      expect(validateReturnTo(undefined)).toBe('/profiles');
    });

    it('defaults to /profiles when empty', () => {
      expect(validateReturnTo('')).toBe('/profiles');
    });

    it('accepts a simple relative path', () => {
      expect(validateReturnTo('/profiles')).toBe('/profiles');
    });

    it('accepts a relative path with query string', () => {
      expect(validateReturnTo('/profiles?x=1')).toBe('/profiles?x=1');
    });

    it('rejects absolute http URLs', () => {
      expect(() => validateReturnTo('https://evil.com')).toThrow(OAuthServiceError);
      try {
        validateReturnTo('https://evil.com');
      } catch (err) {
        expect(err).toBeInstanceOf(OAuthServiceError);
        expect((err as OAuthServiceError).statusCode).toBe(400);
      }
    });

    it('rejects protocol-relative URLs', () => {
      expect(() => validateReturnTo('//evil.com/path')).toThrow(OAuthServiceError);
    });

    it('rejects values with ://', () => {
      expect(() => validateReturnTo('/something://evil')).toThrow(OAuthServiceError);
    });

    it('rejects paths containing disallowed characters', () => {
      // Backslash is not in the allowlist
      expect(() => validateReturnTo('/profiles\\evil')).toThrow(OAuthServiceError);
    });
  });
});
