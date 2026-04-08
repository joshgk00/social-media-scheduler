---
phase: 01-infrastructure-foundation
reviewed: 2026-04-07T12:00:00Z
depth: standard
files_reviewed: 42
files_reviewed_list:
  - .dockerignore
  - .env.example
  - .gitignore
  - docker-compose.dev.yml
  - docker-compose.yml
  - Dockerfile
  - nginx/nginx.conf
  - package.json
  - packages/api/package.json
  - packages/api/src/__tests__/health.test.ts
  - packages/api/src/__tests__/logger.test.ts
  - packages/api/src/__tests__/middleware.test.ts
  - packages/api/src/app.ts
  - packages/api/src/index.ts
  - packages/api/src/middleware/correlation-id.ts
  - packages/api/src/middleware/csrf.ts
  - packages/api/src/middleware/error-handler.ts
  - packages/api/src/middleware/logger.ts
  - packages/api/src/middleware/security-headers.ts
  - packages/api/src/routes/health.ts
  - packages/api/tsconfig.json
  - packages/db/drizzle.config.ts
  - packages/db/package.json
  - packages/db/src/client.ts
  - packages/db/src/index.ts
  - packages/db/src/migrate.ts
  - packages/db/src/schema/index.ts
  - packages/shared/package.json
  - packages/shared/src/__tests__/encryption.test.ts
  - packages/shared/src/encryption.ts
  - packages/shared/src/index.ts
  - packages/shared/tsconfig.json
  - packages/shared/vitest.config.ts
  - packages/web/index.html
  - packages/web/package.json
  - packages/web/src/App.tsx
  - packages/web/src/main.tsx
  - packages/worker/package.json
  - packages/worker/src/__tests__/heartbeat.test.ts
  - packages/worker/src/heartbeat.ts
  - packages/worker/src/index.ts
  - pnpm-workspace.yaml
  - tsconfig.base.json
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-04-07T12:00:00Z
**Depth:** standard
**Files Reviewed:** 42
**Status:** issues_found

## Summary

Phase 1 establishes the monorepo structure (pnpm workspaces), Docker infrastructure, API server with middleware (correlation ID, CSRF, security headers, structured logging), database migration infrastructure (Drizzle ORM + postgres driver), AES-256-GCM encryption module, worker heartbeat, and nginx reverse proxy. The overall code quality is solid -- clean separation of concerns, proper dependency injection in `createApp`, good test coverage for the encryption module and health endpoint, and correct use of the recommended technology stack.

Two critical issues need attention: the migration path resolution will break in production Docker containers, and the nginx config references a Vite dev server in the production `location /` block which means no frontend will be served in production. Four warnings cover unhandled promise rejections in the worker heartbeat, weakened CSRF session identifiers, and loose typing.

## Critical Issues

### CR-01: Migration folder path resolves relative to CWD, will fail in production Docker

**File:** `packages/db/src/migrate.ts:8`
**Issue:** `migrationsFolder: './drizzle'` resolves relative to `process.cwd()`, not relative to the file. In the Docker production image, `pnpm deploy --filter=@sms/api --prod /prod/api` copies runtime dependencies to `/prod/api`, but the `drizzle/` directory containing SQL migration files is not a dependency -- it's a sibling directory of `src/`. When the API starts with `WORKDIR /app` and calls `runMigrations()`, it looks for `/app/drizzle` which won't contain the migration SQL files.
**Fix:** Use `path.resolve` with `import.meta.url` to resolve relative to the module file, or use a `dirname`-based approach:
```typescript
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(databaseUrl: string) {
  const migrationClient = postgres(databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  await migrationClient.end();
}
```
Additionally, the Dockerfile needs to copy the `drizzle/` directory into the production image. Add a COPY step to the `api-production` stage:
```dockerfile
FROM base AS api-production
RUN apk add --no-cache ffmpeg wget
COPY --from=api-deploy /prod/api /app
COPY --from=build /app/packages/db/drizzle /app/drizzle
WORKDIR /app
```

### CR-02: Production nginx proxies frontend requests to non-existent Vite dev server

**File:** `nginx/nginx.conf:50-60`
**Issue:** The `location /` block proxies all frontend requests to `http://web:5173`, which is a Vite dev server. The base `docker-compose.yml` (production) does not define a `web` service. Only `docker-compose.dev.yml` adds the web dev container. In production, all non-API requests will return 502 Bad Gateway because there is no upstream `web:5173` to connect to. The frontend needs to be built to static assets and served directly by nginx in production.
**Fix:** Serve static files from a volume in production and keep the dev proxy only in the dev override. In `nginx/nginx.conf`, replace the dev proxy with static file serving:
```nginx
location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
}
```
Then in `docker-compose.yml`, add a build step that copies the built frontend assets:
```yaml
nginx:
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - web_dist:/usr/share/nginx/html:ro
```
Or use a separate nginx config for dev vs production. The dev override can use a bind-mount nginx config that proxies to the Vite dev server.

## Warnings

### WR-01: Unhandled promise rejection in worker heartbeat tick

