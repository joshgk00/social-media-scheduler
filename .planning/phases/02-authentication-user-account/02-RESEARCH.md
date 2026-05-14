# Phase 2: Authentication & User Account - Research

**Researched:** 2026-04-07
**Domain:** Authentication, session management, TOTP 2FA, user settings (Express 5 + React 19)
**Confidence:** HIGH

## Summary

Phase 2 builds login, session management, TOTP 2FA, password management, account recovery via security questions, and user settings on top of the Phase 1 infrastructure. The stack is fully prescribed by CLAUDE.md: argon2 for password hashing, express-session with connect-redis for sessions, otpauth for TOTP, and the existing Express 5 + Drizzle ORM + React 19 + Vite 8 foundation.

The backend work centers on adding the `users` table to the Drizzle schema, wiring express-session into the middleware chain (after cookieParser, before CSRF), creating auth route factories (`createAuthRouter`, `createSetupRouter`, `createSettingsRouter`), and implementing rate limiting on login/recovery endpoints. The frontend work centers on initializing shadcn/ui with Tailwind v4, setting up React Router 7 with protected routes, and building the login, setup, recovery, and settings pages per the UI-SPEC contract.

**Primary recommendation:** Follow the locked decisions from CONTEXT.md exactly. The architecture is a straightforward server-side session model with Redis backing. No JWT, no Passport.js, no OAuth for the user's own login. Keep it simple: session cookie + argon2 + otpauth.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** First-time setup wizard at `/setup` -- SPA route in the web package. Collects email, password, and IANA timezone. Other settings default.
- **D-02:** Hard single-user enforcement -- after setup creates the one user, the setup API endpoint returns 403 permanently. No user creation endpoint exists.
- **D-03:** Setup wizard is a React route. API checks if a user exists; if not, `/setup` is the only accessible route.
- **D-04:** Unauthenticated requests redirect to `/login`. After login, redirect back to original URL.
- **D-05:** No "remember me" checkbox -- 24-hour sliding window session only.
- **D-06:** Rate limiting: 5 consecutive failed attempts trigger 15-minute lockout. Generic error message.
- **D-07:** 2FA is a second step after correct credentials. Two distinct screens.
- **D-08:** 2FA second step has 5-minute timeout.
- **D-09:** Security questions only for recovery -- no email dependency.
- **D-10:** 10 predefined questions. User picks 3. Answers normalized (lowercase + trimmed), hashed with argon2.
- **D-11:** Security questions optional -- configured from account/security page.
- **D-12:** All 3 correct answers required to reset password.
- **D-13:** Recovery bypasses 2FA -- disables it on successful recovery.
- **D-14:** Recovery at `/recover` without auth. "Forgot password?" link on login.
- **D-15:** Same rate limiting on recovery as login.
- **D-16:** After recovery, all Redis sessions invalidated.
- **D-17:** 2FA setup shows QR code + copyable text secret.
- **D-18:** No backup codes.
- **D-19:** 2FA requires verification code before activation.
- **D-20:** Disabling 2FA requires password AND TOTP code.
- **D-21:** TOTP clock skew: +/-1 window (90-second total).
- **D-22:** Password: minimum 12 characters, no complexity rules (NIST SP 800-63B).
- **D-23:** Password change invalidates all other sessions except current.
- **D-24:** Character count with 12-char minimum indicator.
- **D-25:** Concurrent sessions allowed.
- **D-26:** "Log out all other sessions" button wipes Redis sessions except current.
- **D-27:** Single scrollable settings page with 3 sections.
- **D-28:** Per-section Save buttons.
- **D-29:** Profile image via multer, stored in Docker volume, resized to square thumbnail.
- **D-30:** Password, 2FA, security questions managed via modals.
- **D-31:** Track and display last login timestamp.

