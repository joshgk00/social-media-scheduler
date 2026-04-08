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
    quit: vi.fn().mockResolvedValue('OK'),
    scanStream,
    on: vi.fn(),
    ...overrides,
  } as any;
}
