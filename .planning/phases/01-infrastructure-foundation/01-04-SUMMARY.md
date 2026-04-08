---
phase: 01-infrastructure-foundation
plan: 04
subsystem: api, worker
tags: [express, pino, helmet, csrf, health-endpoint, heartbeat, middleware, security]

requires:
  - phase: 01-01
    provides: pnpm monorepo with workspace packages, Drizzle ORM, TypeScript config
provides:
  - Express 5 app factory with full security middleware stack
  - GET /health endpoint with postgres, redis, worker heartbeat checks
  - Worker heartbeat writing to Redis every 30s
  - Structured JSON logging with sensitive data redaction
  - CSRF protection via Double Submit Cookie pattern
  - Correlation ID middleware on all HTTP requests
affects: [01-05, 02-auth, 03-twitter, 04-publish-worker]

tech-stack:
  added: [express@5.2.1, pino@10.3.1, pino-http@11.0.0, helmet@8.1.0, csrf-csrf@4.0.3, cookie-parser@1.4.7, ioredis@5.10.1, bullmq@5.73.0, supertest@7.2.2, pino-pretty@13.1.3, nodemon@3.1.14]
  patterns: [express-app-factory, dependency-injection-for-testability, middleware-stack-ordering, redis-heartbeat-with-ttl, pino-redaction]

key-files:
  created:
    - packages/api/src/app.ts
    - packages/api/src/index.ts
    - packages/api/src/routes/health.ts
    - packages/api/src/middleware/correlation-id.ts
    - packages/api/src/middleware/csrf.ts
    - packages/api/src/middleware/security-headers.ts
    - packages/api/src/middleware/logger.ts
    - packages/api/src/middleware/error-handler.ts
    - packages/api/src/__tests__/health.test.ts
    - packages/api/src/__tests__/middleware.test.ts
    - packages/api/src/__tests__/logger.test.ts
    - packages/worker/src/heartbeat.ts
    - packages/worker/src/index.ts
    - packages/worker/src/__tests__/heartbeat.test.ts
  modified:
    - packages/api/package.json
    - packages/worker/package.json
    - packages/api/tsconfig.json
    - packages/db/package.json
    - pnpm-lock.yaml

key-decisions:
  - "csrf-csrf v4 requires getSessionIdentifier -- used session.id fallback to 'anonymous' for pre-auth state"
  - "pino-http named import (not default) for TypeScript ESM compatibility"
  - "Correlation ID set on response header explicitly in middleware, not relying on pino-http header behavior"
  - "Fixed db package.json main/types to point to barrel export (dist/index.js) instead of dist/client.js"
  - "Excluded __tests__ from tsc build to avoid test-only type issues"

patterns-established:
  - "Express app factory pattern: createApp({ redis, sql }) returns configured Express app -- fully testable without real services"
  - "Middleware ordering: correlationId -> httpLogger -> securityHeaders -> json -> cookieParser -> csrf -> routes -> errorHandler"
  - "Health endpoint dependency injection: accepts redis and sql, returns status per dependency"
  - "Worker heartbeat pattern: redis.set('worker:heartbeat', timestamp, 'EX', ttl) every 30s"

requirements-completed: [INFRA-06, INFRA-07, INFRA-08, INFRA-09, SEC-05, SEC-06]

duration: 5min
completed: 2026-04-07
---

# Phase 01 Plan 04: Express API Server & Worker Heartbeat Summary

**Express 5 app factory with correlation ID, CSRF, helmet, pino logging with redaction, health endpoint checking postgres/redis/worker, and Redis heartbeat every 30s**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-07T20:03:59Z
- **Completed:** 2026-04-07T20:09:50Z
- **Tasks:** 2
- **Files created:** 14
- **Files modified:** 5

## Accomplishments

- Express 5 API with testable app factory pattern accepting injected redis and sql dependencies
- Full middleware stack in correct order: correlation ID, pino-http logging, helmet security headers, JSON body parser, cookie parser, CSRF protection, error handler
- GET /health endpoint returning structured JSON with postgres, redis, worker heartbeat, pendingJobs, lastPublish status
- Health returns 200 when all dependencies healthy, 503 when degraded
- Worker heartbeat writing timestamp to Redis every 30s with 120s TTL
- Worker entry point with graceful SIGTERM/SIGINT shutdown
- API entry point running migrations before server start, validating DATABASE_URL, REDIS_URL, ENCRYPTION_KEY, CSRF_SECRET
- Structured JSON logging with redaction of authorization, cookie, and set-cookie headers
- 14 tests passing across health, middleware, logger, and heartbeat test suites

## Task Commits

1. **Task 1: Install API/worker dependencies and create middleware stack** - `4908721` (feat)
2. **Task 2 RED: Failing tests for health, middleware, logger, heartbeat** - `3d8fbf1` (test)
3. **Task 2 GREEN: Implement health endpoint, app factory, worker heartbeat** - `f8ad2d5` (feat)

## Files Created/Modified

