# Phase 2: Authentication & User Account - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Delivers user authentication, session management, 2FA, password management, account recovery, and user settings for a single-user self-hosted app. No social profile connections. No post creation. No dashboard beyond a placeholder. The first user is created via a one-time setup wizard.

</domain>

<decisions>
## Implementation Decisions

### Initial Account Setup
- **D-01:** First-time setup wizard at `/setup` — SPA route in the web package. Collects email, password, and IANA timezone. Other settings (date format, username, entries-per-page, profile image) default and are configured later in Settings.
- **D-02:** Hard single-user enforcement — after the setup wizard creates the one user, the setup API endpoint returns 403 permanently. No user creation endpoint exists. The DB schema supports one user by design.
- **D-03:** Setup wizard is a React route. API checks if a user exists; if not, `/setup` is the only accessible route. All other routes redirect to `/setup` until account creation is complete.

### Login Flow
- **D-04:** Unauthenticated requests to protected pages redirect to `/login`. After successful login, redirect back to the original URL.
- **D-05:** No "remember me" checkbox — 24-hour sliding window session only, per AUTH-02. Each request resets the timer.
- **D-06:** Rate limiting on login: 5 consecutive failed attempts trigger a 15-minute lockout. Generic "Invalid credentials" error message (never reveals which field is wrong).
- **D-07:** 2FA is a second step — after correct email + password, a separate screen prompts for the TOTP code. Two distinct steps, standard pattern (GitHub, Google).
- **D-08:** 2FA second step has a 5-minute timeout. After timeout, redirects back to login. Prevents stale partial-auth sessions.

### Account Recovery
- **D-09:** Security questions only — no email dependency. Self-contained, works without SMTP infrastructure.
- **D-10:** Predefined list of ~10 security questions. User picks 3, provides answers. Answers normalized to lowercase + trimmed, then hashed with argon2. Case-insensitive matching.
- **D-11:** Security questions are optional — configured from the account/security page, not required during setup. If not set, no recovery path exists (user accepts the risk).
- **D-12:** All 3 security questions must be answered correctly to reset password.
- **D-13:** Security questions bypass 2FA during recovery — answering all 3 correctly allows password reset AND disables 2FA. Full account reset flow.
- **D-14:** Recovery page accessible at `/recover` without authentication. "Forgot password?" link on login page.
- **D-15:** Same rate limiting on recovery as login — 5 failed attempts, 15-minute lockout.
- **D-16:** After successful password recovery, all existing Redis sessions are invalidated. User must log in with new password.

### 2FA (TOTP)
- **D-17:** 2FA setup shows QR code (for scanning) plus the secret key as copyable text below. Covers accessibility and same-device scenarios.
- **D-18:** No backup codes — security questions already handle the lost-device scenario by bypassing 2FA during recovery.
- **D-19:** 2FA setup requires verifying a valid TOTP code before activation. Prevents locking out with a misconfigured authenticator.
- **D-20:** Disabling 2FA requires both current password AND a valid TOTP code.
- **D-21:** TOTP clock skew tolerance: ±1 window (90-second total window). Standard practice for slight clock drift.

### Password Policy
- **D-22:** Minimum 12 characters, no complexity rules (no forced uppercase/numbers/symbols). Follows NIST SP 800-63B recommendation of length over complexity.
- **D-23:** Password change invalidates all other sessions except the current one. Consistent with recovery behavior.
- **D-24:** Change password modal shows character count and 12-char minimum indicator. Turns green when met. No external strength library.

### Session Management
- **D-25:** Concurrent sessions allowed — multiple browsers/devices each with independent 24-hour sliding windows.
- **D-26:** "Log out all other sessions" button in the Security section of settings. Wipes all Redis sessions except current.

### Settings Page
- **D-27:** Single scrollable page with three sections: Profile (name, email, username, image), Preferences (timezone, date format, entries-per-page), Security (password, 2FA, security questions, active sessions).
- **D-28:** Per-section Save buttons. Each section saves independently.
- **D-29:** Profile image uploaded via multer, stored in Docker volume media directory. Resized to square thumbnail. Same storage pattern as Phase 6 media.
- **D-30:** Password change, 2FA management, and security questions open as modals from the Security section. Main page shows current status only.

