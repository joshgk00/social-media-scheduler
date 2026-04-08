---
phase: 02-authentication-user-account
verified: 2026-04-08T05:30:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "End-to-end login flow with and without 2FA"
    expected: "User can log in, session persists on browser refresh, 2FA prompts when enabled, 5-minute countdown works"
    why_human: "Requires a running dev environment with Redis and PostgreSQL; automated checks cannot verify real session persistence or live 2FA countdown behavior"
  - test: "2FA countdown expiry resets to step 1 with toast"
    expected: "When the 5-minute countdown reaches 0, the page resets to credentials step with toast 'Session expired. Please sign in again.'"
    why_human: "Requires waiting 5 minutes in a live browser environment; cannot verify timer behavior or toast display programmatically"
  - test: "Recovery flow resets password and disables 2FA"
    expected: "After completing 3-step recovery (email + security questions + new password), 2FA is disabled and user can login with new password"
    why_human: "Requires live database and session persistence; Plan 06 Task 3 blocking human checkpoint not yet completed"
  - test: "Settings page saves work across all 3 sections"
    expected: "Profile changes persist, preferences update, password change shows 'Other sessions signed out' toast"
    why_human: "Requires running API with real database writes; cannot verify persistence programmatically without integration test setup"
  - test: "Database schema pushed to PostgreSQL"
    expected: "users and security_questions tables exist with correct columns, foreign keys, and unique constraints"
    why_human: "Schema push was not executed (Docker not available in the worktree during Plan 05 execution); tables may not exist in any running database instance"
---

# Phase 2: Authentication & User Account Verification Report

**Phase Goal:** User can securely access their account, configure personal settings, and protect their session with 2FA
**Verified:** 2026-04-08T05:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| #   | Truth | Status | Evidence |
|-----|-------|--------|---------|
| 1   | User can log in with email and password, and session persists across browser refresh (24-hour sliding window) | ✓ VERIFIED | `session.ts` has `rolling: true`, `maxAge: 24*60*60*1000`, `httpOnly: true`, `sameSite: 'strict'`. `auth.ts` implements login with `req.session.regenerate()` and sets `req.session.userId`. Auth guard enforces session checks. |
| 2   | User can enable TOTP 2FA, and subsequent logins require the TOTP code | ✓ VERIFIED | `settings.ts` POST `/api/settings/2fa/setup` generates secret, POST `/api/settings/2fa/verify` enables it. Login route checks `user.totpEnabled`, sets `pendingTwoFactor=true` without `userId`, enforced by `requireAuth`. `LoginPage.tsx` implements 2-step flow with `useVerify2FA`. |
| 3   | User can change password, disable 2FA, and set security questions from the account page | ✓ VERIFIED | `settings.ts` has PUT `/api/settings/password` (invalidates other sessions), POST `/api/settings/2fa/disable` (requires both password + TOTP per D-20), PUT `/api/settings/security-questions` (argon2 hashed, normalized). `SecuritySection.tsx` with 4 modals wired to these endpoints. |
| 4   | User can configure timezone, date format, profile image, and entries-per-page in settings | ✓ VERIFIED | `settings.ts` has PUT `/api/settings/preferences` and POST `/api/settings/profile/image` (sharp EXIF strip + resize). `PreferencesSection.tsx` uses `DATE_FORMATS` and `ENTRIES_PER_PAGE_OPTIONS` from `@sms/shared`. `ProfileSection.tsx` has avatar upload with instant preview. |

**Score:** 4/4 truths verified

### Must-Have Truths (Plan Frontmatter — merged with ROADMAP SCs)

All plan-level must-have truths were verified against code:

**Plan 01 (Infrastructure):**
- Users table: `packages/db/src/schema/users.ts` — all 17 required columns present, plaintext `totpSecret` decision documented in code comment
- Security questions table: composite unique constraint `unique('uq_user_question').on(table.userId, table.questionIndex)` verified
- Session middleware: `rolling: true`, `maxAge: 24*60*60*1000`, `prefix: 'sms:sess:'`, Redis-backed
- Auth guard: checks `req.session?.userId` AND `req.session.pendingTwoFactor === true`
- Rate limiter: `max: 5`, `windowMs: 15*60*1000`, `skipSuccessfulRequests: true` — documented per-IP rationale
- CSRF: reads `req.session?.id` with `'anonymous'` fallback, no `TODO(phase-2)` comment remaining
- Shared Zod schemas: loginSchema, setupSchema, passwordChangeSchema, totpVerifySchema, totpDisableSchema, profileUpdateSchema, preferencesUpdateSchema, recoveryVerifyEmailSchema, recoveryVerifyAnswersSchema, recoveryResetPasswordSchema, securityQuestionsSchema — all present

