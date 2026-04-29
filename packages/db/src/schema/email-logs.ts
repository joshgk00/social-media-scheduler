import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const emailLogs = pgTable(
  'email_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    recipientEmail: text('recipient_email').notNull(),
    subject: text('subject').notNull(),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    smtpMessageId: text('smtp_message_id'),
    correlationId: uuid('correlation_id').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('email_logs_user_sent_idx').on(table.userId, table.sentAt.desc()),
    index('email_logs_event_sent_idx').on(table.eventType, table.sentAt.desc()),
  ],
);

export type EmailLog = typeof emailLogs.$inferSelect;
export type NewEmailLog = typeof emailLogs.$inferInsert;
