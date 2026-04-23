import { vi } from 'vitest';

function chainable(terminal: unknown = []) {
  const chain: Record<string, any> = {};
  const methods = ['from', 'where', 'values', 'returning', 'set', 'limit'];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (val: unknown) => void) => resolve(terminal);
  return chain;
}

// Dedicated builder for db.update().set(...).where(...).returning() — tracks the set
// payload so .returning() resolves to [{ ...matchedRow, ...setPayload }], matching
// real postgres-js RETURNING behavior. Mirrors packages/worker/src/__tests__/helpers/mock-db.ts.
function updateChainable(matchedRow: Record<string, unknown> = { id: 'mock-updated-id' }) {
  const chain: Record<string, any> = {};
  let setPayload: Record<string, unknown> = {};

  chain.set = vi.fn().mockImplementation((patch: Record<string, unknown>) => {
    setPayload = patch;
    return chain;
  });
  chain.where = vi.fn().mockReturnValue(chain);
  chain.returning = vi
    .fn()
    .mockImplementation(() => Promise.resolve([{ ...matchedRow, ...setPayload }]));
  // Preserve no-returning path: `await db.update().set().where()` resolves to undefined.
  chain.then = (resolve: (val: unknown) => void) => resolve(undefined);
  return chain;
}

export function createMockDb() {
  const db: any = {
    select: vi.fn().mockReturnValue(chainable([])),
    insert: vi.fn().mockReturnValue(chainable([])),
    update: vi.fn().mockImplementation(() => updateChainable()),
    delete: vi.fn().mockReturnValue(chainable()),
    transaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(db)),
  };
  return db;
}
