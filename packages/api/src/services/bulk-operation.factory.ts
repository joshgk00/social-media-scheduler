import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { bulkOperations, type Db } from '@sms/db';
import type { JobName } from '@sms/shared';
import type { BulkOpsQueueService } from './bulk-ops-queue.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BulkOperationTargetKind = 'profile' | 'queue' | 'scheduled-list';

export class InvalidIdempotencyKeyError extends Error {
  constructor() {
    super('Invalid Idempotency-Key header');
    this.name = 'InvalidIdempotencyKeyError';
  }
}

export interface StartBulkOperationArgs {
  userId: string;
  idempotencyKey: string | undefined;
  operationType: JobName;
  targetKind: BulkOperationTargetKind;
  targetId: string | null;
  payload?: Record<string, unknown>;
  params: Record<string, unknown>;
  correlationId?: string;
}

export interface StartBulkOperationResult {
  bulkOperationId: string;
  jobId: string | null;
  replay: boolean;
}

export interface BulkOperationFactory {
  findExistingBulkOperation(args: Pick<StartBulkOperationArgs, 'userId' | 'idempotencyKey'>): Promise<StartBulkOperationResult | null>;
  startBulkOperation(args: StartBulkOperationArgs): Promise<StartBulkOperationResult>;
}

function parseClientIdempotencyKey(rawHeader: string | undefined): string | null {
  if (rawHeader === undefined) return null;
  const idempotencyKey = rawHeader.trim();
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new InvalidIdempotencyKeyError();
  }
  return idempotencyKey;
}

function parseOrGenerateIdempotencyKey(rawHeader: string | undefined): string {
  return parseClientIdempotencyKey(rawHeader) ?? randomUUID();
}

export function createBulkOperationFactory(
  db: Db,
  bulkOpsQueueService: BulkOpsQueueService,
): BulkOperationFactory {
  async function findExistingBulkOperationRow(userId: string, idempotencyKey: string) {
    const [existingBulkOperation] = await db
      .select({ id: bulkOperations.id })
      .from(bulkOperations)
      .where(and(
        eq(bulkOperations.userId, userId),
        eq(bulkOperations.idempotencyKey, idempotencyKey),
      ));

    return existingBulkOperation ?? null;
  }

  return {
    async findExistingBulkOperation(args): Promise<StartBulkOperationResult | null> {
      const idempotencyKey = parseClientIdempotencyKey(args.idempotencyKey);
      if (!idempotencyKey) return null;

      const existingBulkOperation = await findExistingBulkOperationRow(args.userId, idempotencyKey);
      if (!existingBulkOperation) return null;

      return {
        bulkOperationId: existingBulkOperation.id,
        jobId: null,
        replay: true,
      };
    },

    async startBulkOperation(args): Promise<StartBulkOperationResult> {
      const idempotencyKey = parseOrGenerateIdempotencyKey(args.idempotencyKey);

      const existingBulkOperation = await findExistingBulkOperationRow(args.userId, idempotencyKey);
      if (existingBulkOperation) {
        return {
          bulkOperationId: existingBulkOperation.id,
          jobId: null,
          replay: true,
        };
      }

      const [bulkOperation] = await db
        .insert(bulkOperations)
        .values({
          userId: args.userId,
          operationType: args.operationType,
          targetKind: args.targetKind,
          targetId: args.targetId,
          idempotencyKey,
          payload: args.payload ?? args.params,
        })
        .onConflictDoNothing({
          target: [bulkOperations.userId, bulkOperations.idempotencyKey],
          where: sql`${bulkOperations.idempotencyKey} is not null`,
        })
        .returning();

      if (!bulkOperation) {
        const conflictedBulkOperation = await findExistingBulkOperationRow(args.userId, idempotencyKey);
        if (conflictedBulkOperation) {
          return {
            bulkOperationId: conflictedBulkOperation.id,
            jobId: null,
            replay: true,
          };
        }
        throw new Error('Bulk operation insert conflict could not be reloaded');
      }

      let job;
      try {
        job = await bulkOpsQueueService.enqueueBulkOp(
          args.operationType,
          {
            bulkOperationId: bulkOperation.id,
            userId: args.userId,
            operationType: args.operationType,
            targetKind: args.targetKind,
            targetId: args.targetId,
            idempotencyKey,
            params: args.params,
            correlationId: args.correlationId ?? randomUUID(),
          },
          Math.floor(Date.now() / 1000),
        );
      } catch (err) {
        await db.delete(bulkOperations).where(eq(bulkOperations.id, bulkOperation.id));
        throw err;
      }

      return {
        bulkOperationId: bulkOperation.id,
        jobId: job.id ?? null,
        replay: false,
      };
    },
  };
}
