import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import * as schema from './schema/index.js';

export type { Sql };

export function createDbClient(databaseUrl: string) {
  const sql = postgres(databaseUrl);
  const db = drizzle(sql, { schema });
  return { db, sql };
}
