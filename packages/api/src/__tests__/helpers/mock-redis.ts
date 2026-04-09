import { vi } from 'vitest';

export function createMockRedis(overrides: Record<string, unknown> = {}) {
  const store = new Map<string, string>();

  const scanStream = vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      yield [];
    },
  });

  return {
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve(store.get(key) ?? null);
    }),
    set: vi.fn().mockImplementation((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: vi.fn().mockImplementation((...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) count++;
      }
      return Promise.resolve(count);
    }),
    // connect-redis 9 calls touch -> adapter.expire on every response when
    // express-session is configured with rolling: true. The mock doesn't
    // track TTLs, so match ioredis' return contract: 1 if key exists, 0 if not.
    expire: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve(store.has(key) ? 1 : 0);
    }),
    // ioredis scan: [cursor, keys]. Mock returns everything in one pass.
    scan: vi.fn().mockImplementation((_cursor: string, ..._args: unknown[]) => {
      const matchIndex = _args.indexOf('MATCH');
      const pattern = matchIndex >= 0 ? String(_args[matchIndex + 1]) : '*';
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      const keys = Array.from(store.keys()).filter((key) => regex.test(key));
      return Promise.resolve(['0', keys]);
    }),
    mget: vi.fn().mockImplementation((...keys: string[]) => {
      return Promise.resolve(keys.map((key) => store.get(key) ?? null));
    }),
    quit: vi.fn().mockResolvedValue('OK'),
    scanStream,
    on: vi.fn(),
    ...overrides,
  } as any;
}