- `packages/api/src/app.ts` - Express app factory with middleware stack and health router mount
- `packages/api/src/index.ts` - API entry point with migration runner, env validation, graceful shutdown
- `packages/api/src/routes/health.ts` - GET /health with postgres, redis, worker heartbeat checks
- `packages/api/src/middleware/correlation-id.ts` - UUID correlation ID from X-Request-ID header or crypto.randomUUID
- `packages/api/src/middleware/csrf.ts` - csrf-csrf Double Submit Cookie with SameSite=Strict
- `packages/api/src/middleware/security-headers.ts` - Helmet with CSP, X-Content-Type-Options, X-Frame-Options, HSTS
- `packages/api/src/middleware/logger.ts` - Pino with redaction paths for auth/cookie headers
- `packages/api/src/middleware/error-handler.ts` - Global error handler with correlation ID
- `packages/api/src/__tests__/health.test.ts` - 4 tests: status shape, check fields, 200 healthy, 503 degraded
- `packages/api/src/__tests__/middleware.test.ts` - 4 tests: X-Request-Id UUID, security headers, GET allowed, POST without CSRF blocked
- `packages/api/src/__tests__/logger.test.ts` - 3 tests: structured JSON fields, authorization redaction, cookie redaction
- `packages/worker/src/heartbeat.ts` - startHeartbeat/stopHeartbeat with 30s interval and 120s TTL
- `packages/worker/src/index.ts` - Worker entry with heartbeat and graceful shutdown
- `packages/worker/src/__tests__/heartbeat.test.ts` - 3 tests: immediate set, timestamp format, EX TTL

## Decisions Made

- **csrf-csrf v4 API change:** v4 requires `getSessionIdentifier` (not optional). Used `req.session?.id ?? 'anonymous'` since sessions don't exist until Phase 2. This works because CSRF still validates token integrity; the session identifier adds defense-in-depth once sessions are wired.
- **pino-http import:** Used named import `{ pinoHttp }` instead of default import for TypeScript ESM compatibility. Default import caused "not callable" type errors.
- **X-Request-Id header:** Set explicitly in correlation-id middleware via `res.setHeader()`. pino-http's genReqId reads req.id but doesn't consistently set the response header when ID is pre-assigned.
- **db package.json fix:** Changed main/types from `dist/client.js` to `dist/index.js` so `import { runMigrations, createDbClient } from '@sms/db'` resolves correctly.
- **Test exclusion from build:** Added `"exclude": ["src/**/__tests__/**"]` to api tsconfig.json so test files (which use vitest globals and test utilities) don't cause build errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed csrf-csrf v4 requiring getSessionIdentifier**
- **Found during:** Task 1
- **Issue:** csrf-csrf v4.0.3 changed the DoubleCsrfConfigOptions type to require `getSessionIdentifier`. The plan's code omitted it because it was optional in v3.
- **Fix:** Added `getSessionIdentifier: (req) => (req as any).session?.id ?? 'anonymous'` to the csrf config
- **Files modified:** packages/api/src/middleware/csrf.ts
- **Committed in:** 3d8fbf1

**2. [Rule 3 - Blocking] Fixed pino-http default import not callable in ESM**
- **Found during:** Task 2 (build verification)
- **Issue:** `import pinoHttp from 'pino-http'` is not callable with NodeNext module resolution. The types export `pinoHttp` as a named export.
- **Fix:** Changed to `import { pinoHttp } from 'pino-http'` and added explicit `IncomingMessage` type on genReqId parameter
- **Files modified:** packages/api/src/middleware/logger.ts
- **Committed in:** f8ad2d5

**3. [Rule 3 - Blocking] Fixed db package.json pointing to wrong entry**
- **Found during:** Task 2 (build verification)
- **Issue:** `@sms/db` package.json had `"main": "dist/client.js"` but `runMigrations` is exported from `dist/index.js` (barrel export)
- **Fix:** Changed main/types to `dist/index.js` / `dist/index.d.ts`
- **Files modified:** packages/db/package.json
- **Committed in:** f8ad2d5

**4. [Rule 1 - Bug] Fixed X-Request-Id missing from response headers**
- **Found during:** Task 2 (test failure)
- **Issue:** pino-http doesn't set X-Request-Id response header when req.id is pre-assigned by correlation-id middleware
- **Fix:** Added `res.setHeader('X-Request-Id', req.id)` in correlation-id middleware
- **Files modified:** packages/api/src/middleware/correlation-id.ts
- **Committed in:** f8ad2d5

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 bug)
**Impact on plan:** All fixes were necessary for the code to compile, tests to pass, and functionality to work correctly. No scope creep.

## Known Stubs

- `packages/api/src/routes/health.ts:43` - `checks.pendingJobs = 0` -- intentional stub, returns 0 until BullMQ queues exist in Phase 4
- `packages/api/src/routes/health.ts:46` - `checks.lastPublish = null` -- intentional stub, returns null until publish pipeline exists in Phase 4

These stubs do not prevent the plan's goal from being achieved. The health endpoint correctly reports all required fields; these two fields will be wired to real data when their owning phases are implemented.

## Self-Check: PASSED
