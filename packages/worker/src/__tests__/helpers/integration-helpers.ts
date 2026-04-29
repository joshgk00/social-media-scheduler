import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Queue } from 'bullmq';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { Redis } from 'ioredis';
import nodemailer, { type Transporter } from 'nodemailer';
import postgres, { type Sql } from 'postgres';
import {
  emailLogs,
  notifications,
  posts,
  queues,
  socialProfiles,
  userNotificationPrefs,
  users,
} from '@sms/db';
import * as schema from '@sms/db';
import { QUEUE_NAMES, type NotificationEventType } from '@sms/shared';
import type { WorkerDb } from '../../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, '../../../../db/drizzle');

export interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface IntegrationContext {
  postgres: StartedTestContainer;
  redis: StartedTestContainer;
  redisClient: Redis;
  db: WorkerDb;
  pgClient: Sql;
  notificationQueue: Queue;
  sentEmails: CapturedEmail[];
  mockTransporter: Transporter;
  cleanup: () => Promise<void>;
  reset: () => Promise<void>;
}

type Platform = 'twitter' | 'linkedin' | 'facebook';

function readMailField(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(readMailField).join(', ');
  if (value && typeof value === 'object' && 'address' in value) {
    return String((value as { address: unknown }).address);
  }
  return value ? String(value) : '';
}

function createMockTransporter(sentEmails: CapturedEmail[]): Transporter {
  const transporter = nodemailer.createTransport({ jsonTransport: true });
  const sendMail = transporter.sendMail.bind(transporter);

  transporter.sendMail = (async (mailOptions: Parameters<Transporter['sendMail']>[0]) => {
    const message = mailOptions as {
      to?: unknown;
      subject?: unknown;
      html?: unknown;
      text?: unknown;
    };
    sentEmails.push({
      to: readMailField(message.to),
      subject: readMailField(message.subject),
      html: readMailField(message.html),
      text: readMailField(message.text),
    });

    return sendMail(mailOptions);
  }) as Transporter['sendMail'];

  return transporter;
}

export async function createIntegrationContext(): Promise<IntegrationContext> {
  const postgresContainer = await new GenericContainer('postgres:17-alpine')
    .withEnvironment({ POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'sms_test' })
    .withExposedPorts(5432)
    .start();
  const redisContainer = await new GenericContainer('redis:7.4-alpine')
    .withExposedPorts(6379)
    .start();
  const databaseUrl = `postgres://postgres:test@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/sms_test`;
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

  const migrationClient = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(migrationClient), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await migrationClient.end();
  }

  const pgClient = postgres(databaseUrl, { max: 5 });
  const db = drizzle(pgClient, { schema }) as WorkerDb;
  const redisClient = new Redis(redisUrl, { maxRetriesPerRequest: null });
  await redisClient.ping();

  const notificationQueue = new Queue(QUEUE_NAMES.notification, { connection: redisClient });
  const sentEmails: CapturedEmail[] = [];
  const mockTransporter = createMockTransporter(sentEmails);

  async function reset(): Promise<void> {
    sentEmails.length = 0;
    await notificationQueue.drain(true);
    await pgClient`
      TRUNCATE TABLE
        notifications,
        email_logs,
        user_notification_prefs,
        posts,
        queues,
        social_profiles,
        users
      RESTART IDENTITY CASCADE
    `;
  }

  async function cleanup(): Promise<void> {
    const cleanupSteps = [
      () => notificationQueue.close(),
      () => redisClient.quit(),
      () => pgClient.end(),
      () => redisContainer.stop(),
      () => postgresContainer.stop(),
    ];

    for (const cleanupStep of cleanupSteps) {
      try {
        await cleanupStep();
      } catch {
        // Best-effort cleanup for ephemeral integration resources.
      }
    }
  }

  return {
    postgres: postgresContainer,
    redis: redisContainer,
    redisClient,
    db,
    pgClient,
    notificationQueue,
    sentEmails,
    mockTransporter,
    cleanup,
    reset,
  };
}

