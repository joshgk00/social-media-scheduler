import { describe, expect, it } from 'vitest';
import {
  bulkOperationStatusEnum,
  bulkOperationTargetKindEnum,
  bulkOperations,
} from '../../schema/bulk-operations.js';

describe('bulk_operations schema', () => {
  it('defines the required audit columns', () => {
    expect(bulkOperations.id).toBeDefined();
    expect(bulkOperations.userId).toBeDefined();
    expect(bulkOperations.operationType).toBeDefined();
    expect(bulkOperations.targetKind).toBeDefined();
    expect(bulkOperations.targetId).toBeDefined();
    expect(bulkOperations.status).toBeDefined();
    expect(bulkOperations.successCount).toBeDefined();
    expect(bulkOperations.failureCount).toBeDefined();
    expect(bulkOperations.errorReportPath).toBeDefined();
    expect(bulkOperations.idempotencyKey).toBeDefined();
    expect(bulkOperations.payload).toBeDefined();
    expect(bulkOperations.errorMessage).toBeDefined();
    expect(bulkOperations.createdAt).toBeDefined();
    expect(bulkOperations.startedAt).toBeDefined();
    expect(bulkOperations.completedAt).toBeDefined();
  });

  it('defines the expected status enum values', () => {
    expect(bulkOperationStatusEnum.enumValues).toEqual([
      'queued',
      'running',
      'succeeded',
      'partial',
      'failed',
    ]);
  });

  it('defines the expected target-kind enum values', () => {
    expect(bulkOperationTargetKindEnum.enumValues).toEqual([
      'profile',
      'queue',
      'scheduled-list',
    ]);
  });
});
