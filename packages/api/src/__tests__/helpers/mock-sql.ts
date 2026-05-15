import { vi } from 'vitest';

export function createMockSql() {
  return Object.assign(
    (_strings: TemplateStringsArray) => Promise.resolve([{ '?column?': 1 }]),
    { end: vi.fn() },
  );
}