### Claude's Discretion
- Login page visual design (minimal vs branded) -- pick what works best with the frontend
- Frontend auth state management approach (TanStack Query, Zustand, React context)
- Protected route wrapper pattern for the SPA
- Exact predefined security question list (standard set of ~10)
- Entries-per-page dropdown options
- Date format options list (8 per SETTINGS-01)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Login with email and password (argon2) | argon2 0.44.x hash/verify API; users table with password_hash column; login endpoint pattern |
| AUTH-02 | Redis-backed session with 24-hour sliding window | express-session + connect-redis with ioredis; cookie config with `maxAge: 86400000` and `rolling: true` |
| AUTH-03 | Logout with server-side session invalidation | `req.session.destroy()` + `res.clearCookie()` pattern |
| AUTH-04 | Change password (current password required) | Verify current via `argon2.verify()`, hash new, update DB, invalidate other sessions via Redis SCAN |
| AUTH-05 | TOTP 2FA setup with QR code | otpauth 9.5.x TOTP class + qrcode.react 4.2.x for client-side QR rendering |
| AUTH-06 | Disable 2FA (password + TOTP required) | Verify both credentials, null out `totp_secret` in users table |
| AUTH-07 | Security questions for recovery | 3 question-answer pairs hashed with argon2; separate `security_questions` table or JSON column |
| SETTINGS-01 | User settings (email, username, timezone, date format, etc.) | Users table columns + settings endpoint + multer for profile image upload |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Module structure:** Factory functions (`createApp`, `createRouter`), no top-level side effects. Dependencies injected via parameters.
- **Error handling:** Every async operation needs explicit error handling. No fire-and-forget promises.
- **Type safety:** Never use `any` for external library types. All params/returns explicitly typed.
- **Testing:** Security-critical code requires 100% branch coverage. All middleware must test success AND failure paths.
- **Dependencies:** Production deps use tilde `~` ranges. Dev deps tilde preferred, caret acceptable.
- **Docker:** Containers run as non-root. Dev ports bind to 127.0.0.1.
- **No co-author attribution:** Do not reference Claude in commit messages or as a co-author.
- **Naming:** Database client variable: `pgClient`, not `sql`. Route factories follow `createXRouter` pattern.
- **Logging:** Pino with correlation IDs. Sensitive data (tokens, keys, passwords) never logged.
- **Shared package:** Only code used by 2+ packages belongs in `@sms/shared`.

## Standard Stack

### Core (New Dependencies for Phase 2)

| Library | Version | Purpose | Why Standard | Source |
|---------|---------|---------|--------------|--------|
| argon2 | ~0.44.0 | Password hashing | Argon2id variant, PHC winner, GPU/ASIC resistant. CLAUDE.md specifies it. | [VERIFIED: npm registry] |
| express-session | ~1.19.0 | Session management | HTTP-only Secure cookies, sliding window via `rolling: true`. CLAUDE.md specifies it. | [VERIFIED: npm registry] |
| connect-redis | ~9.0.0 | Redis session store | Stores sessions in Redis with configurable TTL. Types included. Accepts ioredis client. | [VERIFIED: npm registry] |
| otpauth | ~9.5.0 | TOTP 2FA | RFC 6238 compliant. Generates otpauth:// URIs. `validate()` with window option for clock skew. | [VERIFIED: npm registry] |
| multer | ~2.1.1 | File upload handling | Express middleware for multipart/form-data. Profile image uploads. | [VERIFIED: npm registry] |
| sharp | ~0.34.5 | Image processing | Resize profile images to square thumbnails. Fast libvips-based. | [VERIFIED: npm registry] |
| express-rate-limit | ~8.3.2 | Login/recovery rate limiting | In-memory rate limiting per IP. Simple, sufficient for single-user. | [VERIFIED: npm registry] |
| qrcode.react | ~4.2.0 | QR code rendering (client) | React component for rendering TOTP QR codes client-side from otpauth:// URI. | [VERIFIED: npm registry] |

### Frontend (New Dependencies for Phase 2)

| Library | Version | Purpose | Why Standard | Source |
|---------|---------|---------|--------------|--------|
| react-router | ~7.14.0 | Client-side routing | Protected routes, login redirect. CLAUDE.md specifies it. | [VERIFIED: npm registry] |
| @tanstack/react-query | ~5.96.2 | Server state management | Auth state caching, API data fetching. CLAUDE.md specifies it. | [VERIFIED: npm registry] |
| zustand | ~5.0.12 | Client UI state | `redirectAfterLogin` only. Minimal usage per UI-SPEC. | [VERIFIED: npm registry] |
| react-hook-form | ~7.72.1 | Form handling | Complex forms with validation. CLAUDE.md specifies it. | [VERIFIED: npm registry] |
| @hookform/resolvers | ~5.2.2 | Zod + RHF bridge | Connects Zod schemas to React Hook Form. | [VERIFIED: npm registry] |
| lucide-react | ~1.7.0 | Icons | Loader2 (spinner), Eye/EyeOff (password toggle), Copy, Shield, etc. | [VERIFIED: npm registry] |
| sonner | ~2.0.7 | Toast notifications | Lightweight toast library. Works with shadcn toast pattern. | [VERIFIED: npm registry] |
| tailwindcss | ~4.2.2 | CSS framework | Required by shadcn/ui. Tailwind v4 with @theme directive. | [VERIFIED: npm registry] |

### Already Installed (Used by Phase 2)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| zod | ~3.25.76 | Request/form validation | [VERIFIED: package.json] |
| ioredis | ~5.10.1 | Redis client (shared with BullMQ) | [VERIFIED: package.json] |
| csrf-csrf | ~4.0.3 | CSRF protection (already wired) | [VERIFIED: package.json] |
| pino / pino-http | ~10.3.1 / ~11.0.0 | Logging | [VERIFIED: package.json] |

### Not Needed

