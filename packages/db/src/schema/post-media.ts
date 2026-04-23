import { pgTable, pgEnum, uuid, text, varchar, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { posts } from './posts.js';

export const transcodeStatusEnum = pgEnum('transcode_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'not_applicable',
]);

export const postMedia = pgTable('post_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'set null' }),
  filePath: text('file_path').notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  width: integer('width'),
  height: integer('height'),
  thumbnailPath: text('thumbnail_path'),
  sortOrder: integer('sort_order').notNull().default(0),
  transcodeStatus: transcodeStatusEnum('transcode_status').notNull().default('not_applicable'),
  transcodeError: text('transcode_error'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('post_media_post_id').on(table.postId),
  index('post_media_deleted_at').on(table.deletedAt),
  index('post_media_transcode_status').on(table.transcodeStatus),
]);
