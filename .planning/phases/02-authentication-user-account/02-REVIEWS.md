---
phase: 2
reviewers: [codex]
reviewed_at: 2026-04-07T12:00:00Z
plans_reviewed: [02-01-PLAN.md, 02-02-PLAN.md, 02-03-PLAN.md, 02-04-PLAN.md, 02-05-PLAN.md, 02-06-PLAN.md]
---

# Cross-AI Plan Review -- Phase 2

## Codex Review

### Plan 02-01: DB Schema, Shared Zod Schemas, Session/Auth/Rate-Limit Middleware

**Summary:** Strong foundation plan and mostly the right place to centralize core auth primitives, but it mixes too many concerns into one wave item: schema, validation, session infrastructure, auth guard behavior, rate limiting, CSRF, and session invalidation. Creates risk because several downstream plans depend on this behaving correctly, and some important data model and security details are either missing or under-specified.

**Strengths:**
- Puts shared schema and middleware work early -- correct since almost every later plan depends on it
- Separates shared Zod schemas/constants from route logic, reducing duplication across frontend and backend
- Correctly chooses Redis-backed sessions and rolling 24-hour max age to match the phase requirement
- Includes session invalidation utilities early, supporting password change and recovery requirements later
- Recognizes `pendingTwoFactor` as a distinct session/auth state

**Concerns:**
- HIGH: `users` schema appears incomplete -- no field for whether setup is complete beyond first-user existence, no storage for security-question recovery state/versioning
- HIGH: Single `security_questions` table with only `questionIndex` and `answerHash` is underspecified unless uniqueness constraints are defined. Need at least `(userId, questionIndex)` uniqueness
- HIGH: Lockout/rate-limit design is vague. `express-rate-limit` alone may not satisfy "5 failed attempts trigger 15-minute lockout" if policy must be per account rather than per IP
- HIGH: Session invalidation via Redis `SCAN` can work for single-user scale, but session data model must make user-to-session lookup practical
- MEDIUM: CSRF "session wiring" is too vague for state-changing cookie auth
- MEDIUM: Auth guard definition is ambiguous -- routes during pending 2FA need a different guard from fully authenticated routes
- MEDIUM: `totpSecret` in users table should state whether it is encrypted at rest

**Risk Assessment: MEDIUM-HIGH**

---

### Plan 02-02: Frontend Shell

**Summary:** Reasonable frontend bootstrap plan, but slightly too implementation-heavy for Wave 1. Shell/routing/query setup is appropriate in parallel with backend foundation work, but retry/CSRF/auth flow boundaries need more precision.

**Strengths:**
- Correctly keeps frontend shell work parallel to backend foundation
- Introduces route guards, auth hooks, and setup status handling early
- Uses thin auth store -- avoids overloading Zustand with server state
- Lazy-loaded page stubs are appropriate for incremental delivery

**Concerns:**
- MEDIUM: "Retry on 403" is risky -- could hide real failures or produce loops
- MEDIUM: Tailwind v4, shadcn init, dark theme, font choice, and 13 components feel like UI setup scope creep
- MEDIUM: `ProtectedRoute` redirect semantics may conflict with 2FA pending state
- MEDIUM: Setup flow needs inverse guards (redirect authenticated users away from /login, redirect post-setup away from /setup)

**Risk Assessment: MEDIUM**

---

### Plan 02-03: Auth Services and Routes

**Summary:** Covers core auth flows well and is the right Wave 2 dependency. Biggest issue is it does not explicitly cover several login edge cases and session-state transitions central to the 2FA design.

**Strengths:**
- Correctly separates service logic from route handlers
- Login flow includes session regeneration and separate 2FA verify route
- `/api/auth/me` placed here, enabling frontend session bootstrap
- Includes tests alongside implementation

**Concerns:**
- HIGH: Login flow does not explicitly describe lockout handling semantics between password and 2FA failures
- HIGH: Pending-2FA session state needs exact lifecycle rules (what expires, whether session regenerated again after successful 2FA)
- HIGH: `/api/auth/me` behavior is ambiguous for pending-2FA sessions
- MEDIUM: Setup route should guarantee atomic single-user enforcement -- "403 after first user" is not enough if two requests race
- MEDIUM: No explicit logout behavior for pending-2FA state
- MEDIUM: No mention of normalizing email input casing/whitespace

