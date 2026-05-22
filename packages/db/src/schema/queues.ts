import { pgTable, uuid, text, varchar, timestamp, boolean, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { socialProfiles } from './social-profiles.js';

export const queues = pgTable('queues', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => socialProfiles.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  scheduleMode: varchar('schedule_mode', { length: 16 }).notNull().default('fixed'),
  intervalType: varchar('interval_type', { length: 10 }).notNull().default('fixed'),
  intervalValue: integer('interval_value').notNull().default(4),
  intervalUnit: varchar('interval_unit', { length: 10 }).notNull().default('hours'),
  daysOfWeek: jsonb('days_of_week').notNull().default([0, 1, 2, 3, 4, 5, 6]),
  hourSlots: jsonb('hour_slots').notNull().default([9, 12, 15, 18]),
  seasonalStart: varchar('seasonal_start', { length: 5 }),
  seasonalEnd: varchar('seasonal_end', { length: 5 }),
  seasonalRepeat: boolean('seasonal_repeat').notNull().default(false),
  isRecycling: boolean('is_recycling').notNull().default(false),
  isPaused: boolean('is_paused').notNull().default(false),
  cursorPosition: integer('cursor_position').notNull().default(0),
  startDate: timestamp('start_date', { withTimezone: true }),
  lastPublishedAt: timestamp('last_published_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('queues_user_id').on(table.userId),
  index('queues_profile_id').on(table.profileId),
  index('queues_next_run').on(table.nextRunAt),
]);
