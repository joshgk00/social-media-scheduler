import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bulkCompletedNotificationSchema,
  bulkJobPayloadSchema,
  bulkDeleteInputSchema,
  bulkImportRequestSchema,
  bulkModifyTagsInputSchema,
  bulkOperationStatusSchema,
  bulkPauseInputSchema,
  bulkResumeInputSchema,
  csvQueueRowSchema,
  csvScheduledRowSchema,
  queueCopyInputSchema,
  queueDedupeInputSchema,
  queuePurgeInputSchema,
  queueRandomizeInputSchema,
  queueTextModifyInputSchema,
} from '../../index.js';

const uuid = '00000000-0000-4000-8000-000000000001';

function readCsvRows(path: string): Record<string, string>[] {
  const [headerLine = '', ...dataLines] = readFileSync(resolve('..', '..', path), 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  const headers = headerLine.split(',');

  return dataLines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

describe('bulk CSV schemas', () => {
  it('parses valid scheduled rows from the Wave 0 fixture', () => {
    const rows = readCsvRows('packages/api/src/__tests__/fixtures/bulk-csv/scheduled-posts-valid.csv');
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => csvScheduledRowSchema.safeParse(row).success)).toBe(true);
  });

  it('rejects the three invalid mixed scheduled rows', () => {
    const rows = readCsvRows('packages/api/src/__tests__/fixtures/bulk-csv/scheduled-posts-mixed.csv');
    const failures = rows.filter((row) => !csvScheduledRowSchema.safeParse(row).success);
    expect(failures).toHaveLength(3);
  });

  it('parses valid queue rows from the Wave 0 fixture', () => {
    const rows = readCsvRows('packages/api/src/__tests__/fixtures/bulk-csv/queue-posts-valid.csv');
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => csvQueueRowSchema.safeParse(row).success)).toBe(true);
  });

  it('requires queueId when target is queue', () => {
    expect(bulkImportRequestSchema.safeParse({ target: 'queue', profileId: uuid }).success).toBe(false);
  });
});

describe('bulk operation schemas', () => {
  it('validates bulk pause and resume inputs with a selector', () => {
    const payload = { profileId: uuid, scope: 'both', postIds: [uuid] };
    expect(bulkPauseInputSchema.safeParse(payload).success).toBe(true);
    expect(bulkResumeInputSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects bulk delete bodies that have neither postIds nor filter', () => {
    expect(bulkDeleteInputSchema.safeParse({ typedConfirmation: 'DELETE 0 POSTS' }).success).toBe(false);
    expect(bulkDeleteInputSchema.safeParse({ typedConfirmation: 'DELETE 0 POSTS', postIds: [], filter: {} }).success).toBe(false);
    expect(bulkDeleteInputSchema.safeParse({ typedConfirmation: 'DELETE 0 POSTS', filter: { page: 1, limit: 25 } }).success).toBe(false);
    expect(bulkDeleteInputSchema.safeParse({ typedConfirmation: 'DELETE 1 POSTS', filter: { tagId: uuid } }).success).toBe(true);
  });

  it('validates bulk modify tags inputs with mode and tagIds', () => {
    expect(bulkModifyTagsInputSchema.safeParse({ postIds: [uuid], mode: 'add', tagIds: [uuid] }).success).toBe(true);
  });

  it('validates queue randomize and dedupe empty objects strictly', () => {
    expect(queueRandomizeInputSchema.safeParse({}).success).toBe(true);
    expect(queueDedupeInputSchema.safeParse({}).success).toBe(true);
    expect(queueRandomizeInputSchema.safeParse({ extra: true }).success).toBe(false);
  });

  it('validates queue purge typed confirmation', () => {
    expect(queuePurgeInputSchema.safeParse({ typedConfirmation: 'Main Queue' }).success).toBe(true);
  });

  it('validates queue copy target and randomize flag', () => {
    expect(queueCopyInputSchema.safeParse({ targetQueueId: uuid, randomizeAfter: true }).success).toBe(true);
  });

  it('uses a discriminated union for queue text modify modes', () => {
    expect(queueTextModifyInputSchema.safeParse({ mode: 'append', text: '#tag' }).success).toBe(true);
    expect(queueTextModifyInputSchema.safeParse({ mode: 'remove', text: '#tag' }).success).toBe(true);
    expect(queueTextModifyInputSchema.safeParse({ mode: 'replace', find: 'Spring', replace: 'Summer' }).success).toBe(true);
    expect(queueTextModifyInputSchema.safeParse({ mode: 'regex', text: '#tag' }).success).toBe(false);
  });

  it('caps queue text modify payload sizes', () => {
    expect(queueTextModifyInputSchema.safeParse({ mode: 'append', text: 'x'.repeat(1_001) }).success).toBe(false);
    expect(queueTextModifyInputSchema.safeParse({ mode: 'append', text: 'x', separator: 'x'.repeat(21) }).success).toBe(false);
    expect(queueTextModifyInputSchema.safeParse({ mode: 'replace', find: 'x'.repeat(1_001), replace: '' }).success).toBe(false);
    expect(queueTextModifyInputSchema.safeParse({ mode: 'replace', find: 'x', replace: 'x'.repeat(10_001) }).success).toBe(false);
  });

  it('exports bulk operation status schema', () => {
    expect(bulkOperationStatusSchema.parse('queued')).toBe('queued');
  });

  it('validates bulk completed notification payloads', () => {
    expect(
      bulkCompletedNotificationSchema.safeParse({
        eventType: 'bulk_completed',
        userId: uuid,
        bulkOperationId: uuid,
        operation: 'bulk.queue-randomize',
        successCount: 5,
        failureCount: 0,
        errorReportPath: null,
        correlationId: uuid,
      }).success,
    ).toBe(true);
  });

  it('validates the bulk job wire payload with params naming', () => {
    expect(
      bulkJobPayloadSchema.safeParse({
        bulkOperationId: uuid,
        userId: uuid,
        operationType: 'bulk.queue-randomize',
        targetKind: 'queue',
        targetId: uuid,
        idempotencyKey: uuid,
        params: {},
        correlationId: uuid,
      }).success,
    ).toBe(true);

    expect(
      bulkJobPayloadSchema.safeParse({
        bulkOperationId: uuid,
        userId: uuid,
        operationType: 'bulk.queue-randomize',
        targetKind: 'queue',
        targetId: uuid,
        idempotencyKey: uuid,
        data: {},
        correlationId: uuid,
      }).success,
    ).toBe(false);
  });
});
