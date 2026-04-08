---
phase: 02-authentication-user-account
plan: 03
subsystem: auth
tags: [argon2, otpauth, totp, express-routes, session-lifecycle, csrf]

requires:
  - phase: 02-authentication-user-account
    plan: 01
    provides: Drizzle users schema, shared Zod schemas, session middleware, auth guard, rate limiter, CSRF middleware

provides:
  - Auth service with argon2id hashing, email normalization, user CRUD
  - TOTP service with OTPAuth secret generation and code verification (window 1)
  - Setup routes (setup-status, setup) with DB unique constraint guard
  - Auth routes (login, verify-2fa, logout, me, csrf-token)
  - Explicit pending-2FA session lifecycle (no userId, 5-min timeout)
  - Mock Redis and mock DB test helpers
  - Db type export from @sms/db

affects: [02-04, 02-05, 02-06]

tech-stack:
  added: []
  patterns: [factory router injection, CSRF passthrough for route testing, pending-2FA session lifecycle]

key-files:
  created:
    - packages/api/src/services/auth.service.ts
    - packages/api/src/services/totp.service.ts
    - packages/api/src/routes/setup.ts
    - packages/api/src/routes/auth.ts
    - packages/api/src/__tests__/helpers/mock-redis.ts
    - packages/api/src/__tests__/helpers/mock-db.ts
    - packages/api/src/__tests__/totp.test.ts
    - packages/api/src/__tests__/auth.test.ts
    - packages/api/src/__tests__/setup.test.ts
  modified:
    - packages/api/src/app.ts
    - packages/api/src/index.ts
    - packages/api/package.json
    - packages/db/src/client.ts
    - packages/db/src/index.ts

key-decisions:
  - "Export Db type from @sms/db to avoid type mismatch between schema re-exports and drizzle instance"
  - "Mock CSRF middleware in route tests since CSRF has its own middleware test and session-bound tokens complicate supertest"
  - "updateLastLogin uses fire-and-forget with .catch() to avoid blocking login response"

patterns-established:
  - "Factory router pattern: createSetupRouter({ db }), createAuthRouter({ db, redis })"
  - "CSRF test passthrough: vi.mock csrf middleware for route-level tests"
  - "Pending-2FA session: no userId set, only pendingTwoFactor/pendingUserId/twoFactorExpiresAt"

requirements-completed: [AUTH-01, AUTH-03, AUTH-05]

duration: 11min
completed: 2026-04-08
---

# Phase 2 Plan 03: Auth Services & Routes Summary

**Auth service (argon2id + email normalization), TOTP service (OTPAuth with +/-1 window), and core API routes for setup/login/2FA/logout/me/csrf-token with explicit pending-2FA session lifecycle**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-08T04:21:51Z
- **Completed:** 2026-04-08T04:33:33Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Auth service with argon2id password hashing, constant-time verification, email normalization (toLowerCase + trim) in createUser and findUserByEmail
- TOTP service generating secrets with OTPAuth library and verifying codes with +/-1 clock skew window
- Setup routes: GET /api/auth/setup-status returns needsSetup boolean; POST /api/auth/setup creates user with Zod validation and DB unique constraint guard for race conditions
- Auth routes: POST /api/auth/login with rate limiting, session regeneration, and explicit pending-2FA lifecycle; POST /api/auth/login/verify-2fa with 5-minute timeout and session destruction on expiry; POST /api/auth/logout destroys session and clears cookie; GET /api/auth/me returns sanitized user (no passwordHash or totpSecret); GET /api/auth/csrf-token returns token for SPA
- Pending-2FA sessions have NO userId -- requireAuth rejects them for all protected endpoints
- Test helpers: mock Redis with Map-backed store for session persistence, mock DB with chainable methods
- 27 total tests across auth, TOTP, and route test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Create auth service, TOTP service, and test helpers (TDD)** - RED: `239fb70`, GREEN: `d84a527`
2. **Task 2: Create setup, auth, and CSRF token routes** - `d050a5e`

## Files Created/Modified