**Plan 02 (Frontend Shell):**
- React Router routes for `/login`, `/setup`, `/recover`, `/settings`, `/` — all present
- `ProtectedRoute` redirects to `/login?redirect={path}` when unauthenticated
- `SetupGuard` redirects to `/setup` when `needsSetup: true` AND away from `/setup` when complete
- API client: `x-csrf-token` header, `credentials: 'include'`, CSRF retry on 403
- All 13 shadcn/ui components installed in `packages/web/src/components/ui/`

**Plan 03 (Auth Routes):**
- Auth service: `argon2id` variant, `toLowerCase().trim()` normalization in both `createUser` and `findUserByEmail`
- TOTP service: `window: 1` for +/-1 clock skew
- Login pending-2FA lifecycle: no `userId` set, only `pendingTwoFactor`/`pendingUserId`/`twoFactorExpiresAt`
- 5-minute timeout enforced server-side via `twoFactorExpiresAt`
- GET `/api/auth/me` excludes `passwordHash` and `totpSecret`
- Session regenerated on login (fixation prevention)
- `updateLastLogin` fire-and-forget with `.catch(() => {})`

**Plan 04 (Recovery + Settings):**
- 3-step recovery with `RECOVERY_STATE_TIMEOUT_MS = 10 * 60 * 1000`
- `recoveryVerifiedAt` timestamp stored on verification
- Recovery resets password, sets `totpEnabled: false`, `totpSecret: null`
- `invalidateAllSessions(redis)` called on password reset (D-16)
- `invalidateOtherSessions(redis, sessionID)` called on password change (D-23)
- Answer normalization: `toLowerCase().trim()` only — commented in code
- Security questions GET endpoint returns `{ configured, questionIndices }` (answers never returned)
- Profile image upload: multer MIME whitelist, sharp EXIF strip, 200x200 webp output, old file cleanup

**Plan 05 (Public Pages):**
- `SetupPage.tsx`: 212 lines, email/password/confirmPassword/timezone form, `zodResolver(setupSchema)`, password character count
- `LoginPage.tsx`: 300 lines, two-step flow ('credentials'/'totp'), 5-minute countdown timer (`TOTP_TIMEOUT_SECONDS = 300`), rate limit handling, redirect query param
- `RecoverPage.tsx`: 370 lines, three steps ('email'/'questions'/'reset'), `SECURITY_QUESTIONS` imported, expired state handling resets to step 1

