import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMigrations } from '../migrate.js';
import { makeTestClient, resetSchemas, closeTestClient, getTestDatabaseUrl } from './helpers/test-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirnameTs = dirname(__filename);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TEST_URL = getTestDatabaseUrl();
const testClient = makeTestClient();
const REAL_MIGRATIONS_DIR = join(__dirnameTs, '../../drizzle');

interface CapturedLog {
  level: 'info' | 'warn';
  msg: string;
  ctx: Record<string, unknown>;
}

// MigrationLogger that accumulates structured events into a shared order[]
// array. Used for the concurrent-caller test where timing-based assertions
// (Date.now diffs) are CI-flaky; the order array gives deterministic
// serialization evidence.
function makeOrderingLogger(prefix: string, order: string[]) {
  return {
    info(msg: string, ctx?: Record<string, unknown>) {
      if (msg === 'Migration applied' && ctx?.migration) {
        order.push(`${prefix}:applied:${String(ctx.migration)}`);
      }
      order.push(`${prefix}:info:${msg}`);
    },
    warn(msg: string, _ctx?: Record<string, unknown>) {
      order.push(`${prefix}:warn:${msg}`);
    },
  };
}

function captureLogger(): {
  logger: { info: (m: string, c?: Record<string, unknown>) => void; warn: (m: string, c?: Record<string, unknown>) => void };
  entries: CapturedLog[];
} {
  const entries: CapturedLog[] = [];
  return {
    logger: {
      info: (msg, ctx = {}) => entries.push({ level: 'info', msg, ctx }),
      warn: (msg, ctx = {}) => entries.push({ level: 'warn', msg, ctx }),
    },
    entries,
  };
}

