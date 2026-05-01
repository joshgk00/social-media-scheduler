import { pgTable, pgEnum, uuid, text, varchar, timestamp, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { socialProfiles } from './social-profiles.js';
import { queues } from './queues.js';

// Keep in sync with POST_STATUSES in packages/shared/src/constants/post-states.ts
export const postStatusEnum = pgEnum('post_status', [
  'draft',
  'scheduled',
  'queued',
  'paused',
  'publishing',
  'published',
  'failed',
  'auto_destructing',
  'destroyed',
]);

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Preserve posts if a connected account is later disconnected.
  profileId: uuid('profile_id').references(() => socialProfiles.id, { onDelete: 'set null' }),
  // Phase 8 — denormalized from the joined `social_profiles.platform` to avoid a
  // JOIN on the worker hot-path (Pattern 1 / Pitfall A5). Application layer
  // (post.service.ts) MUST set this from social_profiles.platform at insert
  // time and reject updates that change it (T-DATA-01).
  platform: varchar('platform', { length: 16 }).notNull().default('twitter'),
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
  queueId: uuid('queue_id').references(() => queues.id, { onDelete: 'set null' }),
  queuePosition: integer('queue_position'),
  destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
  notes: text('notes'),
  // Phase 8 — LinkedIn-only visibility setting (POST-LI-03). NULL for twitter/facebook posts.
  visibility: varchar('visibility', { length: 16 }),
  // Phase 8 — Facebook-only optional link URL (POST-FB-04). NULL for twitter/linkedin posts.
  linkUrl: text('link_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('posts_profile_scheduled_status').on(table.profileId, table.scheduledAt, table.status),
  uniqueIndex('posts_platform_post_id').on(table.platformPostId),
  index('posts_user_status').on(table.userId, table.status),
  index('posts_profile_status').on(table.profileId, table.status),
  index('posts_queue_position').on(table.queueId, table.queuePosition),
]);