export async function seedTestUser(
  db: WorkerDb,
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<{ id: string; email: string }> {
  const { id, email: overrideEmail, passwordHash, timezone, dateFormat, entriesPerPage, ...rest } = overrides;
  const userId = id ?? randomUUID();
  const email = overrideEmail ?? `user-${userId}@example.com`;
  const insertedUsers = await db
    .insert(users)
    .values({
      ...rest,
      id: userId,
      email,
      passwordHash: passwordHash ?? 'argon2id-test-hash',
      timezone: timezone ?? 'UTC',
      dateFormat: dateFormat ?? 'YYYY-MM-DD',
      entriesPerPage: entriesPerPage ?? 25,
    })
    .returning({ id: users.id, email: users.email });

  return insertedUsers[0];
}

export async function seedTestProfile(
  db: WorkerDb,
  userId: string,
  platform: Platform = 'twitter',
  overrides: Partial<typeof socialProfiles.$inferInsert> = {},
): Promise<{ id: string }> {
  const { id, platformUserId, displayName, handle, ...rest } = overrides;
  const insertedProfiles = await db
    .insert(socialProfiles)
    .values({
      ...rest,
      id: id ?? randomUUID(),
      userId,
      platform,
      platformUserId: platformUserId ?? `platform-${randomUUID()}`,
      displayName: displayName ?? 'TestProfile',
      handle: handle ?? '@testprofile',
    })
    .returning({ id: socialProfiles.id });

  return insertedProfiles[0];
}

export async function seedTestQueue(
  db: WorkerDb,
  userId: string,
  profileId: string,
  overrides: Partial<typeof queues.$inferInsert> = {},
): Promise<{ id: string }> {
  const { id, name, ...rest } = overrides;
  const insertedQueues = await db
    .insert(queues)
    .values({
      ...rest,
      id: id ?? randomUUID(),
      userId,
      profileId,
      name: name ?? 'Daily Posts',
    })
    .returning({ id: queues.id });

  return insertedQueues[0];
}

export async function seedTestPost(
  db: WorkerDb,
  userId: string,
  profileId: string,
  overrides: Partial<typeof posts.$inferInsert> = {},
): Promise<{ id: string }> {
  const { id, platform, text, status, ...rest } = overrides;
  const insertedPosts = await db
    .insert(posts)
    .values({
      ...rest,
      id: id ?? randomUUID(),
      userId,
      profileId,
      platform: platform ?? 'twitter',
      text: text ?? 'A scheduled test post',
      status: status ?? 'failed',
    })
    .returning({ id: posts.id });

  return insertedPosts[0];
}

export async function seedNotificationPrefs(
  db: WorkerDb,
  userId: string,
  prefs: Array<{
    eventType: NotificationEventType;
    inAppEnabled: boolean;
    emailEnabled: boolean;
  }>,
): Promise<void> {
  if (prefs.length === 0) return;

  await db
    .insert(userNotificationPrefs)
    .values(prefs.map((pref) => ({
      userId,
      eventType: pref.eventType,
      inAppEnabled: pref.inAppEnabled,
      emailEnabled: pref.emailEnabled,
    })));
}

export async function waitForRows<T>(
  queryRows: () => Promise<T[]>,
  expectedMin: number,
  timeoutMs = 5_000,
): Promise<T[]> {
  const startedAt = Date.now();
  let latestRows: T[] = [];

  while (Date.now() - startedAt < timeoutMs) {
    latestRows = await queryRows();
    if (latestRows.length >= expectedMin) return latestRows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for ${expectedMin} rows; saw ${latestRows.length}`);
}

export async function readNotificationRows(db: WorkerDb): Promise<Array<typeof notifications.$inferSelect>> {
  return db.select().from(notifications);
}

export async function readEmailLogRows(db: WorkerDb): Promise<Array<typeof emailLogs.$inferSelect>> {
  return db.select().from(emailLogs);
}
