import { vi } from 'vitest';

function chainable(terminal: unknown = []) {
  const chain: Record<string, any> = {};
  const methods = ['from', 'where', 'values', 'returning', 'set', 'limit'];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // Terminal resolution: make the chain thenable so `await db.select()...` works
  chain.then = (resolve: (val: unknown) => void) => resolve(terminal);
  return chain;
}

export function createMockDb() {
  return {
    select: vi.fn().mockReturnValue(chainable([])),
    insert: vi.fn().mockReturnValue(chainable([])),
    update: vi.fn().mockReturnValue(chainable()),
    delete: vi.fn().mockReturnValue(chainable()),
  } as any;
}