### Login Tracking
- **D-31:** Track and display last login timestamp. Shown on the account page or dashboard. No full audit log of login attempts.

### Claude's Discretion
- Login page visual design (minimal vs branded) — pick what works best with the frontend
- Frontend auth state management approach (TanStack Query, Zustand, React context)
- Protected route wrapper pattern for the SPA
- Exact predefined security question list (standard set of ~10)
- Entries-per-page dropdown options
- Date format options list (8 per SETTINGS-01)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §AUTH — AUTH-01 through AUTH-07: authentication requirements
- `.planning/REQUIREMENTS.md` §SETTINGS — SETTINGS-01: user settings requirements
- `.planning/ROADMAP.md` §Phase 2 — Success criteria (4 items that must be TRUE)

### Project Context
- `.planning/PROJECT.md` §Constraints — Single-user, self-hosted, Docker Compose on Proxmox
- `.planning/PROJECT.md` §Context — HTTPS via Cloudflare Tunnel, single-user scope

### Phase 1 Foundation
- `.planning/phases/01-infrastructure-foundation/01-CONTEXT.md` — Infrastructure decisions that constrain Phase 2 (Express middleware order, Redis setup, CSRF wiring)
- `packages/api/src/app.ts` — Express app factory where session middleware must be inserted
- `packages/api/src/middleware/csrf.ts` — Has `TODO(phase-2)` for wiring session ID into `getSessionIdentifier`
- `packages/db/src/schema/index.ts` — Empty schema barrel where `users` table schema goes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/encryption.ts` — AES-256-GCM encrypt/decrypt for future OAuth token storage (not used in Phase 2 directly, but same `shared` package pattern)
- `packages/shared/src/env.ts` — `requireEnv()` utility for env var validation
- `packages/shared/src/logger.ts` — `createLogger()` for structured logging
- `packages/api/src/middleware/correlation-id.ts` — UUID correlation ID middleware pattern to follow
- `packages/api/src/middleware/error-handler.ts` — Centralized error handling pattern

### Established Patterns
- Express app uses dependency injection: `createApp({ redis, sql })` — session middleware will need `redis` for connect-redis store
- Middleware ordering: correlationId → httpLogger → securityHeaders → json → cookieParser → csrf → routes → errorHandler. Session middleware inserts after cookieParser, before csrf.
- Routes created via factory functions (`createHealthRouter`) — auth routes should follow same pattern (`createAuthRouter`)
- DB client uses `postgres` driver via `createDbClient()` — Drizzle ORM for schema and queries
- API entry point validates required env vars at startup via `requireEnv()`

### Integration Points
- `packages/api/src/middleware/csrf.ts:9` — `getSessionIdentifier` has a `TODO(phase-2)` to replace `'anonymous'` with `req.session.id`
- `packages/api/src/app.ts` — `express-session` + `connect-redis` middleware added to the chain
- `packages/db/src/schema/index.ts` — `users` table schema added here
- `packages/api/src/index.ts` — New env vars added to `requireEnv()` calls (e.g., `SESSION_SECRET`)
- `packages/web/src/App.tsx` — Currently a stub; Phase 2 adds routing, login page, setup wizard, settings page

</code_context>

<specifics>
## Specific Ideas

- Setup wizard should feel lightweight — not a multi-step wizard with progress bars. Just a single form: email, password, confirm password, timezone picker.
- The security questions recovery flow should be its own `/recover` page, not buried in settings. It's the emergency exit.
- 2FA setup modal should show the QR code prominently with the text secret below in a monospace copyable block.
- Rate limiting (5 attempts / 15 min lockout) applies consistently to both login and recovery. Tracked per IP or per-account (since there's only one account, either works).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-authentication-user-account*
*Context gathered: 2026-04-07*