**Plan 06 (Settings Page):**
- `SettingsPage.tsx`: Renders `ProfileSection`, `PreferencesSection`, `SecuritySection`; skeleton loading; `max-w-[640px]`
- `use-settings.ts`: 11 exported hooks including `useSecurityQuestionsStatus`
- `TwoFactorSetupModal.tsx`: QRCodeSVG 200x200, copyable secret
- `SecuritySection.tsx`: 2FA badge, security questions count from `useSecurityQuestionsStatus`, active sessions, last login with relative time
- `SecurityQuestionsModal.tsx`: pre-populates from GET endpoint, mutual exclusion of questions

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/src/schema/users.ts` | Drizzle users table schema | ✓ VERIFIED | All 17 columns, plaintext totpSecret documented |
| `packages/db/src/schema/security-questions.ts` | Security questions with uniqueness constraint | ✓ VERIFIED | `unique('uq_user_question').on(table.userId, table.questionIndex)` |
| `packages/shared/src/schemas/auth.ts` | Zod auth schemas | ✓ VERIFIED | All 5 schemas + types exported |
| `packages/api/src/middleware/session.ts` | Session factory with Redis store | ✓ VERIFIED | `createSessionMiddleware`, rolling=true, 24h |
| `packages/api/src/middleware/auth-guard.ts` | Auth guard middleware | ✓ VERIFIED | `requireAuth`, checks userId AND pendingTwoFactor |
| `packages/api/src/middleware/rate-limiter.ts` | Rate limiters | ✓ VERIFIED | `loginLimiter`, `recoveryLimiter`, max=5, 15min window |
| `packages/api/src/services/auth.service.ts` | Auth service | ✓ VERIFIED | All 7 functions, argon2id, email normalization |
| `packages/api/src/services/totp.service.ts` | TOTP service | ✓ VERIFIED | generateTotpSecret, verifyTotpCode, window=1 |
| `packages/api/src/routes/auth.ts` | Auth routes | ✓ VERIFIED | createAuthRouter, all 5 routes |
| `packages/api/src/routes/setup.ts` | Setup routes | ✓ VERIFIED | createSetupRouter, needsSetup logic, race guard |
| `packages/api/src/routes/recovery.ts` | Recovery routes | ✓ VERIFIED | 3-step flow, state expiry, D-13/D-16 |
| `packages/api/src/routes/settings.ts` | Settings routes | ✓ VERIFIED | All 11 endpoints, requireAuth on all |
| `packages/api/src/services/session.service.ts` | Session invalidation | ✓ VERIFIED | invalidateOtherSessions, invalidateAllSessions, SCAN comment |
| `packages/web/src/App.tsx` | React Router configuration | ✓ VERIFIED | BrowserRouter, all routes, SetupGuard, ProtectedRoute |
| `packages/web/src/lib/api-client.ts` | API client with CSRF | ✓ VERIFIED | x-csrf-token, credentials:include, 403 retry |
| `packages/web/src/hooks/use-auth.ts` | Auth hooks | ✓ VERIFIED | 6 hooks, /api/auth/me, 5min staleTime |
| `packages/web/src/components/ProtectedRoute.tsx` | Route guard | ✓ VERIFIED | Redirects with redirect query param |
| `packages/web/src/components/SetupGuard.tsx` | Setup guard | ✓ VERIFIED | Bidirectional: to /setup and away from /setup |
| `packages/web/src/pages/setup/SetupPage.tsx` | Setup wizard | ✓ VERIFIED | 212 lines, all fields, zodResolver(setupSchema) |
| `packages/web/src/pages/login/LoginPage.tsx` | Login page with 2FA | ✓ VERIFIED | 300 lines, countdown timer, expired state handling |
| `packages/web/src/pages/recover/RecoverPage.tsx` | 3-step recovery | ✓ VERIFIED | 370 lines, SECURITY_QUESTIONS, expired state reset |
| `packages/web/src/pages/settings/SettingsPage.tsx` | Settings page | ✓ VERIFIED | 31 lines (delegates to 3 sub-components; substantive) |
| `packages/web/src/hooks/use-settings.ts` | Settings hooks | ✓ VERIFIED | 11 exported hooks |
| `packages/web/src/pages/settings/components/TwoFactorSetupModal.tsx` | 2FA setup modal | ✓ VERIFIED | QRCodeSVG 200x200, copyable secret, 44px TOTP input |
| `packages/web/src/pages/settings/components/SecurityQuestionsModal.tsx` | Security questions modal | ✓ VERIFIED | useSecurityQuestionsStatus, mutual exclusion |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app.ts` | `middleware/session.ts` | createSessionMiddleware injected | ✓ WIRED | Lines 35: `app.use(createSessionMiddleware(redis, sessionSecret))` |
| `middleware/csrf.ts` | `req.session.id` | getSessionIdentifier reads session | ✓ WIRED | `(req as any).session?.id ?? 'anonymous'` — TODO comment removed |
| `routes/auth.ts` | `services/auth.service.ts` | login calls verifyPassword/findUserByEmail | ✓ WIRED | Both imported and called in login route |
| `routes/auth.ts` | `services/totp.service.ts` | verify-2fa calls verifyTotpCode | ✓ WIRED | `verifyTotpCode(user.totpSecret, code)` |
| `app.ts` | `routes/auth.ts` | createAuthRouter mounted | ✓ WIRED | Line 39: `app.use(createAuthRouter({ db, redis }))` |
| `App.tsx` | `ProtectedRoute.tsx` | wraps /settings and / routes | ✓ WIRED | Both route elements wrapped in `<ProtectedRoute>` |
| `hooks/use-auth.ts` | `/api/auth/me` | TanStack Query fetch | ✓ WIRED | `apiClient.get<User>('/api/auth/me')` in useAuth |
| `SetupPage.tsx` | `/api/auth/setup` | useSetup mutation | ✓ WIRED | `const setupMutation = useSetup()` |
| `LoginPage.tsx` | `/api/auth/login` | useLogin mutation | ✓ WIRED | `const loginMutation = useLogin()` |
| `LoginPage.tsx` | `/api/auth/login/verify-2fa` | useVerify2FA mutation | ✓ WIRED | `const verify2FAMutation = useVerify2FA()` |
| `RecoverPage.tsx` | `/api/auth/recover/*` | apiClient.post calls | ✓ WIRED | All 3 recovery endpoints called |
| `routes/recovery.ts` | `services/auth.service.ts` | findUserByEmail, hashPassword | ✓ WIRED | Both imported and called |
| `routes/settings.ts` | `services/session.service.ts` | password change calls invalidateOtherSessions | ✓ WIRED | `await invalidateOtherSessions(redis, req.sessionID)` |
| `routes/settings.ts` | `services/totp.service.ts` | 2FA setup and disable use TOTP service | ✓ WIRED | generateTotpSecret and verifyTotpCode called |
| `hooks/use-settings.ts` | `/api/settings/*` | apiClient calls | ✓ WIRED | All 11 endpoints mapped to hooks |
| `TwoFactorSetupModal.tsx` | `/api/settings/2fa/setup` | useSetup2FA mutation | ✓ WIRED | `import { useSetup2FA }` |
| `SecurityQuestionsModal.tsx` | `/api/settings/security-questions` | useSecurityQuestionsStatus query | ✓ WIRED | `const { data: status } = useSecurityQuestionsStatus()` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `SettingsPage.tsx` | `user` | `useAuth()` → GET `/api/auth/me` → `getUserById(db, ...)` → Drizzle query | Yes — DB query against `users` table | ✓ FLOWING |
| `SecuritySection.tsx` | `sqStatus` | `useSecurityQuestionsStatus()` → GET `/api/settings/security-questions` → Drizzle query | Yes — DB query against `security_questions` table | ✓ FLOWING |
| `LoginPage.tsx` | `loginMutation.data.requiresTwoFactor` | `useLogin()` → POST `/api/auth/login` → verifyPassword + DB lookup | Yes — real argon2 verification + session write | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TOTP service exports are functions | `node -e "const m = require('.../totp.service.ts'); console.log(typeof m.generateTotpSecret)"` | `function` | ✓ PASS |
| API routes mounted | grep for all 4 router mounts in app.ts | All 4 present (lines 38-41) | ✓ PASS |
| Session ordering: cookieParser → session → CSRF | grep line numbers | Lines 34/35/36 in order | ✓ PASS |
| shadcn components all 13 installed | `ls packages/web/src/components/ui/` | 13 files present | ✓ PASS |
| Database schema push | Docker not available in worktree | N/A | ? SKIP — needs human |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| AUTH-01 | 02-01, 02-03, 02-05 | User can log in with email and password (argon2 password hashing) | ✓ SATISFIED | auth.service.ts hashPassword/verifyPassword with argon2id; login route; LoginPage |
| AUTH-02 | 02-01, 02-02, 02-04 | User session persists across browser refresh using Redis-backed HTTP-only Secure cookie (24-hour sliding window) | ✓ SATISFIED | session.ts: rolling=true, httpOnly=true, 24h maxAge, RedisStore with sms:sess: prefix |
| AUTH-03 | 02-01, 02-03 | User can log out; session invalidated server-side on logout or expiry | ✓ SATISFIED | POST /api/auth/logout: req.session.destroy() + clearCookie('sms.sid') |
| AUTH-04 | 02-04, 02-06 | User can change password (current password required) | ✓ SATISFIED | PUT /api/settings/password: verifyPassword(current) + invalidateOtherSessions; ChangePasswordModal |
| AUTH-05 | 02-03, 02-04, 02-05, 02-06 | User can enable TOTP-based 2FA with QR code setup flow (otpauth library) | ✓ SATISFIED | generateTotpSecret (otpauth), POST /api/settings/2fa/setup, TwoFactorSetupModal with QRCodeSVG |
| AUTH-06 | 02-04, 02-06 | User can disable 2FA (password confirmation required) | ✓ SATISFIED (D-20 stricter) | POST /api/settings/2fa/disable requires both password AND TOTP code; TwoFactorDisableModal |
| AUTH-07 | 02-04, 02-05, 02-06 | User can set security questions and answers for account recovery | ✓ SATISFIED | PUT /api/settings/security-questions (argon2 hashed answers); GET endpoint; SecurityQuestionsModal; RecoverPage |
| SETTINGS-01 | 02-01, 02-04, 02-06 | User can configure: email, username, profile image, first/last name, IANA timezone, date format, entries per page | ✓ SATISFIED | PUT /api/settings/profile, PUT /api/settings/preferences, POST /api/settings/profile/image; ProfileSection + PreferencesSection |

