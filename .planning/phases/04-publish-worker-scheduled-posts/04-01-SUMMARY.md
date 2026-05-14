---
phase: 04-publish-worker-scheduled-posts
plan: 01
subsystem: database

tags: [drizzle, postgres, migration, schema, post-attempts, rate-limit]

# Dependency graph
requires:
  - phase: 03-twitter-profile-post-creation
    provides: posts table with post_version, platform_post_id, scheduledAt, status enum; social_profiles table with encrypted OAuth token columns
provides:
  - post_attempts table (D-16) for WORKER-06 publish history and SCHED-04 history modal
  - post_attempt_outcome Postgres enum (success, transient_fail, permanent_fail, cancelled)
  - social_profiles.monthly_tweet_budget column (LIMIT-01, default 500)
  - social_profiles.warn_threshold_percent column (LIMIT-02, default 80)
  - Versioned SQL migration 0002_phase-04-publish-worker.sql applied to the dev Postgres
  - postAttempts re-exported from @sms/db barrel for downstream api/worker packages
affects: [04-02, 04-03, 04-04, 04-05, 04-06, worker, api, rate-limit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Versioned Drizzle migrations via drizzle-kit generate + drizzle-kit migrate (no push)"
    - "DB defaults for rate-limit knobs; Zod enforces upper/lower bounds in the app layer"
    - "Compact publish-history rows (no updated_at, no payload blobs) per D-19"

key-files:
  created:
    - packages/db/src/schema/post-attempts.ts
    - packages/db/drizzle/0002_phase-04-publish-worker.sql
    - packages/db/drizzle/meta/0002_snapshot.json
  modified:
    - packages/db/src/schema/social-profiles.ts
    - packages/db/src/schema/index.ts
    - packages/db/drizzle/meta/_journal.json

key-decisions:
  - "Followed D-22 split: DB defaults (500 / 80), Zod enforces 1..10000 and 1..99 in Plan 02 — no CHECK constraints in the schema"
  - "Followed D-16 exactly: 10 columns, no updated_at, onDelete cascade FK, compound index on (post_id, started_at)"

patterns-established:
  - "Phase 4 uses drizzle-kit generate + migrate (versioned, idempotent) matching Phase 1-3; never push in CI/dev"
  - "post_attempts rows are intentionally compact — Twitter request/response bodies live in pino logs, not the DB"

requirements-completed: [WORKER-06, SCHED-04, LIMIT-01, LIMIT-02]

# Metrics
duration: 4min
completed: 2026-04-10
---

# Phase 04 Plan 01: Phase 4 Schema Foundation Summary

**Drizzle schema + versioned migration landing the post_attempts publish-history table, the post_attempt_outcome enum, and the two social_profiles rate-limit columns (monthly_tweet_budget, warn_threshold_percent) in the dev Postgres.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-10T01:16:37Z
- **Completed:** 2026-04-10T01:20:25Z
- **Tasks:** 3
- **Files created:** 3 (schema, migration SQL, snapshot)
- **Files modified:** 3 (social-profiles schema, barrel, journal)

## Accomplishments

- Created `postAttempts` Drizzle table with all 10 columns from D-16, the `post_attempt_outcome` enum, cascade FK to `posts.id`, and the `post_attempts_post_started_idx` compound index for the SCHED-04 history modal.
- Added `monthly_tweet_budget integer NOT NULL DEFAULT 500` and `warn_threshold_percent integer NOT NULL DEFAULT 80` to `social_profiles` per D-22 / LIMIT-01 / LIMIT-02.
- Registered `postAttempts`, `postAttemptOutcome`, and the `PostAttempt` / `NewPostAttempt` row types in the `@sms/db` barrel so Plans 02-06 can import via `@sms/db`.
- Generated `0002_phase-04-publish-worker.sql` via `drizzle-kit generate` and applied it to the live dev Postgres via `drizzle-kit migrate`. Verified the DDL landed with `psql \d post_attempts` (10 columns, FK + index present) and a round-trip INSERT/ROLLBACK confirming the new defaults (`500 | 80`).

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-executor protocol):