// Copy the real drizzle folder into a tmp dir so we can plant bad/duplicate
// statements without touching the real migrations.
async function stageMigrations(
  mutator?: (files: Map<string, string>) => void,
): Promise<{ dir: string; files: Map<string, string> }> {
  const dest = await mkdtemp(join(tmpdir(), 'sms-db-migrate-test-'));
  await mkdir(join(dest, 'meta'), { recursive: true });

  const journal = await readFile(join(REAL_MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf-8');
  await writeFile(join(dest, 'meta', '_journal.json'), journal);

  const entries = (JSON.parse(journal) as { entries: Array<{ tag: string }> }).entries;
  const files = new Map<string, string>();
  for (const entry of entries) {
    const content = await readFile(join(REAL_MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf-8');
    files.set(`${entry.tag}.sql`, content);
  }
  mutator?.(files);
  for (const [name, content] of files) {
    await writeFile(join(dest, name), content);
  }
  return { dir: dest, files };
}

// ---------------------------------------------------------------------------
// Crash-safe staged-migration runner
//
// runWithStagedMigrations temporarily replaces files under
// packages/db/drizzle/ with staged content so runMigrations (which resolves
// the folder internally — no path override param) executes the test's mutated
// migration. On any exit path — success, thrown error, process exit, SIGINT —
// the original files are restored. We do NOT rely on vitest's normal teardown,
// because OOM kills, SIGKILL-adjacent signals (SIGINT during debug), or vitest
// worker crashes can bypass finally. The process.once handlers are the safety
// net; pre/post hash snapshots prove no drift after each test.
// ---------------------------------------------------------------------------

const STAGED_BACKUPS: Array<{ path: string; originalContent: string }> = [];
let exitHandlerRegistered = false;

function restoreAllBackups(): void {
  // Synchronous-only — must be usable in process exit handler.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs');
  while (STAGED_BACKUPS.length > 0) {
    const backup = STAGED_BACKUPS.pop()!;
    try {
      fs.writeFileSync(backup.path, backup.originalContent);
    } catch {
      // Best-effort; nothing more we can do from inside an exit handler.
    }
  }
}

function ensureExitHandlersRegistered(): void {
  if (exitHandlerRegistered) return;
  exitHandlerRegistered = true;
  // Fires on normal exit, uncaught exception propagation, and process.exit()
  // calls. Synchronous — no async IO allowed here.
  process.once('exit', restoreAllBackups);
  // Ctrl-C during a test run. Restore, then exit with the conventional
  // 130 code (128 + SIGINT=2). 'exit' fires after, but idempotent pops.
  process.once('SIGINT', () => {
    restoreAllBackups();
    process.exit(130);
  });
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function snapshotDrizzleDir(): Promise<Map<string, string>> {
  const journalRaw = await readFile(join(REAL_MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf-8');
  const journal = JSON.parse(journalRaw) as { entries: Array<{ tag: string }> };
  const snap = new Map<string, string>();
  snap.set('meta/_journal.json', sha256Hex(journalRaw));
  for (const entry of journal.entries) {
    const content = await readFile(join(REAL_MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf-8');
    snap.set(`${entry.tag}.sql`, sha256Hex(content));
  }
  return snap;
}

async function runWithStagedMigrations(
  stagedDir: string,
  logger?: Parameters<typeof runMigrations>[1],
): Promise<void> {
  ensureExitHandlersRegistered();

  const realMetaPath = join(REAL_MIGRATIONS_DIR, 'meta', '_journal.json');
  const backupJournal = await readFile(realMetaPath, 'utf-8');
  const realEntries = (JSON.parse(backupJournal) as { entries: Array<{ tag: string }> }).entries;

  // Capture original contents FIRST (before any writes) and register each
  // in STAGED_BACKUPS so the SIGINT/exit handler can restore them even if
  // this function never returns.
  STAGED_BACKUPS.push({ path: realMetaPath, originalContent: backupJournal });
  for (const entry of realEntries) {
    const p = join(REAL_MIGRATIONS_DIR, `${entry.tag}.sql`);
    const original = await readFile(p, 'utf-8');
    STAGED_BACKUPS.push({ path: p, originalContent: original });
  }

  try {
    const stagedJournal = await readFile(join(stagedDir, 'meta', '_journal.json'), 'utf-8');
    await writeFile(realMetaPath, stagedJournal);
    const stagedEntries = (JSON.parse(stagedJournal) as { entries: Array<{ tag: string }> }).entries;
    for (const entry of stagedEntries) {
      const content = await readFile(join(stagedDir, `${entry.tag}.sql`), 'utf-8');
      await writeFile(join(REAL_MIGRATIONS_DIR, `${entry.tag}.sql`), content);
    }

    await runMigrations(TEST_URL, logger);
  } finally {
    // Restore all backups in reverse order (last-written first).
    restoreAllBackups();
    await rm(stagedDir, { recursive: true, force: true });
  }
}

// Shared per-test drift detector: snapshot hashes before the test runs,
// verify nothing drifted after. Catches any bug where a staged-migration
// run leaves the repo dirty.
let preTestDrizzleSnapshot: Map<string, string> | null = null;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await resetSchemas(testClient);
  preTestDrizzleSnapshot = await snapshotDrizzleDir();
});

afterEach(async () => {
  const post = await snapshotDrizzleDir();
  expect(preTestDrizzleSnapshot).not.toBeNull();
  for (const [file, hash] of preTestDrizzleSnapshot!) {
    expect({ file, hash: post.get(file) }).toEqual({ file, hash });
  }
});

afterAll(async () => {
  await closeTestClient(testClient);
});

// ---------------------------------------------------------------------------
// Scenario 1: Fresh DB
// ---------------------------------------------------------------------------
describe('runMigrations — fresh database', () => {
  it('applies every pending migration and inserts one journal row per tag', async () => {
    const { logger, entries } = captureLogger();
    await runMigrations(TEST_URL, logger);

    const rows = await testClient<{ hash: string }[]>`
      SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY id
    `;
    const journalRaw = await readFile(join(REAL_MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf-8');
    const journal = JSON.parse(journalRaw) as { entries: Array<{ tag: string }> };
    expect(rows.length).toBe(journal.entries.length);

    const applied = entries.filter((e) => e.msg === 'Migration applied');
    expect(applied.length).toBe(journal.entries.length);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Idempotent re-run
// ---------------------------------------------------------------------------
describe('runMigrations — idempotent re-run', () => {
  it('second call applies zero migrations and leaves the journal unchanged', async () => {
    await runMigrations(TEST_URL);
    const first = await testClient<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM "drizzle"."__drizzle_migrations"
    `;
    const firstCount = Number(first[0].count);

    const { logger, entries } = captureLogger();
    await runMigrations(TEST_URL, logger);

    const second = await testClient<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM "drizzle"."__drizzle_migrations"
    `;
    expect(Number(second[0].count)).toBe(firstCount);
    const applied = entries.filter((e) => e.msg === 'Migration applied');
    expect(applied.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Orphan-schema baseline
// ---------------------------------------------------------------------------
describe('runMigrations — orphan-schema baseline tolerance', () => {
  it('tolerates pre-existing tables via narrowed duplicate-object codes', async () => {
    // Pre-seed the `post_status` ENUM type that migration 0000_daily_invaders
    // creates as its very first statement. Using a TYPE (not a TABLE) avoids
    // the FK-constraint complication: tables pre-seeded without the expected
    // columns cause non-duplicate errors when the migration adds FKs. An ENUM
    // type pre-seed triggers 42710 (duplicate_object) cleanly on the CREATE TYPE
    // statement and leaves all tables to be created normally.
    await testClient.unsafe(
      `CREATE TYPE "public"."post_status" AS ENUM('draft', 'scheduled', 'published')`,
    );

    const { logger, entries } = captureLogger();
    await runMigrations(TEST_URL, logger);

    const journalRaw = await readFile(join(REAL_MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf-8');
    const journal = JSON.parse(journalRaw) as { entries: Array<{ tag: string }> };
    const rows = await testClient<{ hash: string }[]>`
      SELECT hash FROM "drizzle"."__drizzle_migrations"
    `;
    expect(rows.length).toBe(journal.entries.length);

    const skipped = entries.filter(
      (e) => e.level === 'warn' && typeof e.msg === 'string' && e.msg.includes('skipped'),
    );
    expect(skipped.length).toBeGreaterThanOrEqual(1);

    for (const s of skipped) {
      expect(['42P07', '42P06', '42710', '42701']).toContain(String(s.ctx.pgCode));
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Duplicate-object tolerance inside a transaction
// ---------------------------------------------------------------------------
describe('runMigrations — duplicate-object tolerance at statement level', () => {
  it('swallows 42P07 inside the migration and still commits the journal row', async () => {
    await testClient.unsafe(
      'CREATE TABLE "preexisting_dup_test" (id serial primary key)',
    );

    const { dir: stagedDir } = await stageMigrations((files) => {
      const tags = Array.from(files.keys())
        .filter((n) => n.endsWith('.sql'))
        .sort();
      const lastTag = tags[tags.length - 1];
      // First statement duplicates the pre-existing table (42P07); second is valid.
      files.set(
        lastTag,
        `CREATE TABLE "preexisting_dup_test" (id serial primary key);\n--> statement-breakpoint\nALTER TABLE "preexisting_dup_test" ADD COLUMN note text;`,
      );
    });

    const { logger, entries } = captureLogger();
    await runWithStagedMigrations(stagedDir, logger);

    const journalRaw = await readFile(join(REAL_MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf-8');
    const journal = JSON.parse(journalRaw) as { entries: Array<{ tag: string }> };
    const rows = await testClient<{ hash: string }[]>`
      SELECT hash FROM "drizzle"."__drizzle_migrations"
    `;
    // All migrations applied, including the one that had a duplicate first statement.
    expect(rows.length).toBe(journal.entries.length);

    const warns = entries.filter(
      (e) => e.level === 'warn' && String(e.ctx.pgCode) === '42P07',
    );
    expect(warns.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Real-error rollback (D-09) — hash-absence assertion
// ---------------------------------------------------------------------------
describe('runMigrations — real SQL error aborts the transaction', () => {
  it('rolls back partial DDL and does NOT insert the planted hash into __drizzle_migrations', async () => {
    // Stage a migration where:
    //   statement 1: CREATE TABLE "canary_should_be_rolled_back" ... (valid)
    //   statement 2: SELECT FROM WHERE; (syntactically invalid — triggers abort)
    //
    // Capture the exact planted SQL string so we can hash it the same way
    // readAppliedHashes does, and then assert that hash is absent.
    const plantedSql = `CREATE TABLE "canary_should_be_rolled_back" (id serial primary key);\n--> statement-breakpoint\nSELECT FROM WHERE;`;
    const plantedHash = sha256Hex(plantedSql);

    let plantedTag = '';
    const { dir: stagedDir } = await stageMigrations((files) => {
      const tags = Array.from(files.keys())
        .filter((n) => n.endsWith('.sql'))
        .sort();
      const lastTag = tags[tags.length - 1];
      plantedTag = lastTag.replace(/\.sql$/, '');
      files.set(lastTag, plantedSql);
    });

    const { logger } = captureLogger();
    await expect(runWithStagedMigrations(stagedDir, logger)).rejects.toThrow();

    // Canary table from the valid first statement MUST NOT persist
    // (proves per-migration transaction rollback).
    const tables = await testClient<{ tablename: string }[]>`
      SELECT tablename FROM pg_catalog.pg_tables
      WHERE schemaname = 'public' AND tablename = 'canary_should_be_rolled_back'
    `;
    expect(tables.length).toBe(0);

    // Primary D-09 assertion: the planted hash — the exact SHA-256 of the string
    // passed to splitStatements — MUST NOT appear in __drizzle_migrations.
    // Row-count checks are not sufficient because earlier migrations may or may
    // not have committed; what matters is that the FAILED migration's hash is absent.
    const rows = await testClient<{ hash: string }[]>`
      SELECT hash FROM "drizzle"."__drizzle_migrations"
    `;
    expect(rows.every((r) => r.hash !== plantedHash)).toBe(true);

    // Sanity: the planted tag corresponds to a real migration file that got swapped
    // in (guards against a stageMigrations mutator bug).
    expect(plantedTag).toMatch(/^\d{4}/);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Concurrent-caller advisory-lock serialization
// ---------------------------------------------------------------------------
describe('runMigrations — concurrent caller serialization', () => {
  it('second caller waits for the first to release the advisory lock', async () => {
    const order: string[] = [];

    // Start first caller.
    const first = runMigrations(TEST_URL, makeOrderingLogger('first', order));
    // Tiny delay so the first caller definitively gets the lock first.
    await new Promise<void>((r) => setTimeout(r, 20));
    order.push('second:start');
    const second = runMigrations(TEST_URL, makeOrderingLogger('second', order));

    await Promise.all([first, second]);

    // Journal should have exactly N rows (not 2N). The second caller re-reads the
    // journal AFTER the first releases the lock and sees all hashes already applied.
    const journalRaw = await readFile(join(REAL_MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf-8');
    const journal = JSON.parse(journalRaw) as { entries: Array<{ tag: string }> };
    const rows = await testClient<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM "drizzle"."__drizzle_migrations"
    `;
    expect(Number(rows[0].count)).toBe(journal.entries.length);

    // Ordering proof: the LAST first:applied entry must come before the FIRST
    // second:info:* entry in the order array. If the second caller's work was
    // entirely skipped (re-read journal saw all applied), firstSecondInfoIdx may
    // be -1 — still proves serialization since the second caller didn't run any
    // migrations because the first held the lock until done.
    const lastFirstAppliedIdx = order.map((e) => e.startsWith('first:applied:')).lastIndexOf(true);
    const firstSecondInfoIdx = order.findIndex((e) => e.startsWith('second:info:'));
    if (firstSecondInfoIdx !== -1) {
      expect(lastFirstAppliedIdx).toBeLessThan(firstSecondInfoIdx);
    } else {
      expect(lastFirstAppliedIdx).toBeGreaterThanOrEqual(0);
    }
  });
});
