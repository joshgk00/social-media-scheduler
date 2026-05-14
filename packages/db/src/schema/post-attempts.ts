import { pgTable, uuid, integer, timestamp, text, varchar, index, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { posts } from './posts.js';

export const postAttemptOutcome = pgEnum('post_attempt_outcome', [
  'success',
  'transient_fail',
  'permanent_fail',
  'cancelled',
]);

export const postAttempts = pgTable(
  'post_attempts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    attemptNum: integer('attempt_num').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    outcome: postAttemptOutcome('outcome').notNull(),
    httpStatus: integer('http_status'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    platformPostId: varchar('platform_post_id', { length: 255 }),
  },
  (table) => ({
    postIdStartedAtIdx: index('post_attempts_post_started_idx').on(
      table.postId,
      table.startedAt,
    ),
  }),
);

export type PostAttempt = typeof postAttempts.$inferSelect;
export type NewPostAttempt = typeof postAttempts.$inferInsert;