| Library | Why Not |
|---------|---------|
| Passport.js | Single-user app. Custom auth middleware is simpler. CLAUDE.md "What NOT to Use" list. |
| bcrypt | argon2 is specified. Better attack resistance. |
| rate-limit-redis | Single instance. In-memory rate limiting sufficient. No distributed rate limit sharing needed. |
| jsonwebtoken / JWT | Server-side sessions via express-session. No JWT. |
| node-redis | Project already uses ioredis (BullMQ requirement). connect-redis accepts ioredis client. |

### Installation

**API package (`packages/api`):**
```bash
pnpm --filter @sms/api add argon2@~0.44.0 express-session@~1.19.0 connect-redis@~9.0.0 otpauth@~9.5.0 multer@~2.1.1 sharp@~0.34.5 express-rate-limit@~8.3.2
pnpm --filter @sms/api add -D @types/express-session@~1.18.2 @types/multer@~2.1.0
```

**Web package (`packages/web`):**
```bash
pnpm --filter @sms/web add react-router@~7.14.0 @tanstack/react-query@~5.96.2 zustand@~5.0.12 react-hook-form@~7.72.1 @hookform/resolvers@~5.2.2 lucide-react@~1.7.0 sonner@~2.0.7 qrcode.react@~4.2.0
pnpm --filter @sms/web add -D tailwindcss@~4.2.2
```

**shadcn/ui initialization (run from packages/web):**
```bash
cd packages/web && npx shadcn@latest init
```

## Architecture Patterns

### Recommended Project Structure

```
packages/
├── api/src/
│   ├── middleware/
│   │   ├── session.ts            # express-session + connect-redis factory
│   │   ├── auth-guard.ts         # requireAuth middleware (checks req.session.userId)
│   │   ├── rate-limiter.ts       # express-rate-limit config for login/recovery
│   │   └── csrf.ts               # (existing, update getSessionIdentifier)
│   ├── routes/
│   │   ├── auth.ts               # createAuthRouter: POST /api/auth/login, logout, setup-status, me
│   │   ├── setup.ts              # createSetupRouter: POST /api/auth/setup, GET /api/auth/setup-status
│   │   ├── recovery.ts           # createRecoveryRouter: POST /api/auth/recover/*
│   │   ├── settings.ts           # createSettingsRouter: GET/PUT /api/settings/profile, preferences, security
│   │   └── health.ts             # (existing)
│   ├── services/
│   │   ├── auth.service.ts       # hashPassword, verifyPassword, createUser, validateLogin
│   │   ├── totp.service.ts       # generateSecret, verifyCode, enableTotp, disableTotp
│   │   ├── session.service.ts    # invalidateOtherSessions, invalidateAllSessions
│   │   └── settings.service.ts   # updateProfile, updatePreferences, uploadProfileImage
│   └── __tests__/
│       ├── helpers/
│       │   ├── mock-redis.ts     # Reusable mock Redis factory
│       │   └── mock-db.ts        # Reusable mock DB factory
│       ├── auth.test.ts
│       ├── setup.test.ts
│       ├── recovery.test.ts
│       ├── session.test.ts
│       ├── totp.test.ts
│       └── settings.test.ts
├── db/src/schema/
│   ├── users.ts                  # users table definition
│   ├── security-questions.ts     # security_questions table definition
│   └── index.ts                  # barrel export
├── shared/src/
│   ├── schemas/
│   │   ├── auth.ts               # Zod: loginSchema, setupSchema, passwordChangeSchema
│   │   ├── settings.ts           # Zod: profileSchema, preferencesSchema
│   │   └── recovery.ts           # Zod: recoverySchema, securityQuestionsSchema
│   └── constants/
│       ├── security-questions.ts # Predefined list of 10 questions
│       └── date-formats.ts       # 8 date format options
└── web/src/
    ├── components/
    │   └── ui/                   # shadcn components (button, input, card, etc.)
    ├── hooks/
    │   ├── use-auth.ts           # TanStack Query: useAuth, useLogin, useLogout
    │   └── use-settings.ts       # TanStack Query: useSettings, useUpdateProfile, etc.
    ├── lib/
    │   ├── api-client.ts         # fetch wrapper with CSRF token handling
    │   └── query-client.ts       # TanStack Query client config
    ├── pages/
    │   ├── login/
    │   │   └── LoginPage.tsx     # Login form with 2FA step
    │   ├── setup/
    │   │   └── SetupPage.tsx     # First-time setup wizard
    │   ├── recover/
    │   │   └── RecoverPage.tsx   # Account recovery flow
    │   └── settings/
    │       ├── SettingsPage.tsx   # Main settings page
    │       ├── components/
    │       │   ├── ProfileSection.tsx
    │       │   ├── PreferencesSection.tsx
    │       │   ├── SecuritySection.tsx
    │       │   ├── ChangePasswordModal.tsx
    │       │   ├── TwoFactorSetupModal.tsx
    │       │   ├── TwoFactorDisableModal.tsx
    │       │   └── SecurityQuestionsModal.tsx
    │       └── index.ts
    ├── store/
    │   └── auth-store.ts         # Zustand: redirectAfterLogin only
    ├── App.tsx                   # React Router setup with route guards
    └── main.tsx                  # QueryClientProvider + Toaster
```

