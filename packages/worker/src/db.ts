// Worker-owned Drizzle client factory. Phase 4 is the first time the worker
// package needs direct DB access — it reads social_profiles for credentials,
// runs the scanner query against posts, and writes post_attempts + post state
// transitions during publish. Kept separate from @sms/api's pgClient so the
// worker can be deployed as its own container without pulling in api code.
//
// Connection pool is intentionally small (max 5) to match the worker's low
// concurrency (publish handler concurrency = 2, scanner concurrency = 1) and
// keep total connection count predictable across replicas.
//
// CLAUDE.md: no top-level side effects. Callers pass the DATABASE_URL in
// explicitly so env var access happens inside `main()`, not at module load.

import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import * as schema from '@sms/db';

export type WorkerDb = PostgresJsDatabase<typeof schema>;

export interface WorkerDbHandle {
  db: WorkerDb;
  pgClient: Sql;
}

export function createWorkerDb(databaseUrl: string): WorkerDbHandle {
  if (!databaseUrl) {
    throw new Error('createWorkerDb: databaseUrl is required');
  }
  const pgClient = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const db = drizzle(pgClient, { schema });
  return { db, pgClient };
}