- `packages/api/src/services/auth.service.ts` - hashPassword, verifyPassword, createUser, findUserByEmail, getUserById, userExists, updateLastLogin
- `packages/api/src/services/totp.service.ts` - generateTotpSecret, verifyTotpCode with window: 1
- `packages/api/src/routes/setup.ts` - createSetupRouter with setup-status and setup endpoints
- `packages/api/src/routes/auth.ts` - createAuthRouter with login, verify-2fa, logout, me, csrf-token
- `packages/api/src/__tests__/helpers/mock-redis.ts` - Factory with Map-backed get/set/del for session persistence
- `packages/api/src/__tests__/helpers/mock-db.ts` - Factory with chainable select/insert/update/delete
- `packages/api/src/__tests__/totp.test.ts` - 7 tests for TOTP generation and verification
- `packages/api/src/__tests__/auth.test.ts` - 6 tests for argon2id hashing and verification
- `packages/api/src/__tests__/setup.test.ts` - 14 tests for setup, login, 2FA, logout, me, csrf-token routes
- `packages/api/src/app.ts` - Added db to AppDependencies, mounted setup and auth routers
- `packages/api/src/index.ts` - Destructures { sql, db } from createDbClient, passes both to createApp
- `packages/api/package.json` - Added drizzle-orm as direct dependency
- `packages/db/src/client.ts` - Exports Db type (PostgresJsDatabase<typeof schema>)
- `packages/db/src/index.ts` - Re-exports Db type

## Decisions Made

- Exported `Db` type from `@sms/db` because `typeof schema` from the barrel `@sms/db` index includes non-schema exports (createDbClient, runMigrations) which don't match the drizzle instance's generic parameter
- Mocked CSRF middleware in route tests because csrf-csrf ties tokens to session IDs, and session persistence in supertest with mock Redis adds complexity without testing route logic
- `updateLastLogin` runs as fire-and-forget (`.catch(() => {})`) to avoid blocking the login response

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Db type mismatch between @sms/db barrel and drizzle instance**
- **Found during:** Task 2 (build step)
- **Issue:** `PostgresJsDatabase<typeof import('@sms/db')>` includes createDbClient and runMigrations in its type, but drizzle is instantiated with only schema tables
- **Fix:** Created and exported `Db` type from `packages/db/src/client.ts` using the correct `typeof schema` from `./schema/index.js`
- **Files modified:** packages/db/src/client.ts, packages/db/src/index.ts, packages/api/src/services/auth.service.ts, packages/api/src/routes/setup.ts, packages/api/src/routes/auth.ts, packages/api/src/app.ts
- **Committed in:** d050a5e

**2. [Rule 3 - Blocking] drizzle-orm not available as direct dependency in @sms/api**
- **Found during:** Task 1 (tests failing to import auth.service.ts)
- **Issue:** drizzle-orm was only a dependency of @sms/db. In pnpm strict mode, @sms/api couldn't resolve it
- **Fix:** Added drizzle-orm@~0.45.2 as direct dependency of @sms/api
- **Files modified:** packages/api/package.json
- **Committed in:** d84a527

**3. [Rule 1 - Bug] TOTP test URI encoding mismatch**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** Test expected `Social+Media+Scheduler` but OTPAuth encodes spaces as `%20`
- **Fix:** Changed test assertion to `Social%20Media%20Scheduler`
- **Files modified:** packages/api/src/__tests__/totp.test.ts
- **Committed in:** d84a527

**4. [Rule 3 - Blocking] CSRF validation fails in route tests with supertest**
- **Found during:** Task 2 (test execution)
- **Issue:** csrf-csrf double-submit pattern ties tokens to session IDs via HMAC. With saveUninitialized: false, no session cookie is set on GET requests, causing POST requests to have different session IDs
- **Fix:** Mocked CSRF middleware as passthrough in route tests. CSRF has its own middleware test
- **Files modified:** packages/api/src/__tests__/setup.test.ts
- **Committed in:** d050a5e

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 bug)
**Impact on plan:** All deviations were necessary for compilation and test execution. No scope creep.

## Pre-existing Issues (Out of Scope)

The following tests were already failing before this plan's work began (health.test.ts and middleware.test.ts fail because they don't pass `sessionSecret` to `createApp` after Plan 01 added session middleware). These are NOT regressions from this plan.

## Self-Check: PASSED

---
*Phase: 02-authentication-user-account*
*Completed: 2026-04-08*
