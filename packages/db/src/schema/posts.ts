import { pgTable, pgEnum, uuid, text, varchar, timestamp, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { socialProfiles } from './social-profiles.js';

// Keep in sync with POST_STATUSES in packages/shared/src/constants/post-states.ts
export const postStatusEnum = pgEnum('post_status', [
  'draft',
  'scheduled',
  'queued',
  'publishing',
  'published',
  'failed',
  'auto_destructing',
  'destroyed',
]);

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => socialProfiles.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  isThread: boolean('is_thread').notNull().default(false),
  status: postStatusEnum('status').notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  failureReason: text('failure_reason'),
  platformPostId: varchar('platform_post_id', { length: 255 }),
  postVersion: integer('post_version').notNull().default(1),
  hasSpinnableText: boolean('has_spinnable_text').notNull().default(false),
  autoDestructAfter: varchar('auto_destruct_after', { length: 50 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('posts_profile_scheduled_status').on(table.profileId, table.scheduledAt, table.status),
  uniqueIndex('posts_platform_post_id').on(table.platformPostId),
  index('posts_user_status').on(table.userId, table.status),
]);