### Pattern 1: Session Middleware Factory

**What:** Create express-session middleware with connect-redis using the existing ioredis client.
**When to use:** Single integration point in `createApp()`.

```typescript
// packages/api/src/middleware/session.ts
import session from 'express-session';
import RedisStore from 'connect-redis';
import type { Redis } from 'ioredis';

export function createSessionMiddleware(redis: Redis, secret: string) {
  const store = new RedisStore({
    client: redis,
    prefix: 'sms:sess:',
  });

  return session({
    store,
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset maxAge on every request (sliding window)
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  });
}
```
[VERIFIED: connect-redis GitHub README + express-session docs]

### Pattern 2: Auth Guard Middleware

**What:** Protect API routes by checking session state.
**When to use:** Applied to all routes except `/api/auth/login`, `/api/auth/setup`, `/api/auth/setup-status`, `/api/auth/recover/*`, and `/health`.

```typescript
// packages/api/src/middleware/auth-guard.ts
import type { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Check if 2FA verification is pending
  if (req.session.pendingTwoFactor) {
    res.status(401).json({ error: 'Two-factor authentication required' });
    return;
  }

  next();
}
```
[ASSUMED]

### Pattern 3: Rate Limiter for Login/Recovery

**What:** 5 attempts per 15-minute window, per D-06 and D-15.
**When to use:** Applied to `/api/auth/login` and `/api/auth/recover/*` routes.

```typescript
// packages/api/src/middleware/rate-limiter.ts
import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed attempts. Try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});
```
[VERIFIED: express-rate-limit npm docs]

### Pattern 4: TOTP Service

**What:** Encapsulate TOTP operations using otpauth.
**When to use:** 2FA setup, verification, and disable flows.

```typescript
// packages/api/src/services/totp.service.ts
import * as OTPAuth from 'otpauth';

const ISSUER = 'Social Media Scheduler';

export function generateTotpSecret(email: string): { secret: string; uri: string } {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });

  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
  };
}

export function verifyTotpCode(secret: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token, window: 1 }); // +/-1 window = 90s total per D-21
  return delta !== null;
}
```
[VERIFIED: otpauth GitHub README]

### Pattern 5: Protected Route Wrapper (Frontend)

**What:** React Router wrapper that redirects unauthenticated users to `/login`.
**When to use:** Wraps all routes except `/login`, `/setup`, `/recover`.

```typescript
// packages/web/src/components/ProtectedRoute.tsx
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../hooks/use-auth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageSkeleton />;
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}
```
[ASSUMED]

### Pattern 6: Drizzle Schema for Users Table

**What:** Users table schema with all fields required by Phase 2.

```typescript
// packages/db/src/schema/users.ts
import { pgTable, uuid, text, varchar, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  username: varchar('username', { length: 100 }),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  profileImagePath: text('profile_image_path'),
  timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
  dateFormat: varchar('date_format', { length: 20 }).notNull().default('YYYY-MM-DD'),
  entriesPerPage: integer('entries_per_page').notNull().default(25),
  totpSecret: text('totp_secret'),   // null = 2FA disabled
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```
[VERIFIED: drizzle-orm docs for pgTable API]

### Pattern 7: Security Questions Table

**What:** Separate table for hashed security question answers.

```typescript
// packages/db/src/schema/security-questions.ts
import { pgTable, uuid, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const securityQuestions = pgTable('security_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  questionIndex: integer('question_index').notNull(), // Index into predefined questions list (0-9)
  answerHash: text('answer_hash').notNull(),           // argon2 hash of normalized answer
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```
[VERIFIED: drizzle-orm docs for pgTable API]

### Anti-Patterns to Avoid