**File:** `packages/worker/src/heartbeat.ts:9`
**Issue:** The `tick()` function calls `redis.set()` which returns a Promise, but the return value is never awaited or caught. If Redis becomes unreachable after startup, every 30-second heartbeat tick fires an unhandled promise rejection. Since Node.js 15+, the default `--unhandled-rejections` mode is `throw`, which will crash the worker process.
**Fix:** Add a `.catch()` to the Redis call:
```typescript
const tick = () => {
  redis.set(HEARTBEAT_KEY, Date.now().toString(), 'EX', HEARTBEAT_TTL_SECONDS)
    .catch((err) => {
      // Log but don't crash -- heartbeat is non-critical and will retry on next interval
    });
};
```
Note: you'll need to import or pass a logger to the heartbeat module, or use `console.error` as a minimal fallback.

### WR-02: CSRF session identifier falls back to shared 'anonymous' for all unauthenticated users

**File:** `packages/api/src/middleware/csrf.ts:8`
**Issue:** `getSessionIdentifier` returns `req.session?.id ?? 'anonymous'`. Before session middleware is added (planned for a later phase), every request gets the same session identifier `'anonymous'`. This means CSRF tokens are interchangeable between all users, weakening the protection. An attacker who obtains any valid CSRF token can use it for any other user's session.
**Fix:** This is acceptable as a temporary state since the app is single-user and sessions aren't implemented yet. Add a comment documenting the TODO and the security implication:
```typescript
getSessionIdentifier: (req) => {
  // TODO(phase-2): Replace with actual session ID once express-session is wired up.
  // Until then, single shared identifier is acceptable for single-user app.
  return (req as any).session?.id ?? 'anonymous';
},
```

### WR-03: Worker startup has no Redis connection error handling

**File:** `packages/worker/src/index.ts:15-17`
**Issue:** `new Redis(REDIS_URL)` and `startHeartbeat(redis)` execute at the top level. If Redis is unreachable at startup, the first `redis.set` in `startHeartbeat` will produce an unhandled rejection. Unlike the API service which checks `depends_on: redis: condition: service_healthy` in production compose, the worker should still handle the case where Redis goes down after initial connection.
**Fix:** Wrap startup in an async main function with proper error handling, similar to how `packages/api/src/index.ts` does it:
```typescript
async function main() {
  const redis = new Redis(REDIS_URL);
  await redis.ping(); // verify connection before proceeding
  const heartbeatInterval = startHeartbeat(redis);
  logger.info('Worker started, heartbeat active');

  const shutdown = async () => {
    logger.info('Worker shutting down...');
    stopHeartbeat(heartbeatInterval);
    redis.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start worker');
  process.exit(1);
});
```

### WR-04: Health endpoint parseInt on Redis value produces confusing output when data is corrupt

**File:** `packages/api/src/routes/health.ts:31-36`
**Issue:** `parseInt(lastHeartbeat, 10)` on a corrupted or non-numeric Redis value returns `NaN`. `new Date(NaN).toISOString()` throws a `RangeError: Invalid time value`, which would be caught by the outer try/catch and result in `{ alive: false, lastHeartbeat: null }`. The behavior is technically safe, but the error is misleading -- it looks like Redis failed when actually Redis returned corrupt data.
**Fix:** Add a numeric validation check:
```typescript
const heartbeatMs = Number(lastHeartbeat);
const workerAlive = Number.isFinite(heartbeatMs)
  ? Date.now() - heartbeatMs < 60_000
  : false;
checks.worker = {
  alive: workerAlive,
  lastHeartbeat: Number.isFinite(heartbeatMs)
    ? new Date(heartbeatMs).toISOString()
    : null,
};
```

## Info

### IN-01: Postgres password env var has no default -- empty string if unset

**File:** `docker-compose.yml:6`
**Issue:** `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}` has no default value (unlike `POSTGRES_USER` and `POSTGRES_DB` which use `:-scheduler`). If `.env` is missing or the variable isn't set, Docker Compose substitutes an empty string, starting Postgres with no password. This could happen during initial setup before the user creates `.env`.
**Fix:** Either add a validation step or a placeholder default that makes the error obvious:
```yaml
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env}
```

### IN-02: `sql` parameter typed as `any` in AppDependencies

**File:** `packages/api/src/app.ts:14`
**Issue:** `sql: any` in the `AppDependencies` interface loses all type safety for the database client. Any typo or incorrect method call on `sql` will not be caught at compile time.
**Fix:** Import and use the proper type from the `postgres` package:
```typescript
import type { Sql } from 'postgres';

interface AppDependencies {
  redis: Redis;
  sql: Sql;
}
```

### IN-03: `.env.example` file is missing from the repository

**File:** `.env.example` (referenced in `.gitignore` line 5 but does not exist)
**Issue:** `.gitignore` explicitly un-ignores `.env.example` (`!.env.example`), but the file doesn't exist in the repository. Users cloning the repo have no reference for what environment variables are required. The API entrypoint (`packages/api/src/index.ts`) requires `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, and `CSRF_SECRET`. Docker Compose also needs `POSTGRES_PASSWORD`.
**Fix:** Create `.env.example` with all required variables documented:
```
DATABASE_URL=postgres://scheduler:changeme@localhost:5432/scheduler
REDIS_URL=redis://localhost:6379
POSTGRES_USER=scheduler
POSTGRES_PASSWORD=changeme
POSTGRES_DB=scheduler
ENCRYPTION_KEY=<64 hex characters - generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
CSRF_SECRET=<64+ character random string>
```

---

_Reviewed: 2026-04-07T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