All 8 requirements for Phase 2 are satisfied in code. No orphaned requirements found (REQUIREMENTS.md maps AUTH-01 through AUTH-07 and SETTINGS-01 to Phase 2; all are claimed and implemented).

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `packages/web/src/App.tsx` | `DashboardPlaceholder` component | ℹ️ Info | Intentional stub — dashboard built in a future phase; documented in Plan 02 SUMMARY as known stub |
| `packages/api/src/routes/recovery.ts` | `POST /api/auth/recover/reset-password` missing `recoveryLimiter` | ⚠️ Warning | Rate limiting applies to verify-email and verify-answers steps; reset-password requires an already-verified session so the exposure is lower. D-15 specifies rate limiting on recovery in general — partial implementation |

No blockers found that prevent goal achievement.

### Human Verification Required

**Context:** Plan 06 (Task 3) contains a mandatory `checkpoint:human-verify` gate that is blocking. The SUMMARY explicitly states this checkpoint awaits human verification. All automated tasks passed, but the end-to-end behavioral review has not been completed.

#### 1. End-to-End Auth Flow

**Test:** Start the dev environment (`docker compose -f docker-compose.dev.yml up -d` + `pnpm dev`). Navigate to `http://localhost:5173`. Verify it redirects to `/setup`.
**Expected:** Setup wizard appears with email, password, confirm password, timezone form fields.
**Why human:** Requires running Redis + PostgreSQL + Express + Vite simultaneously; session persistence can only be verified in a real browser with cookies.

