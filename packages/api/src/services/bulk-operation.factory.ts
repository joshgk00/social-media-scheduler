import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { bulkOperations, type Db } from '@sms/db';
import type { JobName } from '@sms/shared';
import type { BulkOpsQueueService } from './bulk-ops-queue.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  type: string;
  targetKind: BulkOperationTargetKind;
  targetId: string | null;
  params: Record<string, unknown>;
  jobName: JobName;
  correlationId?: string;
}

export interface StartBulkOperationResult {
  bulkOperationId: string;
  jobId: string | null;
  replay: boolean;
}

export interface BulkOperationFactory {
  startBulkOperation(args: StartBulkOperationArgs): Promise<StartBulkOperationResult>;
}

function parseIdempotencyKey(rawHeader: string | undefined): string {
  if (rawHeader === undefined) return randomUUID();
  const idempotencyKey = rawHeader.trim();
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new InvalidIdempotencyKeyError();
  }
  return idempotencyKey;
}

export function createBulkOperationFactory(
  db: Db,
  bulkOpsQueueService: BulkOpsQueueService,
): BulkOperationFactory {
  return {
    async startBulkOperation(args): Promise<StartBulkOperationResult> {
      const idempotencyKey = parseIdempotencyKey(args.idempotencyKey);

      const [existingBulkOperation] = await db
        .select({ id: bulkOperations.id })
        .from(bulkOperations)
        .where(and(
          eq(bulkOperations.userId, args.userId),
          eq(bulkOperations.idempotencyKey, idempotencyKey),
        ));
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
          operationType: args.type,
          targetKind: args.targetKind,
          targetId: args.targetId,
          idempotencyKey,
          payload: args.params,
        })
        .returning();

      const job = await bulkOpsQueueService.enqueueBulkOp(
        args.jobName,
        {
          bulkOperationId: bulkOperation.id,
          userId: args.userId,
          operationType: args.type,
          targetKind: args.targetKind,
          targetId: args.targetId,
          idempotencyKey,
          params: args.params,
          correlationId: args.correlationId ?? randomUUID(),
        },
        Math.floor(Date.now() / 1000),
      );

      return {
        bulkOperationId: bulkOperation.id,
        jobId: job.id ?? null,
        replay: false,
      };
    },
  };
}