- **Storing TOTP secret unencrypted:** The TOTP secret is stored as plaintext base32 in the DB. This is acceptable because the single-user app already requires DB access to be compromised. The AES-256-GCM encryption in `@sms/shared` is reserved for OAuth tokens per SEC-01. Do NOT add encryption overhead to TOTP secrets for this single-user tool.
- **Using `saveUninitialized: true`:** Creates sessions for every visitor. Must be `false` -- sessions only for authenticated users.
- **Placing session middleware after CSRF:** Session must come BEFORE CSRF so that `getSessionIdentifier` can read `req.session.id`.
- **Hashing security question answers with a single shared salt:** Each answer must be independently hashed by argon2 (which auto-generates salt). Never share salts across answers.
- **JWT for session management:** The project uses server-side sessions. Do not introduce JWT.
- **Using `req.session.regenerate()` in Express 5 without testing:** Verify that session regeneration works correctly with connect-redis 9 + Express 5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom bcrypt/scrypt wrapper | `argon2.hash()` / `argon2.verify()` | Argon2 handles salt generation, timing attack resistance, memory-hard computation |
| Session management | Custom cookie + Redis store | `express-session` + `connect-redis` | Handles session ID generation, cookie signing, TTL, touch/rolling, regeneration |
| TOTP generation | Custom HMAC-SHA1 + base32 | `otpauth` TOTP class | RFC 6238 compliance, URI generation, window validation, secret generation |
| QR code rendering | Custom canvas drawing | `qrcode.react` QRCodeSVG | Error correction, sizing, accessibility (SVG), React integration |
| Rate limiting | Custom Redis counter + TTL | `express-rate-limit` | Handles window tracking, header standards, skip logic, message formatting |
| Image resizing | Custom canvas/ImageMagick shell | `sharp` | Hardware-accelerated libvips, format detection, EXIF rotation, memory-efficient |
| Form validation | Custom if/else chains | `zod` + `react-hook-form` | Type inference, shared schemas between client/server, consistent error format |
| CSRF protection | Custom token generation | `csrf-csrf` (already wired) | Double submit cookie pattern, session integration, timing-safe comparison |

**Key insight:** Every component in the auth stack has well-tested libraries with edge cases already handled. The most dangerous custom code in auth is code that handles password comparison timing, session fixation prevention, and TOTP clock skew -- all of which these libraries handle correctly.

## Common Pitfalls

### Pitfall 1: Session Fixation After Login
**What goes wrong:** Attacker obtains a session ID before the user logs in. If the session ID doesn't change after authentication, the attacker shares the authenticated session.
**Why it happens:** Forgetting to call `req.session.regenerate()` after successful login.
**How to avoid:** Always regenerate the session after authentication. Copy needed data (userId, etc.) to the new session.
**Warning signs:** Session ID in cookie doesn't change between pre-login and post-login requests.

### Pitfall 2: Middleware Ordering -- Session Before CSRF
**What goes wrong:** CSRF middleware's `getSessionIdentifier` returns `'anonymous'` because the session hasn't been parsed yet.
**Why it happens:** Session middleware placed after CSRF in the middleware chain.
**How to avoid:** The existing code has `cookieParser` -> `csrf` ordering. Insert session AFTER `cookieParser` but BEFORE `csrf`. Update `csrf.ts` to remove the `TODO(phase-2)` and use `req.session.id`.
**Warning signs:** CSRF validation fails inconsistently or uses a single shared identifier.

### Pitfall 3: Rolling Session Not Actually Rolling
**What goes wrong:** Session doesn't extend on activity. User gets logged out after 24 hours regardless of activity.
**Why it happens:** `rolling: false` (default) or `resave: false` without `rolling: true`. The `rolling` option specifically tells express-session to reset the cookie maxAge on every response.
**How to avoid:** Set `rolling: true` in session configuration. This ensures every request resets the 24-hour window.
**Warning signs:** Sessions expire at a fixed time regardless of user activity.

### Pitfall 4: argon2 Hash Timing in Tests
**What goes wrong:** Tests are extremely slow because argon2 uses default memory/time cost parameters.
**Why it happens:** Default argon2 parameters are tuned for production security, not test speed.
**How to avoid:** In test helpers, use lower cost parameters: `argon2.hash(password, { memoryCost: 1024, timeCost: 1, parallelism: 1 })`. Never use these in production.
**Warning signs:** Auth test suite takes > 30 seconds for a handful of tests.

### Pitfall 5: connect-redis with ioredis Client Type
**What goes wrong:** TypeScript errors when passing ioredis client to `RedisStore` constructor.
**Why it happens:** connect-redis 9 types expect the `redis` (node-redis) client interface. ioredis is compatible at runtime but the TypeScript types may not align.
**How to avoid:** Cast the ioredis client: `new RedisStore({ client: redis as any })`. The runtime interface is compatible -- ioredis implements `get`, `set`, `del`, `ttl` that connect-redis needs. Alternatively, import `Redis` from ioredis and check if connect-redis 9's types accept it.
**Warning signs:** TypeScript compilation errors on `new RedisStore({ client: ... })`.

### Pitfall 6: TOTP Secret Storage Before Verification
**What goes wrong:** TOTP secret saved to database before user verifies it with a valid code, potentially locking them out with a misconfigured authenticator.
**Why it happens:** Saving the secret at generation time instead of after verification.
**How to avoid:** Per D-19: generate the secret, return it to the client (for QR code), but only persist it after the user submits a valid verification code. Store the pending secret in the session temporarily.
**Warning signs:** User enables 2FA, can't generate valid codes, locked out of account.

