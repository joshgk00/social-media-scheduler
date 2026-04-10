// Shared Postgres + Redis testcontainer factory for worker integration tests.
// Spins up ephemeral postgres:17-alpine and redis:7.4-alpine containers,
// applies Drizzle migrations from packages/db/drizzle/, and returns connected
// clients ready for use. Each test file should call startTestEnv() in
// beforeAll and stop() in afterAll. Container startup takes ~5-15s per pair.

import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { Redis } from 'ioredis';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as schema from '@sms/db';
import type { WorkerDb } from '../../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, '../../../../db/drizzle');

export interface TestEnv {
  pgContainer: StartedTestContainer;
  redisContainer: StartedTestContainer;
  db: WorkerDb;
  pgClient: Sql;
  redis: Redis;
  databaseUrl: string;
  redisUrl: string;
  stop: () => Promise<void>;
}

export async function startTestEnv(): Promise<TestEnv> {
  const pgContainer = await new GenericContainer('postgres:17-alpine')
    .withEnvironment({ POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'sms_test' })
    .withExposedPorts(5432)
    .start();

  const redisContainer = await new GenericContainer('redis:7.4-alpine')
    .withExposedPorts(6379)
    .start();

  const databaseUrl = `postgres://postgres:test@${pgContainer.getHost()}:${pgContainer.getMappedPort(5432)}/sms_test`;
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

  // Run migrations with a single-connection client
  const migrationClient = postgres(databaseUrl, { max: 1 });
  try {
    const migrationDb = drizzle(migrationClient);
    await migrate(migrationDb, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await migrationClient.end();
  }

  // Create the worker DB connection
  const pgClient = postgres(databaseUrl, { max: 5 });
  const db = drizzle(pgClient, { schema }) as WorkerDb;

  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  await redis.ping();

  const stop = async () => {
    try { await redis.quit(); } catch { /* cleanup best-effort */ }
    try { await pgClient.end(); } catch { /* cleanup best-effort */ }
    try { await pgContainer.stop(); } catch { /* cleanup best-effort */ }
    try { await redisContainer.stop(); } catch { /* cleanup best-effort */ }
  };

  return { pgContainer, redisContainer, db, pgClient, redis, databaseUrl, redisUrl, stop };
}