1. **Task 1: Create post_attempts Drizzle schema file** — `ebde4ba` (feat)
2. **Task 2: Add rate-limit columns and register postAttempts in barrel** — `fd21d02` (feat)
3. **Task 3: [BLOCKING] Generate and apply Drizzle migration** — `c540b23` (feat)

## Files Created/Modified

- `packages/db/src/schema/post-attempts.ts` — New Drizzle table + enum + row types per D-16.
- `packages/db/src/schema/social-profiles.ts` — Added `monthlyTweetBudget` / `warnThresholdPercent` next to `tokenEncryptionVersion`; no other columns touched.
- `packages/db/src/schema/index.ts` — Re-exports `postAttempts`, `postAttemptOutcome`, `PostAttempt`, `NewPostAttempt`.
- `packages/db/drizzle/0002_phase-04-publish-worker.sql` — Generated migration (CREATE TYPE, CREATE TABLE post_attempts, two ALTER TABLE social_profiles, FK, index).
- `packages/db/drizzle/meta/0002_snapshot.json` — Drizzle snapshot for the new migration.
- `packages/db/drizzle/meta/_journal.json` — New entry for `0002_phase-04-publish-worker` appended.

## Decisions Made

- Kept the two rate-limit columns grouped right next to `tokenEncryptionVersion` (alphabetical ordering was not the file's existing style — it groups OAuth/config rows). This preserves the file's conventions per Task 2's "Do NOT reorder existing columns" guidance.
- Did not add CHECK constraints in the DB; validation (`1 ≤ budget ≤ 10000`, `1 ≤ warnThresholdPercent ≤ 99`) is deferred to the Plan 02 Zod schema per D-22 and threat register T-04-01-04.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migrations directory path mismatch**
- **Found during:** Task 3 (migration generation step)
- **Issue:** The plan's `<verify>` and acceptance criteria reference `packages/db/migrations/`, but the actual `drizzle.config.ts` writes to `packages/db/drizzle/` (the dir established in Phases 1-3 — `0000_daily_invaders.sql`, `0001_next_phalanx.sql` already live there, and `packages/db/src/migrate.ts` resolves `../drizzle`). Running drizzle-kit generate against the existing config already outputs to `drizzle/`.
- **Fix:** Used the real output dir (`packages/db/drizzle/`) instead of creating a parallel `migrations/` tree. Ran the plan's verify node snippet against `packages/db/drizzle` — still confirms all required DDL strings are present.
- **Files modified:** None (config unchanged — the plan's path was aspirational; the real config was correct)
- **Verification:** `node -e "..."` snippet run against `packages/db/drizzle` returned `ok 0002_phase-04-publish-worker.sql`.
- **Committed in:** c540b23 (Task 3 commit)

**2. [Rule 3 - Blocking] Worktree was missing pnpm dependencies**
- **Found during:** Task 3 prep (drizzle-kit exec)
- **Issue:** Fresh worktree at `.claude/worktrees/agent-a1c5abcc` had no `node_modules/`, so `pnpm --filter @sms/db exec drizzle-kit` would have failed.
- **Fix:** Ran `pnpm install --prefer-offline` at the worktree root. Lockfile was already up to date so nothing was modified in `pnpm-lock.yaml` / `package.json`.
- **Files modified:** None committed (node_modules is gitignored)
- **Verification:** `drizzle-kit generate` and `drizzle-kit migrate` both ran successfully afterward.
- **Committed in:** N/A (infra step, not a source change)

---

**Total deviations:** 2 (both Rule 3 blocking; neither required source changes)
**Impact on plan:** No scope creep. The plan's schema content landed verbatim; only the operational path to run drizzle-kit and the verifier's expected directory name were adjusted.

## Issues Encountered

- Worktree HEAD started on the initial-commit branch rather than the expected Phase 4 planning base (`425c4ff`). Resolved per the worktree_branch_check protocol with a `git reset --hard 425c4ff…` before doing any other work. Three task commits now sit cleanly on top of `425c4ff`.

## Commands Used to Verify

```bash
# Task 1 schema present
node -e "const s=require('fs').readFileSync('packages/db/src/schema/post-attempts.ts','utf8'); ['postAttempts','post_attempts','postAttemptOutcome','onDelete','cascade','post_attempts_post_started_idx'].forEach(n=>{if(!s.includes(n)){console.error('missing:',n);process.exit(1)}}); console.log('ok')"

# Task 2 schema present + tsc compiles
node -e "const fs=require('fs');const sp=fs.readFileSync('packages/db/src/schema/social-profiles.ts','utf8');const idx=fs.readFileSync('packages/db/src/schema/index.ts','utf8');if(!sp.includes(\"integer('monthly_tweet_budget').notNull().default(500)\"))process.exit(1);if(!sp.includes(\"integer('warn_threshold_percent').notNull().default(80)\"))process.exit(1);if(!idx.includes('post-attempts'))process.exit(1);console.log('ok')"
pnpm -F @sms/db exec tsc --noEmit

# Task 3 migration generated and applied
pnpm --filter @sms/db exec drizzle-kit generate --name phase-04-publish-worker
pnpm --filter @sms/db exec drizzle-kit migrate

# DB introspection
docker exec social-media-scheduler-postgres-1 psql -U scheduler -d scheduler -c "\d post_attempts"
docker exec social-media-scheduler-postgres-1 psql -U scheduler -d scheduler -c "SELECT column_name, column_default FROM information_schema.columns WHERE table_name='social_profiles' AND column_name IN ('monthly_tweet_budget','warn_threshold_percent');"

# Default round-trip (rolled back)
docker exec -i social-media-scheduler-postgres-1 psql -U scheduler -d scheduler -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
INSERT INTO users (id,email,password_hash) VALUES ('00000000-0000-0000-0000-0000000abcde','verify-04-01@example.com','dummy') ON CONFLICT (email) DO NOTHING;
INSERT INTO social_profiles (id,user_id,platform) VALUES ('00000000-0000-0000-0000-0000000abcde','00000000-0000-0000-0000-0000000abcde','twitter');
SELECT monthly_tweet_budget, warn_threshold_percent FROM social_profiles WHERE id='00000000-0000-0000-0000-0000000abcde';
ROLLBACK;
SQL
```

Expected results (all confirmed):
- `\d post_attempts` shows 10 columns, PK on `id`, FK `post_attempts_post_id_posts_id_fk ... ON DELETE CASCADE`, index `post_attempts_post_started_idx btree (post_id, started_at)`
- `social_profiles` query returns `monthly_tweet_budget | 500` and `warn_threshold_percent | 80`
- Round-trip SELECT returns `500 | 80`

## User Setup Required

None — no external service configuration required. All work is DB schema + migration, applied to the already-running local dev Postgres container.

## Known Stubs

None. The migration is concrete DDL, the Drizzle schema exports real types, and the barrel is wired up. No placeholder data flows to the UI in this plan.

## Next Phase Readiness

- Plan 02 can consume `postAttempts` + `monthlyTweetBudget` / `warnThresholdPercent` from `@sms/db` to build the Zod schemas and rate-limit helper.
- Plan 03 (publish worker) can insert `post_attempts` rows via the new table.
- Plan 04 (API history route) can query `postAttempts` for `GET /api/posts/:id/history` — closing the WORKER-06 → SCHED-04 user-observable loop.
- No blockers. The live dev Postgres is in sync with `0002_phase-04-publish-worker.sql`.

## Self-Check: PASSED

**Files created:**
- FOUND: packages/db/src/schema/post-attempts.ts
- FOUND: packages/db/drizzle/0002_phase-04-publish-worker.sql
- FOUND: packages/db/drizzle/meta/0002_snapshot.json

**Files modified:**
- FOUND: packages/db/src/schema/social-profiles.ts (monthlyTweetBudget + warnThresholdPercent present)
- FOUND: packages/db/src/schema/index.ts (post-attempts re-export present)
- FOUND: packages/db/drizzle/meta/_journal.json (0002 entry present)

**Commits:**
- FOUND: ebde4ba (Task 1)
- FOUND: fd21d02 (Task 2)
- FOUND: c540b23 (Task 3)

**Live DB:**
- FOUND: post_attempts table (10 columns) via `\d post_attempts`
- FOUND: social_profiles.monthly_tweet_budget default 500
- FOUND: social_profiles.warn_threshold_percent default 80

---
*Phase: 04-publish-worker-scheduled-posts*
*Plan: 01*
*Completed: 2026-04-10*
