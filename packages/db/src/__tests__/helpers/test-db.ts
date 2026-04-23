import postgres, { type Sql } from 'postgres';

const DEFAULT_TEST_URL = 'postgres://scheduler:devpassword123@127.0.0.1:5432/scheduler_test';

export function getTestDatabaseUrl(): string {
  return process.env.DATABASE_URL_TEST ?? DEFAULT_TEST_URL;
}

// Factory that opens a single-writer client. `max: 1` per packages/db/CLAUDE.md
// §Connections — migrations are single-writer.
export function makeTestClient(): Sql {
  return postgres(getTestDatabaseUrl(), { max: 1 });
}

// Drop both the Drizzle tracking schema and the app `public` schema, then
// recreate `public`. Idempotent — handles any tables or types left behind
// without per-table logic.
export async function resetSchemas(client: Sql): Promise<void> {
  await client.unsafe(`DROP SCHEMA IF EXISTS "drizzle" CASCADE`);
  await client.unsafe(`DROP SCHEMA IF EXISTS "public" CASCADE`);
  await client.unsafe(`CREATE SCHEMA "public"`);
}

// Best-effort teardown — swallow errors so one failed close does not prevent
// the rest of teardown from running. Mirrors the stop() discipline in
// packages/worker/src/__tests__/helpers/testcontainer.ts.
export async function closeTestClient(client: Sql): Promise<void> {
  try {
    await client.end({ timeout: 5 });
  } catch {
    // Cleanup best-effort; a failed close is logged upstream if needed.
  }
}
