import { pgTable, pgEnum, uuid, varchar, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const snippetCategoryEnum = pgEnum('snippet_category', ['hashtag_set', 'text']);

export const snippets = pgTable('snippets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  category: snippetCategoryEnum('category').notNull().default('text'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('snippets_user_lower_name_unq').on(table.userId, sql`lower(${table.name})`),
  index('snippets_user_idx').on(table.userId),
]);
