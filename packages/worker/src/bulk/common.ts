import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { bulkOperations } from '@sms/db';
import type { WorkerDb } from '../db.js';

export interface BulkJobContext {
  db: WorkerDb;
  publishQueue: Queue;
  bulkOpsQueue: Queue;
  notificationQueue: Queue;
  storageRoot: string;
  appBaseUrl: string;
}

export interface BulkJobData {
  bulkOperationId: string;
  userId: string;
  operationType: string;
  targetKind: 'profile' | 'queue' | 'scheduled-list';
  targetId: string | null;
  idempotencyKey: string;
  data: Record<string, unknown>;
  correlationId: string;
}

export interface BulkJobResult {
  status: 'succeeded' | 'partial' | 'failed';
  successCount: number;
  failureCount: number;
  errorReportPath?: string | null;
}

export function selectedPostIds(jobParams: Record<string, unknown>): string[] {
  return Array.isArray(jobParams.postIds)
    ? jobParams.postIds.filter((postId): postId is string => typeof postId === 'string')
    : [];
}

export async function markBulkOperationRunning(
  db: WorkerDb,
  bulkOperationId: string,
): Promise<void> {
  await db
    .update(bulkOperations)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(bulkOperations.id, bulkOperationId));
}

export async function markBulkOperationFinished(
  db: WorkerDb,
  bulkOperationId: string,
  result: BulkJobResult,
): Promise<void> {
  const completedAt = new Date();
  await db
    .update(bulkOperations)
    .set({
      status: result.status,
      successCount: result.successCount,
      failureCount: result.failureCount,
      errorReportPath: result.errorReportPath ?? null,
      payload: { redacted: true, completedAt: completedAt.toISOString() },
      completedAt,
    })
    .where(eq(bulkOperations.id, bulkOperationId));
}

export async function markBulkOperationFailed(
  db: WorkerDb,
  bulkOperationId: string,
  err: unknown,
): Promise<void> {
  const completedAt = new Date();
  await db
    .update(bulkOperations)
    .set({
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
      payload: { redacted: true, failedAt: completedAt.toISOString() },
      completedAt,
    })
    .where(eq(bulkOperations.id, bulkOperationId));
}
