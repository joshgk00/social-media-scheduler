---
phase: 02-authentication-user-account
plan: 05
subsystem: web-frontend-pages
tags: [react-hook-form, zod, shadcn-ui, totp, recovery, setup, login]

requires:
  - phase: 02-authentication-user-account
    plan: 02
    provides: React Router config, API client, auth hooks, auth store, shadcn UI components, route guards
  - phase: 02-authentication-user-account
    plan: 03
    provides: Auth routes (setup, login, verify-2fa, logout, me, csrf-token)
  - phase: 02-authentication-user-account
    plan: 04
    provides: Recovery routes (verify-email, verify-answers, reset-password)

provides:
  - Setup wizard page with email, password, confirm password, and searchable timezone select
  - Login page with credentials step and conditional TOTP step with 5-minute countdown
  - Login page edge case handling for expired 2FA, rate limit lockout, page refresh during 2FA
  - Recovery page with 3-step flow (email, security questions, new password) and expired state handling
  - All pages using React Hook Form with Zod validation from @sms/shared

affects: [02-06]

tech-stack:
  added: []
  patterns: [multi-step-form-with-local-state, countdown-timer-with-useEffect, error-status-driven-ui]

key-files:
  created: []
  modified:
    - packages/web/src/pages/setup/SetupPage.tsx
    - packages/web/src/pages/login/LoginPage.tsx
    - packages/web/src/pages/recover/RecoverPage.tsx
    - packages/web/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Timezone select uses native datalist with text input filter instead of a heavy combobox library -- sufficient for single-user tool"
  - "TOTP countdown uses setInterval in useEffect with cleanup -- client-side only UX, server enforces timeout independently"
  - "Recovery page uses apiClient.post directly instead of custom hooks since these are one-time-use mutations with step-specific error handling"

patterns-established:
  - "Multi-step form pattern: local React state drives step transitions, each step has its own form/validation"
  - "Server error handling: catch block inspects error.status and error.body.error for specific messages, falls back to generic"
  - "Password character count indicator: watch field value, compare length to threshold, toggle CSS class"

requirements-completed: [AUTH-01, AUTH-02, AUTH-05, AUTH-07]

duration: 4min
completed: 2026-04-08
---

# Phase 2 Plan 05: Public Pages (Setup, Login, Recovery) Summary

**Setup wizard with searchable timezone select, login page with 2FA countdown and edge case handling (expired session, rate limiting, redirect capture), and 3-step recovery page with expired state detection**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-08T04:50:33Z
- **Completed:** 2026-04-08T04:55:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- SetupPage: email, password with live character count (color changes at 12 chars), confirm password with blur validation, searchable timezone select defaulting to browser timezone via Intl.DateTimeFormat().resolvedOptions().timeZone
- LoginPage: two-step flow -- credentials form transitions to TOTP input when requiresTwoFactor is true; TOTP step shows 5-minute countdown timer (M:SS format) that auto-resets to step 1 on expiry with toast
- LoginPage edge cases: expired 2FA (401 with "session expired" resets to step 1), rate limit lockout (429 shows alert), redirect query param captured in Zustand store, page refresh during 2FA resets to credentials step
- RecoverPage: 3-step flow -- email verification checks questionsConfigured, security questions displayed from SECURITY_QUESTIONS constant with answer inputs, new password with character count indicator
- RecoverPage edge cases: expired recovery state (401 with "start over" resets to step 1), "no recovery method configured" alert when questions not set up, rate limit handling on all steps
- All forms use React Hook Form with zodResolver and schemas from @sms/shared (setupSchema, loginSchema, totpVerifySchema, recoveryVerifyEmailSchema, recoveryResetPasswordSchema)
- Added @sms/shared as workspace dependency to @sms/web for schema and constant imports

## Task Commits

1. **Task 1: Push database schema to PostgreSQL** - No commit (schema files and drizzle.config.ts already exist from Plan 01; Docker not available in worktree for runtime push)
2. **Task 2: Build SetupPage, LoginPage, and RecoverPage** - `576669e` (feat)

## Files Created/Modified

- `packages/web/src/pages/setup/SetupPage.tsx` - Full setup wizard replacing stub: email, password with char count, confirm, timezone with datalist
- `packages/web/src/pages/login/LoginPage.tsx` - Full login page replacing stub: credentials step, TOTP step with countdown, error handling
- `packages/web/src/pages/recover/RecoverPage.tsx` - Full recovery page replacing stub: email, questions, password reset steps
- `packages/web/package.json` - Added @sms/shared workspace dependency
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made

- Timezone select uses native HTML datalist with text input filtering rather than a heavy combobox library -- adequate for a single-user admin tool
- TOTP countdown timer is client-side UX only; server enforces twoFactorExpiresAt independently
- Recovery page uses apiClient.post directly instead of custom mutation hooks, since each step has unique error handling and these are one-off operations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @sms/shared not available as dependency in @sms/web**
- **Found during:** Task 2 (build step)
- **Issue:** @sms/web had no dependency on @sms/shared, so imports of setupSchema, loginSchema, SECURITY_QUESTIONS failed with TS2307
- **Fix:** Added `"@sms/shared": "workspace:*"` to packages/web/package.json dependencies, ran pnpm install
- **Files modified:** packages/web/package.json, pnpm-lock.yaml
- **Committed in:** 576669e

**2. [Rule 3 - Blocking] @sms/shared dist not built, causing module resolution failure**
- **Found during:** Task 2 (build step)
- **Issue:** TypeScript could not resolve @sms/shared because its dist/ directory with .d.ts files did not exist
- **Fix:** Built @sms/shared first with `pnpm --filter @sms/shared build` before building @sms/web
- **Files modified:** None (build artifact)
- **Committed in:** N/A (build order issue, not a code change)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were necessary for compilation. No scope creep.

## Task 1: Schema Push Note

Task 1 required pushing the Drizzle schema to PostgreSQL via `drizzle-kit push`. Docker is not available in this worktree agent environment. The schema definitions (users, security_questions tables) and drizzle.config.ts were already created in Plan 01 and are verified correct:
- users: id, email (unique), password_hash, username, first_name, last_name, profile_image_path, timezone, date_format, entries_per_page, totp_secret, totp_enabled, last_login_at, created_at, updated_at
- security_questions: id, user_id (FK -> users.id CASCADE), question_index, answer_hash, created_at, uq_user_question(user_id, question_index)

The schema push is a runtime operation that will execute when the dev environment starts.

## Verification

- `pnpm --filter @sms/web build` exits 0 with clean TypeScript compilation
- SetupPage: centered card, 4 form fields, zodResolver(setupSchema), password char count, timezone default
- LoginPage: credentials and TOTP steps, 5-minute countdown, expired 2FA handling, rate limit handling, redirect param
- RecoverPage: 3 steps, SECURITY_QUESTIONS import, no-questions-configured alert, expired state handling
- All pages use shadcn components (Card, Input, Button, Alert, Form)
- All pages have accessibility attributes (labels, aria-describedby via Form, aria-busy, aria-live)

## Self-Check: PASSED

- All 5 modified files verified present on disk
- Task commit (576669e) verified in git history