#### 2. 2FA Setup and Login with Code

**Test:** After creating account and logging in, go to Settings > Security > Set Up 2FA. Scan QR code with authenticator app. Enter 6-digit code. Log out. Log in again.
**Expected:** Login prompts for 2FA code. 5-minute countdown appears. Entering valid code completes login.
**Why human:** Requires a real TOTP authenticator app; the countdown timer behavior and session expiry can only be observed in a live browser.

#### 3. 2FA Session Expiry Resets to Step 1

**Test:** Log in with credentials when 2FA enabled. On TOTP step, wait until countdown reaches 0:00.
**Expected:** Page automatically resets to credentials step with toast "Session expired. Please sign in again."
**Why human:** Requires waiting 5 minutes in a live browser; cannot test timer expiry behavior programmatically without a running frontend.

#### 4. Account Recovery Flow

**Test:** Set up 3 security questions in Settings. Log out. Go to `/recover`. Enter email, answer questions, set new password.
**Expected:** Password is reset, 2FA is disabled, toast shows "Password reset. 2FA has been disabled. Sign in with your new password." Can log in with new password.
**Why human:** Requires full running stack with real session state and database writes.

#### 5. Database Schema Verification

**Test:** With PostgreSQL container running, check that `users` and `security_questions` tables exist with all correct columns and constraints.
**Expected:** `\dt` shows both tables; `\d security_questions` shows `uq_user_question` unique constraint.
**Why human:** Schema push was deferred during Plan 05 execution because Docker was unavailable in the worktree agent environment. Tables may not exist in any running instance.

### Gaps Summary

No functional code gaps were identified. All 8 required requirements are implemented and wired. The only item preventing a `passed` status is the pending human verification checkpoint from Plan 06 Task 3, which is an explicit blocking gate requiring end-to-end manual testing of the auth system.

The one minor warning (reset-password endpoint missing `recoveryLimiter`) is lower severity because that endpoint already requires a verified recovery session, limiting exposure to an already-difficult-to-exploit surface.

---

_Verified: 2026-04-08T05:30:00Z_
_Verifier: Claude (gsd-verifier)_
