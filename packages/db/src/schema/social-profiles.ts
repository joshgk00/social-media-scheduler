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
  monthlyTweetBudget: integer('monthly_tweet_budget').notNull().default(500),
  warnThresholdPercent: integer('warn_threshold_percent').notNull().default(80),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  lastPublishedAt: timestamp('last_published_at', { withTimezone: true }),

  // Phase 7: OAuth 2.0 token lifecycle (LinkedIn, Facebook) per CONTEXT D-06..D-11.
  // Twitter rows keep `platformAccountId = NULL` and continue using the OAuth 1.0a
  // consumer*/accessTokenSecret* triples above. Token columns are encrypted at rest
  // (AES-256-GCM) — ciphertext/iv/authTag stored together; plaintext never persists.
  platformAccountId: varchar('platform_account_id', { length: 255 }),
  oauth2AccessTokenCiphertext: text('oauth2_access_token_ciphertext'),
  oauth2AccessTokenIv: varchar('oauth2_access_token_iv', { length: 64 }),
  oauth2AccessTokenAuthTag: varchar('oauth2_access_token_auth_tag', { length: 64 }),
  oauth2RefreshTokenCiphertext: text('oauth2_refresh_token_ciphertext'),
  oauth2RefreshTokenIv: varchar('oauth2_refresh_token_iv', { length: 64 }),
  oauth2RefreshTokenAuthTag: varchar('oauth2_refresh_token_auth_tag', { length: 64 }),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  tokenStatus: varchar('token_status', { length: 20 }).notNull().default('active'),
  tokenHealthCheckedAt: timestamp('token_health_checked_at', { withTimezone: true }),
  notes: text('notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('social_profiles_user_platform_account').on(table.userId, table.platform, table.platformUserId, table.platformAccountId).nullsNotDistinct(),
]);