**Risk Assessment: MEDIUM-HIGH**

---

### Plan 02-04: Recovery, Password Change, Settings API, 2FA Settings, Security Questions

**Summary:** Broadest and riskiest plan in the set. Covers most remaining backend requirements but packs recovery, settings, 2FA settings flows, session management, file upload, and security-focused testing into one plan. Likely too much for one wave item.

**Strengths:**
- Covers nearly all remaining backend requirements in one place
- Recovery flow aligns with decisions: no enumeration, answer hashing, reset disables 2FA
- Includes 2FA setup as two-step activation flow with temporary session storage
- Password change invalidates other sessions per decision log

**Concerns:**
- HIGH: Recovery is security-critical and under-specified -- no mention of brute-force protection per account, attempt throttling across the 3-step flow, or expiry of recovery verification state
- HIGH: Security questions answer normalization rules must be precise and stable
- HIGH: Disabling 2FA requires password+TOTP per D-20, but AUTH-06 says password only -- mismatch needs resolution
- HIGH: `GET sessions (count)` and `logout-others` imply user-session indexing that Plan 02-01 does not fully define
- HIGH: File upload security is underspecified (MIME checks, extension policy, overwrite behavior, cleanup)
- MEDIUM: 100% branch coverage as explicit goal may incentivize low-value tests
- MEDIUM: No mention of authorization checks on settings routes against pending-2FA sessions

**Risk Assessment: HIGH**

---

### Plan 02-05: Schema Push, SetupPage, LoginPage, RecoverPage

**Summary:** Sensible Wave 3 implementation plan for user-facing auth pages, but backend dependency line is slightly too optimistic. Pages depend not just on routes existing but on well-defined auth-state responses.

**Strengths:**
- Defers full pages until relevant backend routes exist
- Groups setup, login, and recovery together as tightly related entry flows
- Reuses shared security-question constants
- Includes 2FA countdown timer and no-enumeration behavior

**Concerns:**
- MEDIUM: `drizzle-kit push` as a plan item is operational, not an implementation deliverable
- MEDIUM: Login page needs explicit behavior for expired 2FA, page refresh during pending 2FA, locked-out state
- MEDIUM: Recovery page needs explicit behavior if challenge state expires between steps
- MEDIUM: Setup page timezone source should be specified

**Risk Assessment: MEDIUM**

---

### Plan 02-06: SettingsPage with Modals, Human Verification

**Summary:** Completes the user-facing phase well in functionality but is UI-heavy and slightly over-designed for a single-user self-hosted app. Human verification checkpoint should be replaced with explicit E2E acceptance scenarios.

**Strengths:**
- Maps well to remaining success criteria
- Per-section save semantics aligned with D-27/D-28
- Uses modals for destructive or multi-step security operations

**Concerns:**
- MEDIUM: Eleven hooks for one settings page may be too granular
- MEDIUM: Four modals on one page -- state interactions can become messy
- MEDIUM: Avatar upload UX should define preview, replacement, and error cases
- LOW: "Human verification checkpoint" is too vague to enforce quality

**Risk Assessment: MEDIUM**

---

## Consensus Summary

### Agreed Strengths
- Wave ordering is sound: foundation first, core auth services second, user-facing pages third
- Shared schemas/constants introduced early for contract consistency
- Security decisions from CONTEXT.md are reflected in the plans
- Frontend shell correctly parallelized with backend foundation

### Agreed Concerns
- **Plan 02-04 is overloaded** -- should be split into recovery/security and settings/2FA/uploads
- **Security-critical behaviors are implied rather than specified**: account lockout semantics, pending-2FA session lifecycle, recovery-state expiry, CSRF validation contract, session invalidation indexing
- **Auth state transitions under-defined**: pending-2FA lifecycle, /me behavior for partial auth, session regeneration after 2FA completion
- **Rate limiting model unclear**: per-IP vs per-account, interaction between password failures and 2FA failures
- **File upload security underspecified**: MIME checks, size limits, metadata stripping, cleanup on replace

### Divergent Views
(Single reviewer -- no divergent views to report)

---

*Reviewed: 2026-04-07*
*Reviewer: Codex CLI (OpenAI)*
