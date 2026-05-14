import { pgTable, pgEnum, uuid, text, varchar, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const bulkOperationStatusEnum = pgEnum('bulk_operation_status', [
  'queued',
  'running',
  'succeeded',
  'partial',
  'failed',
]);

export const bulkOperationTargetKindEnum = pgEnum('bulk_operation_target_kind', [
  'profile',
  'queue',
  'scheduled-list',
]);

export const bulkOperations = pgTable(
  'bulk_operations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    operationType: varchar('operation_type', { length: 64 }).notNull(),
    targetKind: bulkOperationTargetKindEnum('target_kind').notNull(),
    targetId: uuid('target_id'),
    status: bulkOperationStatusEnum('status').notNull().default('queued'),
    successCount: integer('success_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    errorReportPath: text('error_report_path'),
    idempotencyKey: uuid('idempotency_key'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('bulk_operations_user_status_idx').on(table.userId, table.status),
    index('bulk_operations_user_created_idx').on(table.userId, table.createdAt.desc()),
    index('bulk_operations_idempotency_idx').on(table.idempotencyKey),
  ],
);

export type BulkOperation = typeof bulkOperations.$inferSelect;
export type NewBulkOperation = typeof bulkOperations.$inferInsert;
