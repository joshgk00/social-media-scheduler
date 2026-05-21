import { describe, expect, it, vi } from 'vitest';
import { JOB_NAMES } from '@sms/shared';
import {
  createBulkOperationFactory,
  InvalidIdempotencyKeyError,
  type StartBulkOperationArgs,
} from '../bulk-operation.factory.js';

const userId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const targetId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const idempotencyKey = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const bulkOperationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const correlationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const baseArgs: StartBulkOperationArgs = {
  userId,
  idempotencyKey,
  type: JOB_NAMES.bulkQueueRandomize,
  targetKind: 'queue',
  targetId,
  params: { mode: 'shuffle' },
  jobName: JOB_NAMES.bulkQueueRandomize,
  correlationId,
};

function selectChain(rows: Array<{ id: string }>) {
  const chain: Record<string, any> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockResolvedValue(rows);
  return chain;
}

function insertChain(row: { id: string }, calls: string[]) {
  const chain: Record<string, any> = {};
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockImplementation(() => {
    calls.push('insert:returning');
    return Promise.resolve([row]);
  });
  return chain;
}

function createDb(args: {
  existingRows?: Array<{ id: string }>;
  insertedRow?: { id: string };
  calls?: string[];
}) {
  return {
    select: vi.fn().mockReturnValue(selectChain(args.existingRows ?? [])),
    insert: vi.fn().mockReturnValue(insertChain(args.insertedRow ?? { id: bulkOperationId }, args.calls ?? [])),
    transaction: vi.fn(),
  };
}

function createQueueService(args?: {
  jobId?: string;
  reject?: Error;
  calls?: string[];
}) {
  return {
    bulkOpsQueue: {} as never,
    enqueueBulkOp: vi.fn().mockImplementation(() => {
      args?.calls?.push('enqueue');
      if (args?.reject) {
        return Promise.reject(args.reject);
      }
      return Promise.resolve({ id: args?.jobId ?? 'job-1' });
    }),
  };
}

describe('createBulkOperationFactory', () => {
  it('creates a bulk operation row and enqueues the job', async () => {
    const db = createDb({});
    const queueService = createQueueService({ jobId: 'job-123' });
    const factory = createBulkOperationFactory(db as never, queueService);

    await expect(factory.startBulkOperation(baseArgs)).resolves.toEqual({
      bulkOperationId,
      jobId: 'job-123',
      replay: false,
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert.mock.results[0]?.value.values).toHaveBeenCalledWith({
      userId,
      operationType: JOB_NAMES.bulkQueueRandomize,
      targetKind: 'queue',
      targetId,
      idempotencyKey,
      payload: { mode: 'shuffle' },
    });
    expect(queueService.enqueueBulkOp).toHaveBeenCalledWith(
      JOB_NAMES.bulkQueueRandomize,
      {
        bulkOperationId,
        userId,
        operationType: JOB_NAMES.bulkQueueRandomize,
        targetKind: 'queue',
        targetId,
        idempotencyKey,
        params: { mode: 'shuffle' },
        correlationId,
      },
      expect.any(Number),
    );
  });

  it('generates an idempotency key when the header is absent', async () => {
    const db = createDb({});
    const queueService = createQueueService();
    const factory = createBulkOperationFactory(db as never, queueService);

    await factory.startBulkOperation({ ...baseArgs, idempotencyKey: undefined });

    const values = db.insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(values.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(queueService.enqueueBulkOp.mock.calls[0]?.[1].idempotencyKey).toBe(values.idempotencyKey);
  });

  it('returns replay metadata for an existing idempotency key', async () => {
    const db = createDb({ existingRows: [{ id: bulkOperationId }] });
    const queueService = createQueueService();
    const factory = createBulkOperationFactory(db as never, queueService);

    await expect(factory.startBulkOperation(baseArgs)).resolves.toEqual({
      bulkOperationId,
      jobId: null,
      replay: true,
    });
    expect(db.insert).not.toHaveBeenCalled();
    expect(queueService.enqueueBulkOp).not.toHaveBeenCalled();
  });

  it('rejects invalid idempotency keys before touching storage', async () => {
    const db = createDb({});
    const queueService = createQueueService();
    const factory = createBulkOperationFactory(db as never, queueService);

    await expect(factory.startBulkOperation({ ...baseArgs, idempotencyKey: 'not-a-uuid' }))
      .rejects
      .toBeInstanceOf(InvalidIdempotencyKeyError);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(queueService.enqueueBulkOp).not.toHaveBeenCalled();
  });

  it('preserves existing insert-before-enqueue semantics when enqueue fails', async () => {
    const calls: string[] = [];
    const db = createDb({ calls });
    const queueError = new Error('queue unavailable');
    const queueService = createQueueService({ reject: queueError, calls });
    const factory = createBulkOperationFactory(db as never, queueService);

    await expect(factory.startBulkOperation(baseArgs)).rejects.toThrow(queueError);

    expect(calls).toEqual(['insert:returning', 'enqueue']);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
