import { pgTable, uuid, text, varchar, timestamp, integer, unique } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const socialProfiles = pgTable('social_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: varchar('platform', { length: 20 }).notNull(),
  platformUserId: varchar('platform_user_id', { length: 255 }),
  displayName: varchar('display_name', { length: 255 }),
  handle: varchar('handle', { length: 255 }),
  avatarUrl: text('avatar_url'),

  consumerKeyCiphertext: text('consumer_key_ciphertext'),
  consumerKeyIv: varchar('consumer_key_iv', { length: 64 }),
  consumerKeyAuthTag: varchar('consumer_key_auth_tag', { length: 64 }),

  consumerSecretCiphertext: text('consumer_secret_ciphertext'),
  consumerSecretIv: varchar('consumer_secret_iv', { length: 64 }),
  consumerSecretAuthTag: varchar('consumer_secret_auth_tag', { length: 64 }),

  accessTokenCiphertext: text('access_token_ciphertext'),
  accessTokenIv: varchar('access_token_iv', { length: 64 }),
  accessTokenAuthTag: varchar('access_token_auth_tag', { length: 64 }),

  accessTokenSecretCiphertext: text('access_token_secret_ciphertext'),
  accessTokenSecretIv: varchar('access_token_secret_iv', { length: 64 }),
  accessTokenSecretAuthTag: varchar('access_token_secret_auth_tag', { length: 64 }),

  tokenEncryptionVersion: integer('token_encryption_version').notNull().default(1),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  lastPublishedAt: timestamp('last_published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('social_profiles_user_platform_account').on(table.userId, table.platform, table.platformUserId).nullsNotDistinct(),
]);
