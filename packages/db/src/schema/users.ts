import { pgTable, uuid, text, varchar, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  username: varchar('username', { length: 100 }),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  profileImagePath: text('profile_image_path'),
  timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
  dateFormat: varchar('date_format', { length: 20 }).notNull().default('YYYY-MM-DD'),
  entriesPerPage: integer('entries_per_page').notNull().default(25),
  // Stored plaintext intentionally: (1) self-hosted single-user app where DB is on
  // the same trusted host, (2) encrypting TOTP secrets would require key rotation
  // coordination that adds complexity without meaningful security benefit for this
  // threat model, (3) if an attacker has DB access they already have the
  // ENCRYPTION_KEY env var on the same machine.
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
