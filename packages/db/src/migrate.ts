import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import postgres, { type Sql } from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Postgres SQLSTATE codes that indicate an object already exists. When a
 * migration statement fails with one of these, the runner logs a warning and
 * continues — the declarative end state is already satisfied.
 *
 * - 42P07 duplicate_table
 * - 42P06 duplicate_schema
 * - 42710 duplicate_object (covers CONSTRAINT, TYPE, EXTENSION, TRIGGER)
 * - 42701 duplicate_column
 * - 42P03 duplicate_cursor
 * - 42P04 duplicate_database
 * - 42P05 duplicate_prepared_statement
 * - 42723 duplicate_function
 */
const DUPLICATE_OBJECT_CODES = new Set([
  '42P07',
  '42P06',
  '42710',
  '42701',
  '42P03',
  '42P04',
  '42P05',
  '42723',
]);

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints?: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

interface MigrationLogger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
}

const defaultLogger: MigrationLogger = {
  info: (msg, ctx) => console.log(JSON.stringify({ level: 'info', msg, ...ctx })),
  warn: (msg, ctx) => console.warn(JSON.stringify({ level: 'warn', msg, ...ctx })),
};

/**
 * Runs pending migrations against the database. Idempotent with respect to
 * schema drift: when a statement fails with a "duplicate object" SQLSTATE the
 * runner logs a warning and continues. This tolerates the common scenario
 * where `drizzle-kit push` was used during development (or an earlier boot
 * partially applied a migration) leaving orphan schema objects that aren't
 * tracked in `__drizzle_migrations`.
 *
 * A real migration failure (syntax error, type mismatch, FK violation, etc.)
 * still aborts startup.
 */
export async function runMigrations(databaseUrl: string, logger: MigrationLogger = defaultLogger) {
  const migrationsFolder = resolve(__dirname, '../drizzle');
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await ensureMigrationsTable(client);

    const journal = await readJournal(migrationsFolder);
    const applied = await readAppliedHashes(client);

    for (const entry of journal.entries) {
      const sqlPath = join(migrationsFolder, `${entry.tag}.sql`);
      const sql = await readFile(sqlPath, 'utf-8');
      const hash = createHash('sha256').update(sql).digest('hex');

      if (applied.has(hash)) {
        continue;
      }

      await applyMigration({ client, entry, sql, hash, logger });
    }
  } finally {
    await client.end();
  }
}

async function ensureMigrationsTable(client: Sql): Promise<void> {
  // Match drizzle's tracking table schema so future calls to drizzle's
  // native migrate() would also find these records.
  await client.unsafe('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
}

async function readJournal(migrationsFolder: string): Promise<Journal> {
  const journalPath = join(migrationsFolder, 'meta', '_journal.json');
  const raw = await readFile(journalPath, 'utf-8');
  return JSON.parse(raw) as Journal;
}

async function readAppliedHashes(client: Sql): Promise<Set<string>> {
  const rows = await client<{ hash: string }[]>`
    SELECT hash FROM "drizzle"."__drizzle_migrations"
  `;
  return new Set(rows.map((r) => r.hash));
}

interface ApplyMigrationArgs {
  client: Sql;
  entry: JournalEntry;
  sql: string;
  hash: string;
  logger: MigrationLogger;
}

async function applyMigration({ client, entry, sql, hash, logger }: ApplyMigrationArgs): Promise<void> {
  const statements = splitStatements(sql);
  let skipped = 0;

  for (const statement of statements) {
    try {
      await client.unsafe(statement);
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      if (pgCode && DUPLICATE_OBJECT_CODES.has(pgCode)) {
        skipped += 1;
        logger.warn('Migration statement skipped — object already present', {
          migration: entry.tag,
          pgCode,
          statementPreview: statement.slice(0, 120).replace(/\s+/g, ' ').trim(),
        });
        continue;
      }
      throw err;
    }
  }

  await client`
    INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
    VALUES (${hash}, ${entry.when})
  `;

  logger.info('Migration applied', {
    migration: entry.tag,
    statements: statements.length,
    skipped,
  });
}

function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