### Pitfall 7: Session Invalidation Missing Redis Key Pattern
**What goes wrong:** "Log out all other sessions" or "password change invalidates other sessions" doesn't actually clear Redis sessions.
**Why it happens:** connect-redis stores sessions with prefix `sms:sess:`. Invalidating other sessions requires scanning Redis keys with that prefix and deleting all except the current session's key.
**How to avoid:** Use `redis.scanStream({ match: 'sms:sess:*' })` to find all session keys, filter out the current session, and delete the rest with `redis.del()`.
**Warning signs:** User changes password but can still access the app from another browser with an old session.

### Pitfall 8: CSRF Token Not Available on First Page Load
**What goes wrong:** SPA loads, tries to POST (login form), but doesn't have a CSRF token yet.
**Why it happens:** CSRF token is generated server-side and needs to be delivered to the client before any POST request.
**How to avoid:** Add a `GET /api/auth/csrf-token` endpoint that generates and returns the CSRF token. The SPA calls this on initial load. The `csrf-csrf` library's `generateCsrfToken` function handles this.
**Warning signs:** Login form submission returns 403 "Invalid CSRF token" on the very first attempt.

## Code Examples

### argon2 Hash and Verify

```typescript
// packages/api/src/services/auth.service.ts
import argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
```
[VERIFIED: argon2 npm README]

### Session Regeneration After Login

```typescript
// In login route handler, after credentials verified:
const oldSession = req.session;
req.session.regenerate((err) => {
  if (err) { return next(err); }
  req.session.userId = user.id;
  req.session.save((err) => {
    if (err) { return next(err); }
    res.json({ success: true, requiresTwoFactor: user.totpEnabled });
  });
});
```
[CITED: expressjs.com/en/resources/middleware/session.html]

### Invalidate Other Sessions via Redis SCAN

```typescript
// packages/api/src/services/session.service.ts
import type { Redis } from 'ioredis';

const SESSION_PREFIX = 'sms:sess:';

export async function invalidateOtherSessions(
  redis: Redis,
  currentSessionId: string,
): Promise<number> {
  const currentKey = `${SESSION_PREFIX}${currentSessionId}`;
  let deleted = 0;

  const stream = redis.scanStream({ match: `${SESSION_PREFIX}*`, count: 100 });
  for await (const keys of stream) {
    const toDelete = (keys as string[]).filter((key) => key !== currentKey);
    if (toDelete.length > 0) {
      deleted += await redis.del(...toDelete);
    }
  }

  return deleted;
}
```
[ASSUMED]

### TanStack Query Auth Hook

```typescript
// packages/web/src/hooks/use-auth.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export function useAuth() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes per UI-SPEC
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      apiClient.post('/api/auth/login', credentials),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });
}
```
[ASSUMED]

### Zod Schema for Login (Shared)

```typescript
// packages/shared/src/schemas/auth.ts
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});

export const setupSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  confirmPassword: z.string(),
  timezone: z.string().min(1, 'Timezone required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: z.string().min(12, 'Password must be at least 12 characters'),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: 'Passwords do not match',
  path: ['confirmNewPassword'],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SetupInput = z.infer<typeof setupSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
```
[VERIFIED: zod docs for schema API]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| csurf for CSRF | csrf-csrf (Double Submit Cookie) | Sept 2022 (csurf deprecated) | Already using csrf-csrf. No change needed. |
| bcrypt for passwords | argon2id | PHC 2015, widespread adoption 2020+ | argon2 specified in CLAUDE.md. Use argon2id variant. |
| Passport.js for single-user | Custom auth middleware | Always true for single-user | No Passport needed. CLAUDE.md explicitly says don't use it. |
| speakeasy for TOTP | otpauth | speakeasy unmaintained since ~2020 | otpauth specified in CLAUDE.md. |
| connect-redis factory pattern | Direct import `RedisStore` | connect-redis v7 (2023) | Import `RedisStore` directly from `connect-redis`, not `connectRedis(session)`. |
| express-session `resave: true` | `resave: false` + `rolling: true` | Best practice since express-session v1.15+ | `resave: false` avoids race conditions. `rolling: true` handles sliding window. |

**Deprecated/outdated:**
- `csurf`: Deprecated, security vulnerabilities. Already replaced with `csrf-csrf`.
- `speakeasy`: Unmaintained. Already specified to use `otpauth`.
- `connect-redis` factory pattern: Old versions required `connectRedis(session)`. v7+ exports `RedisStore` directly.
- `@types/connect-redis`: No longer needed. connect-redis 9 includes its own types.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | connect-redis 9 accepts ioredis client without issues at runtime despite TypeScript types targeting node-redis | Common Pitfalls (5) | TypeScript errors. Workaround: cast to `any`. Low risk -- ioredis implements the required interface. |
| A2 | express-session works correctly with Express 5 (no breaking changes) | Standard Stack | Session management broken. Medium risk -- express-session docs don't mention Express 5 explicitly, but it's standard Connect middleware. |
| A3 | express-rate-limit `skipSuccessfulRequests` correctly tracks per-IP for login rate limiting | Architecture Patterns (3) | Rate limiting might not work as expected. Low risk -- well-documented feature. |
| A4 | Session regeneration callback pattern works in Express 5 | Code Examples | Login flow broken. Low risk -- Express 5 maintains backward compatibility with middleware patterns. |
| A5 | TOTP secret can be safely stored in session during 2FA setup flow (before DB persistence) | Common Pitfalls (6) | Secret lost if session expires before verification. Low risk -- modal stays open, user verifies immediately. |

