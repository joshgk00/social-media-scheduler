import { z } from 'zod';

export const bulkOperationStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'partial',
  'failed',
]);

export const bulkOperationTargetKindSchema = z.enum([
  'profile',
  'queue',
  'scheduled-list',
]);

export type BulkOperationStatus = z.infer<typeof bulkOperationStatusSchema>;
export type BulkOperationTargetKind = z.infer<typeof bulkOperationTargetKindSchema>;

export interface BulkOperationRow {
  id: string;
  userId: string;
  operationType: string;
  targetKind: BulkOperationTargetKind;
  targetId: string | null;
  status: BulkOperationStatus;
  successCount: number;
  failureCount: number;
  errorReportPath: string | null;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}
