// Chainable mock Drizzle client for worker unit tests. Supports both the
// `tx.execute(sql\`...\`)` path used for SELECT FOR UPDATE and the
// builder-style `tx.select().from().where()` / `tx.update().set().where()`
// chains used by the rest of the lifecycle service. Same philosophy as
// packages/api/src/__tests__/helpers/mock-db.ts — just tracks calls.

import { vi, type Mock } from 'vitest';

type QueryPlan = () => unknown;

export interface MockWorkerDb {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  transaction: Mock;
  execute: Mock;
  __executeQueue: QueryPlan[];
  __selectQueue: QueryPlan[];
  __pushExecute: (plan: QueryPlan) => void;
  __pushSelect: (plan: QueryPlan) => void;
  __insertedRows: unknown[];
  __updates: Array<{ set: Record<string, unknown>; where?: unknown }>;
}

function buildChain(terminal: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'from',
    'where',
    'values',
    'returning',
    'set',
    'limit',
    'innerJoin',
    'leftJoin',
    'orderBy',
    'groupBy',
    'having',
    'onConflictDoNothing',
    'onConflictDoUpdate',
  ];
  for (const method of methods) {
    (chain as Record<string, unknown>)[method] = vi.fn().mockReturnValue(chain);
  }
  (chain as unknown as { then: (resolve: (val: unknown) => void) => void }).then = (
    resolve,
  ) => resolve(terminal);
  return chain;
}

export function createMockWorkerDb(): MockWorkerDb {
  const executeQueue: QueryPlan[] = [];
  const selectQueue: QueryPlan[] = [];
  const insertedRows: unknown[] = [];
  const updates: Array<{ set: Record<string, unknown>; where?: unknown }> = [];

  const insertChain = () => {
    const values = vi.fn().mockImplementation((row: unknown) => {
      insertedRows.push(row);
      return Promise.resolve(undefined);
    });
    return { values };
  };

  const updateChain = () => {
    const result: Record<string, unknown> = {};
    const returningFn = vi.fn().mockResolvedValue([{ id: 'mock-updated-id' }]);
    const whereFn = vi.fn().mockImplementation(() => {
      // Return a thenable that also supports .returning()
      const whereResult = Promise.resolve(undefined) as Promise<undefined> & { returning: typeof returningFn };
      whereResult.returning = returningFn;
      return whereResult;
    });
    const setFn = vi.fn().mockImplementation((patch: Record<string, unknown>) => {
      updates.push({ set: patch });
      return { where: whereFn };
    });
    result.set = setFn;
    return result;
  };

  const db: MockWorkerDb = {
    select: vi.fn().mockImplementation(() => {
      const next = selectQueue.shift();
      const terminal = next ? next() : [];
      return buildChain(terminal);
    }),
    insert: vi.fn().mockImplementation(() => insertChain()),
    update: vi.fn().mockImplementation(() => updateChain()),
    delete: vi.fn().mockReturnValue(buildChain([])),
    transaction: vi.fn().mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) => {
      return handler(db);
    }),
    execute: vi.fn().mockImplementation(() => {
      const next = executeQueue.shift();
      return Promise.resolve(next ? next() : []);
    }),
    __executeQueue: executeQueue,
    __selectQueue: selectQueue,
    __pushExecute: (plan: QueryPlan) => {
      executeQueue.push(plan);
    },
    __pushSelect: (plan: QueryPlan) => {
      selectQueue.push(plan);
    },
    __insertedRows: insertedRows,
    __updates: updates,
  };

  return db;
}