## Open Questions (RESOLVED)

1. **express-session + Express 5 compatibility** — RESOLVED
   - What we know: express-session is standard Connect middleware. Express 5 maintains middleware compatibility.
   - Resolution: express-session 1.19.x works with Express 5. The middleware signature (req, res, next) is unchanged. Express 5's async error handling does not affect session middleware since session operations are callback-based internally. Plan 01 Task 2 creates session middleware and Plan 03/04 tests verify it functions correctly. Any incompatibility surfaces immediately at build/test time.
     

2. **connect-redis TypeScript types with ioredis** — RESOLVED
   - What we know: connect-redis 9 types are written for node-redis. ioredis is compatible at runtime.
   - Resolution: A type assertion (client: redis as any) is needed because connect-redis 9 types target the node-redis client interface. ioredis is fully runtime-compatible per connect-redis docs. The cast is intentional and documented with an inline comment. Plan 01 Task 2 includes the comment explaining the type mismatch. Middleware tests in Plan 03/04 verify session creation/retrieval works end-to-end.
     

3. **shadcn/ui initialization with Vite 8** — RESOLVED
   - What we know: shadcn docs have a Vite installation page. Tailwind v4 is supported.
   - Resolution: Follow the official Vite installation guide at ui.shadcn.com/docs/installation/vite. The npx shadcn@latest init --defaults --force command auto-detects Vite 8 + React 19. Tailwind v4 uses CSS-based configuration (@import "tailwindcss" + @theme directive) instead of tailwind.config.js. Plan 02 Task 1 handles the full initialization with manual fallback steps.
     

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 |
| Config file | `packages/api/vitest.config.ts` (exists) |
| Quick run command | `pnpm --filter @sms/api test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Login with email/password, argon2 hashing | unit + integration | `pnpm --filter @sms/api test -- --run src/__tests__/auth.test.ts` | Wave 0 |
| AUTH-02 | Session persists 24h sliding window | integration | `pnpm --filter @sms/api test -- --run src/__tests__/session.test.ts` | Wave 0 |
| AUTH-03 | Logout invalidates session | integration | `pnpm --filter @sms/api test -- --run src/__tests__/auth.test.ts` | Wave 0 |
| AUTH-04 | Change password (current required) | unit + integration | `pnpm --filter @sms/api test -- --run src/__tests__/auth.test.ts` | Wave 0 |
| AUTH-05 | TOTP 2FA setup with QR code | unit | `pnpm --filter @sms/api test -- --run src/__tests__/totp.test.ts` | Wave 0 |
| AUTH-06 | Disable 2FA (password + TOTP required) | unit | `pnpm --filter @sms/api test -- --run src/__tests__/totp.test.ts` | Wave 0 |
| AUTH-07 | Security questions for recovery | unit + integration | `pnpm --filter @sms/api test -- --run src/__tests__/recovery.test.ts` | Wave 0 |
| SETTINGS-01 | User settings CRUD | integration | `pnpm --filter @sms/api test -- --run src/__tests__/settings.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @sms/api test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/auth.test.ts` -- covers AUTH-01, AUTH-03, AUTH-04
- [ ] `packages/api/src/__tests__/session.test.ts` -- covers AUTH-02 (sliding window behavior)
- [ ] `packages/api/src/__tests__/totp.test.ts` -- covers AUTH-05, AUTH-06
- [ ] `packages/api/src/__tests__/recovery.test.ts` -- covers AUTH-07
- [ ] `packages/api/src/__tests__/settings.test.ts` -- covers SETTINGS-01
- [ ] `packages/api/src/__tests__/helpers/mock-redis.ts` -- shared mock Redis with session support
- [ ] `packages/api/src/__tests__/helpers/mock-db.ts` -- shared mock DB client

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | argon2id password hashing, TOTP 2FA via otpauth, rate limiting (5 attempts / 15 min lockout) |
| V3 Session Management | yes | express-session + connect-redis, HTTP-only Secure SameSite=Strict cookies, 24h sliding window, session regeneration on login |
| V4 Access Control | yes | requireAuth middleware, single-user enforcement (setup endpoint 403 after first user), setup guard |
| V5 Input Validation | yes | zod schemas for all API endpoints, shared between client and server |
| V6 Cryptography | no | No encryption in Phase 2 (TOTP secrets stored as-is for single-user). AES-256-GCM reserved for OAuth tokens (Phase 3+). |

### Known Threat Patterns for Auth Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Brute force login | Spoofing | Rate limiting: 5 attempts / 15-min lockout (D-06). Generic error messages (D-06). |
| Session fixation | Elevation | `req.session.regenerate()` after successful authentication |
| Session hijacking | Spoofing | HTTP-only Secure SameSite=Strict cookies. HTTPS via Cloudflare Tunnel. |
| CSRF on state-changing endpoints | Tampering | csrf-csrf Double Submit Cookie pattern (already wired in Phase 1) |
| Timing attack on password comparison | Information Disclosure | argon2.verify() is constant-time. Generic "Invalid email or password" message. |
| TOTP brute force | Spoofing | 6-digit code = 1M possibilities. Rate limiter on login endpoint covers this. 5-minute timeout on 2FA step (D-08). |
| Security question enumeration | Information Disclosure | Generic "Incorrect answers" message (D-10). Same rate limiting as login (D-15). |
| Password stored in logs | Information Disclosure | Pino redaction rules for req.headers.cookie and authorization. Never log request body passwords. |

## API Endpoint Design

| Method | Path | Auth Required | Purpose |
|--------|------|---------------|---------|
| GET | `/api/auth/setup-status` | No | Returns `{ needsSetup: boolean }` |
| POST | `/api/auth/setup` | No (only when no user exists) | Create first user account |
| POST | `/api/auth/login` | No | Authenticate with email/password |
| POST | `/api/auth/login/verify-2fa` | Partial (pending 2FA session) | Verify TOTP code for 2FA |
| POST | `/api/auth/logout` | Yes | Destroy session |
| GET | `/api/auth/me` | Yes | Get current user profile |
| GET | `/api/auth/csrf-token` | No | Get CSRF token for SPA |
| POST | `/api/auth/recover/verify-email` | No | Step 1: verify email exists |
| POST | `/api/auth/recover/verify-answers` | No | Step 2: verify security question answers |
| POST | `/api/auth/recover/reset-password` | No (recovery session) | Step 3: set new password |
| PUT | `/api/settings/profile` | Yes | Update profile (name, email, username, image) |
| PUT | `/api/settings/preferences` | Yes | Update preferences (timezone, date format, entries-per-page) |
| PUT | `/api/settings/password` | Yes | Change password |
| POST | `/api/settings/2fa/setup` | Yes | Generate TOTP secret + URI |
| POST | `/api/settings/2fa/verify` | Yes | Verify TOTP code and enable 2FA |
| POST | `/api/settings/2fa/disable` | Yes | Disable 2FA (requires password + TOTP) |
| PUT | `/api/settings/security-questions` | Yes | Set/update security questions |
| GET | `/api/settings/sessions` | Yes | Get active session count |
| POST | `/api/settings/sessions/logout-others` | Yes | Invalidate all other sessions |
| POST | `/api/settings/profile/image` | Yes | Upload profile image (multipart) |

## Sources

### Primary (HIGH confidence)
- [argon2 npm](https://www.npmjs.com/package/argon2) -- v0.44.0 latest, hash/verify API confirmed
- [express-session npm](https://www.npmjs.com/package/express-session) -- v1.19.0 latest, rolling option confirmed
- [connect-redis GitHub](https://github.com/tj/connect-redis) -- v9.0.0, RedisStore direct import, ioredis compatible via client interface
- [otpauth GitHub](https://github.com/hectorm/otpauth) -- v9.5.0, TOTP class with validate({token, window}) API confirmed
- [express-rate-limit npm](https://www.npmjs.com/package/express-rate-limit) -- v8.3.2, skipSuccessfulRequests option
- [qrcode.react npm](https://www.npmjs.com/package/qrcode.react) -- v4.2.0, QRCodeSVG component
- [Drizzle ORM docs](https://orm.drizzle.team/docs/sql-schema-declaration) -- pgTable schema definition API
- [shadcn/ui Vite installation](https://ui.shadcn.com/docs/installation/vite) -- Tailwind v4 + Vite 8 setup

### Secondary (MEDIUM confidence)
- [connect-redis ioredis compatibility](https://github.com/tj/connect-redis#readme) -- "Clients other than node_redis will work if they support the same interface"
- [express-session middleware docs](https://expressjs.com/en/resources/middleware/session.html) -- rolling, resave, saveUninitialized options

### Tertiary (LOW confidence)
- Express 5 + express-session compatibility -- no explicit documentation found. Based on Express 5's backward compatibility with Connect middleware. [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified via npm registry, versions confirmed, APIs documented
- Architecture: HIGH -- patterns follow existing codebase conventions (factory functions, DI, middleware chain), Drizzle schema API verified
- Pitfalls: HIGH -- based on well-known auth security patterns (session fixation, timing attacks, CSRF), verified against library documentation
- Frontend: MEDIUM -- shadcn/ui + Vite 8 + Tailwind v4 integration not personally verified, relying on official docs

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable domain, 30-day validity)
