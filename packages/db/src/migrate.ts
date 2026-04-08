import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(databaseUrl: string) {
  const migrationClient = postgres(databaseUrl, { max: 1 });
  try {
    const db = drizzle(migrationClient);
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  } finally {
    await migrationClient.end();
  }
}
