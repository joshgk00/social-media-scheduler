---
phase: 02-authentication-user-account
plan: 01
subsystem: auth
tags: [drizzle, express-session, connect-redis, zod, rate-limit, csrf, argon2]

requires:
  - phase: 01-infrastructure-foundation
    provides: Express app factory, Redis client, CSRF middleware, DB migration infrastructure

provides:
  - Drizzle users table schema with auth, settings, and TOTP columns
  - Drizzle security_questions table with composite unique constraint
  - Shared Zod schemas for login, setup, password change, TOTP, settings, and recovery
  - Shared constants for security questions and date formats
  - Express session middleware factory with Redis-backed 24h sliding window
  - Auth guard middleware checking userId and pending-2FA state
  - Rate limiter middleware for login and recovery endpoints
  - Session invalidation service for logout-others and invalidate-all
  - CSRF middleware wired to session ID

affects: [02-02, 02-03, 02-04, 02-05, 02-06]

tech-stack:
  added: [express-session, connect-redis, argon2, otpauth, multer, sharp, express-rate-limit]
  patterns: [session middleware factory injection, SessionData augmentation, Redis SCAN for session management]

key-files:
  created:
    - packages/db/src/schema/users.ts
    - packages/db/src/schema/security-questions.ts
    - packages/shared/src/schemas/auth.ts
    - packages/shared/src/schemas/settings.ts
    - packages/shared/src/schemas/recovery.ts
    - packages/shared/src/constants/security-questions.ts
    - packages/shared/src/constants/date-formats.ts
    - packages/api/src/middleware/session.ts
    - packages/api/src/middleware/auth-guard.ts
    - packages/api/src/middleware/rate-limiter.ts
    - packages/api/src/services/session.service.ts
  modified:
    - packages/db/src/schema/index.ts
    - packages/shared/src/index.ts
    - packages/api/src/middleware/csrf.ts
    - packages/api/src/app.ts
    - packages/api/src/index.ts
    - packages/api/package.json

key-decisions:
  - "RedisStore uses named import with ConstructorParameters type cast for ioredis compatibility"
  - "totpSecret stored plaintext -- self-hosted single-user threat model does not justify encryption complexity"
  - "Per-IP rate limiting sufficient since per-IP and per-account are equivalent for single-user app"

patterns-established:
  - "Session middleware factory: createSessionMiddleware(redis, secret) injected via AppDependencies"
  - "SessionData module augmentation: declare module 'express-session' for custom session fields"
  - "Redis SCAN pattern for session enumeration with documented scalability tradeoff"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

duration: 4min
completed: 2026-04-08
---

# Phase 2 Plan 01: Auth Foundation Summary

**Drizzle user/security-question schemas, shared Zod validation schemas, and Express session/auth-guard/rate-limiter middleware stack wired into the app**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-08T04:09:13Z
- **Completed:** 2026-04-08T04:13:34Z
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments
- Users and security_questions Drizzle schemas with all columns and composite unique constraint
- Shared Zod schemas covering login, setup, password change, TOTP, settings, and recovery validation
- Redis-backed session middleware with 24h sliding window, HTTP-only secure cookies, and correct middleware ordering (session before CSRF)
- Auth guard blocks unauthenticated and partially-authenticated (pending-2FA) requests
- Rate limiters configured with 5 attempts / 15-min lockout for login and recovery

## Task Commits

Each task was committed atomically:

1. **Task 1: Create DB schemas (users and security_questions tables)** - `86faa44` (feat)
2. **Task 2: Create shared Zod schemas, constants, and barrel exports** - `9de42f8` (feat)
3. **Task 3: Install dependencies and wire middleware** - `36efa70` (feat)

## Files Created/Modified
- `packages/db/src/schema/users.ts` - Drizzle users table with auth, settings, TOTP columns
- `packages/db/src/schema/security-questions.ts` - Security questions table with unique(userId, questionIndex)
- `packages/db/src/schema/index.ts` - Barrel exports for both schemas
- `packages/shared/src/schemas/auth.ts` - Login, setup, password change, TOTP Zod schemas
- `packages/shared/src/schemas/settings.ts` - Profile and preferences update schemas
- `packages/shared/src/schemas/recovery.ts` - Recovery and security questions schemas
- `packages/shared/src/constants/security-questions.ts` - 10 predefined security questions
- `packages/shared/src/constants/date-formats.ts` - 8 date formats and entries-per-page options
- `packages/shared/src/index.ts` - Barrel exports for all new schemas and constants
- `packages/api/src/middleware/session.ts` - Express-session factory with RedisStore
- `packages/api/src/middleware/auth-guard.ts` - requireAuth middleware with SessionData augmentation
- `packages/api/src/middleware/rate-limiter.ts` - Login and recovery rate limiters
- `packages/api/src/middleware/csrf.ts` - Removed TODO(phase-2), now reads session ID
- `packages/api/src/services/session.service.ts` - Session invalidation via Redis SCAN
- `packages/api/src/app.ts` - Session middleware wired between cookieParser and CSRF
- `packages/api/src/index.ts` - SESSION_SECRET env var required at startup
- `packages/api/package.json` - Added auth dependencies

## Decisions Made
- Used named import `{ RedisStore }` from connect-redis (v9 does not have default export) with `ConstructorParameters` type cast for ioredis compatibility
- totpSecret stored as plaintext in DB with documented rationale (self-hosted single-user threat model)
- Per-IP rate limiting documented as equivalent to per-account for single-user app

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed RedisStore import and return type**
- **Found during:** Task 3 (session middleware)
- **Issue:** connect-redis v9 exports `RedisStore` as named export, not default. Also needed explicit `RequestHandler` return type to avoid non-portable type inference error.
- **Fix:** Changed `import RedisStore from 'connect-redis'` to `import { RedisStore } from 'connect-redis'`, added `RequestHandler` return type annotation, used `ConstructorParameters` instead of `Parameters` for type cast.
- **Files modified:** packages/api/src/middleware/session.ts
- **Verification:** `pnpm --filter @sms/api build` exits 0
- **Committed in:** 36efa70 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for compilation. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required. SESSION_SECRET env var is added to requireEnv() calls and must be set in the environment before starting the API.

## Next Phase Readiness
- Auth data layer and middleware stack ready for Plan 02 (setup wizard) and Plan 03 (login/logout endpoints)
- All three packages (shared, db, api) build cleanly
- Session middleware ordering verified: cookieParser -> session -> CSRF

---
*Phase: 02-authentication-user-account*
*Completed: 2026-04-08*
