import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import postgres, { type Sql, type ReservedSql } from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Postgres SQLSTATE codes tolerated at statement level inside a migration
 * transaction. Narrowed (D-06) to the four codes that arise from
 * drizzle-emitted DDL; any other error rethrows and aborts the transaction.
 *
 * - 42P07 duplicate_table (CREATE TABLE, CREATE INDEX)
 * - 42P06 duplicate_schema (CREATE SCHEMA)
 * - 42710 duplicate_object (CONSTRAINT, TYPE, TRIGGER, EXTENSION)
 * - 42701 duplicate_column (ADD COLUMN)
 *
 * Explicitly NOT tolerated:
 * - 42P03 duplicate_cursor (migrations don't declare cursors)
 * - 42P04 duplicate_database (migrations don't CREATE DATABASE)
 * - 42P05 duplicate_prepared_statement (migrations don't prepare statements)
 * - 42723 duplicate_function (not emitted by drizzle-kit today; add back
 *   with a test if a future schema pattern requires it)
 */
const DUPLICATE_OBJECT_CODES = new Set([
  '42P07',
  '42P06',
  '42710',
  '42701',
]);

/**
 * Postgres advisory lock key for the migration runner. Frozen forever —
 * changing this value would allow a rolling deploy's old and new containers
 * to migrate in parallel, which is exactly the race this lock prevents.
 * Grep-audited 2026-04-16: no other pg_advisory_lock call site in this repo.
 */
const MIGRATION_LOCK_KEY = 7523098462398n;

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
  error(msg: string, ctx?: Record<string, unknown>): void;
}

const defaultLogger: MigrationLogger = {
  info: (msg, ctx) => console.log(JSON.stringify({ level: 'info', msg, ...ctx })),
  warn: (msg, ctx) => console.warn(JSON.stringify({ level: 'warn', msg, ...ctx })),
  error: (msg, ctx) => console.error(JSON.stringify({ level: 'error', msg, ...ctx })),
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
    // Pin a single backend PID for the entire migration run. `max: 1` alone
    // does NOT guarantee same-connection semantics across queries (the driver
    // can drop and reconnect); session-scoped advisory locks die with the
    // session, so the lock and the migration apply MUST share one connection.
    const reserved = await client.reserve();
    try {
      await ensureMigrationsTable(reserved);
      // Blocking acquire (D-01). A second concurrent caller waits here until
      // the first caller's finally block runs pg_advisory_unlock.
      await reserved.unsafe(`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`);
      try {
        const journal = await readJournal(migrationsFolder);
        const applied = await readAppliedHashes(reserved);

        for (const entry of journal.entries) {
          const sqlPath = join(migrationsFolder, `${entry.tag}.sql`);
          const sql = await readFile(sqlPath, 'utf-8');
          const hash = createHash('sha256').update(sql).digest('hex');

          if (applied.has(hash)) {
            continue;
          }

          await applyMigration({ client: reserved, entry, sql, hash, logger });
        }
      } finally {
        // Release the lock BEFORE releasing the reservation, so the unlock
        // runs on the same session that owns the lock. Failure here is
        // logged but doesn't mask the original error (if any).
        try {
          await reserved.unsafe(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`);
        } catch (unlockErr) {
          logger.error('Failed to release migration advisory lock; session close will release it', {
            error: (unlockErr as Error).message,
          });
        }
      }
    } finally {
      await reserved.release();
    }
  } finally {
    await client.end();
  }
}

async function ensureMigrationsTable(client: Sql | ReservedSql): Promise<void> {
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

async function readAppliedHashes(client: Sql | ReservedSql): Promise<Set<string>> {
  const rows = await client<{ hash: string }[]>`
    SELECT hash FROM "drizzle"."__drizzle_migrations"
  `;
  return new Set(rows.map((r) => r.hash));
}

interface ApplyMigrationArgs {
  client: ReservedSql;
  entry: JournalEntry;
  sql: string;
  hash: string;
  logger: MigrationLogger;
}

async function applyMigration({ client, entry, sql, hash, logger }: ApplyMigrationArgs): Promise<void> {
  const statements = splitStatements(sql);
  let skipped = 0;

  // Per-migration atomic transaction (D-04). Non-duplicate errors rethrow
  // and abort the transaction — __drizzle_migrations stays unmodified and
  // any partial DDL is rolled back, preventing the crash-loop scenario
  // from 06.1-REVIEW.md H-02. Duplicate-object codes (D-05) are still
  // tolerated at the statement level so orphan-schema baselines commit.
  //
  // ReservedSql does not expose .begin() — transactions on a reserved
  // connection use manual BEGIN/COMMIT/ROLLBACK via .unsafe() so they
  // share the same session (and therefore the same advisory lock).
  // Use SAVEPOINT around each statement so a duplicate-object error can be
  // swallowed while leaving the transaction open. Without SAVEPOINT, Postgres
  // marks the transaction aborted on any error — even if Node.js catches it —
  // and every subsequent statement fails with "current transaction is aborted".
  await client.unsafe('BEGIN');
  try {
    for (const statement of statements) {
      await client.unsafe('SAVEPOINT stmt_sp');
      try {
        await client.unsafe(statement);
        await client.unsafe('RELEASE SAVEPOINT stmt_sp');
      } catch (err) {
        const pgCode = (err as { code?: string }).code;
        if (pgCode && DUPLICATE_OBJECT_CODES.has(pgCode)) {
          await client.unsafe('ROLLBACK TO SAVEPOINT stmt_sp');
          await client.unsafe('RELEASE SAVEPOINT stmt_sp');
          skipped += 1;
          logger.warn('Migration statement skipped — object already present', {
            migration: entry.tag,
            pgCode,
            statementPreview: statement.slice(0, 120).replace(/\s+/g, ' ').trim(),
          });
          continue;
        }
        // Non-duplicate error: roll back to savepoint so ROLLBACK below works.
        await client.unsafe('ROLLBACK TO SAVEPOINT stmt_sp').catch(() => {});
        throw err; // Caught in the outer catch; transaction is rolled back.
      }
    }

    await client.unsafe(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [hash, entry.when],
    );
    await client.unsafe('COMMIT');
  } catch (err) {
    await client.unsafe('ROLLBACK').catch(() => {
      // Best-effort rollback; original error is re-thrown below.
    });
    throw err;
  }

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
