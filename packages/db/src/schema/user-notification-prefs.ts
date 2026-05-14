import { pgTable, uuid, text, boolean, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const userNotificationPrefs = pgTable(
  'user_notification_prefs',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    inAppEnabled: boolean('in_app_enabled').notNull().default(true),
    emailEnabled: boolean('email_enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.eventType] }),
  }),
);

export type UserNotificationPref = typeof userNotificationPrefs.$inferSelect;
export type NewUserNotificationPref = typeof userNotificationPrefs.$inferInsert;
