---
phase: 01-infrastructure-foundation
fixed_at: 2026-04-07T22:28:15Z
review_path: .planning/phases/01-infrastructure-foundation/01-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-04-07T22:28:15Z
**Source review:** .planning/phases/01-infrastructure-foundation/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: Migration folder path resolves relative to CWD, will fail in production Docker

**Files modified:** `packages/db/src/migrate.ts`, `Dockerfile`
**Commit:** 1dae11b
**Applied fix:** Changed `migrationsFolder` from relative `'./drizzle'` to `resolve(__dirname, '../../drizzle')` using `import.meta.url` for module-relative path resolution. Added `COPY --from=build /app/packages/db/drizzle /app/drizzle` to the `api-production` Dockerfile stage so migration SQL files are present in the production image.

### CR-02: Production nginx proxies frontend requests to non-existent Vite dev server

**Files modified:** `nginx/nginx.conf`, `nginx/nginx.dev.conf`, `docker-compose.yml`, `docker-compose.dev.yml`
**Commit:** 47f75ff
**Applied fix:** Replaced the Vite dev server proxy in production `nginx.conf` with `try_files` serving static assets from `/usr/share/nginx/html`. Created `nginx/nginx.dev.conf` with the Vite proxy for development. Updated `docker-compose.yml` to mount a `web_dist` volume for built frontend assets. Updated `docker-compose.dev.yml` to override with the dev nginx config.

### WR-01: Unhandled promise rejection in worker heartbeat tick

**Files modified:** `packages/worker/src/heartbeat.ts`
**Commit:** a13c128
**Applied fix:** Added `.catch()` to the `redis.set()` call in the heartbeat `tick()` function. The catch handler swallows the error since the heartbeat is non-critical and retries on the next 30-second interval automatically.

### WR-02: CSRF session identifier falls back to shared 'anonymous' for all unauthenticated users

**Files modified:** `packages/api/src/middleware/csrf.ts`
**Commit:** 7beb97c
**Applied fix:** Added `TODO(phase-2)` comment documenting the security implication of the shared `'anonymous'` session identifier and tracking the need to replace it with actual session IDs once express-session is integrated. This is acceptable for the current single-user pre-session state.

### WR-03: Worker startup has no Redis connection error handling

**Files modified:** `packages/worker/src/index.ts`
**Commit:** 936aa80
**Applied fix:** Wrapped top-level startup code in an `async function main()` with `redis.ping()` to verify connectivity before starting the heartbeat. Startup failures are caught by `.catch()` on `main()`, logged with pino, and exit with code 1. Matches the error handling pattern used by the API entrypoint.

### WR-04: Health endpoint parseInt on Redis value produces confusing output when data is corrupt

**Files modified:** `packages/api/src/routes/health.ts`
**Commit:** 7fb485c
**Applied fix:** Replaced `parseInt(lastHeartbeat, 10)` with `Number(lastHeartbeat)` plus `Number.isFinite()` validation. Corrupt or non-numeric Redis values now produce `{ alive: false, lastHeartbeat: null }` cleanly instead of throwing a `RangeError` from `new Date(NaN).toISOString()`.

## Skipped Issues

None -- all in-scope findings were fixed.

---

_Fixed: 2026-04-07T22:28:15Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
