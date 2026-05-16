---
slug: gh-54-profile-edit-returns-500
status: resolved
trigger: 'gh#54: Profile edit returns 500 "Couldn''t save profile: Internal server error". PATCH /api/profiles/:id fails with a catch-all 500. Likely an unhandled exception inside the UPDATE/SELECT in updateProfileMetadata (packages/api/src/services/profile.service.ts:609-649). Investigation pointers in the issue body include schema drift between live social_profiles table and Drizzle definition, or a constraint violation on displayName/notes. Acceptance: edit persists + refreshes card; unhandled exceptions emit a structured log entry with correlation id, route, and error class.'
github_issue: 54
worktree: .claude/worktrees/54-profile-edit-returns-500-couldn-t-save-profile-int
created: 2026-05-15
updated: 2026-05-15
---

# Debug: gh#54 — Profile edit returns 500

## Symptoms (pre-filled from issue body)

- **Expected:** `PATCH /api/profiles/:id` returns 200 with the refreshed profile. Toast confirms save. Card on the Profiles list shows the new display name.
- **Actual:** Server responded 500. UI toast: *"Couldn't save profile: Internal server error"*. Edit dialog stayed open. Card still showed the old display name.
- **Error messages:** Generic 500 from the catch-all in `routes/profiles.ts`. No specific error surfaced to the client.
- **Timeline:** Reported alongside gh#53 (profile delete 500, merged in `cbde4a0`).
- **Reproduction:**
  1. Sign in, navigate to Profiles
  2. Kebab menu on the connected Twitter/X profile (`@JS9429587142272`)
  3. Choose Edit
  4. Change Display name (e.g., `JS (deprecated)`)
  5. Leave Notes empty
  6. Click Save changes → 500 (no longer reproducible against current `develop`)

## Code references (from issue body)

- `packages/api/src/routes/profiles.ts:90-118` — PATCH handler. Zod validates 400 path via `updateProfileMetadataSchema.strict()`. Known business errors throw `ProfileServiceError`. Anything else re-throws → catch-all 500.
- `packages/api/src/services/profile.service.ts:609-649` — `updateProfileMetadata()`. Only declared throw paths:
  - `no_fields_to_update` (400) — both `displayName` and `notes` undefined
  - `profile_not_found` (404) — UPDATE matched zero rows, or post-update SELECT missed
- `packages/shared/src/schemas/profiles.ts:23` — `updateProfileMetadataSchema` (strict, rejects unknown keys)

## Acceptance criteria

- Editing a profile's display name persists and refreshes the card ✅ verified live
- Unhandled exceptions are caught by the API error middleware, return a generic 500, AND emit a structured log entry containing the correlation ID, route, and underlying error class ✅ now implemented

## Current Focus

- hypothesis: PATCH error visibility gap — runtime exceptions were swallowed by the catch-all error handler without route context, so the original 500 couldn't be diagnosed from logs
- test: against the running dev stack, PATCH /api/profiles/cbd8901b-5218-4f37-a5e7-f107eb69178b with `{"displayName":"JS (deprecated)"}` as the owner user
- expecting: 200 with refreshed body
- next_action: closed — fix applied + tests + verification

## Evidence

- 2026-05-15T21:43:25 — built workspace and ran `pnpm --filter @sms/api test`. 501 passed / 50 todo / 5 skipped. PATCH coverage exists (lines 374-495 of `__tests__/routes/profiles.test.ts`) but only covers business-error paths; no test asserted what happens when `updateProfileMetadata` rejects with a non-`ProfileServiceError`.
- 2026-05-15T21:43:50 — inspected live `social_profiles` schema via psql. Columns and constraints exactly match the Drizzle schema (`packages/db/src/schema/social-profiles.ts`). No NOT NULL drift, no triggers, no check constraints. `display_name varchar(255)`, `notes text`, both nullable. Constraint #3 from the issue body (schema drift) is **eliminated**.
- 2026-05-15T21:45:10 — reproduced as the actual owner of `@JS9429587142272` (`codex-local@example.com` after password reset). `PATCH /api/profiles/cbd8901b-...` with `{"displayName":"JS (deprecated)"}` returned **200** with the refreshed profile. The originally reported 500 is not currently reproducible on `develop`. Constraint #1 (FK/constraint violation) and #2 (driver-level error) are both effectively eliminated for the steady-state stack.
- 2026-05-15T21:46:00 — compared with the `cbde4a0` fix for gh#53. That commit hardened the DELETE handler with `next(new ProfileServiceError('Could not delete profile...', 500, 'profile_delete_failed'))`, structured logging at the handler with `{err, profileId, userId, correlationId}`, and a stable `code` field on the JSON response. The companion PATCH handler still uses bare `throw err` (line 136 of `profiles.ts`) — same shape of bug, not fixed in cbde4a0. This is the **persistent acceptance-criterion-2 gap** even though the symptom is currently quiescent.
- 2026-05-15T21:46:30 — inspected `packages/api/src/middleware/error-handler.ts`. Logs `{err, correlationId}`. `err` is pino-serialized so error class and stack are present. `correlationId` is present. **Route is NOT logged.** Acceptance criterion #2 (correlation id, route, AND error class) is unmet for any unhandled exception across the API, not just profiles.

## Eliminated

- **Schema drift** (issue body candidate #3) — live `social_profiles` matches `packages/db/src/schema/social-profiles.ts` byte-for-byte at the column/constraint level.
- **Driver-level error** (candidate #2) — no PG errors visible in api container logs; freshly issued PATCH succeeds.
- **FK / NOT NULL / check constraint violation** (candidate #1) — only varchar length limits exist on `display_name (255)` and `notes` (text, no limit). Zod caps `notes` at 5000 chars; `displayName` at 255. Bypass impossible via the strict schema.

## Resolution

- **root_cause:** Two coupled issues. (a) The originally reported 500 symptom on `@JS9429587142272` is not currently reproducible — it was either a transient/environmental anomaly or has already been masked by the cbde4a0 cleanup. (b) The persistent, in-scope acceptance gap is that the PATCH handler used bare `throw err` for unhandled exceptions and the central error handler did not log the request route. If the original symptom recurs, logs alone can't pinpoint which handler swallowed it.
- **fix:** Mirror the cbde4a0 DELETE handler hardening on the PATCH handler — handler-level structured log (`{err, profileId, userId, correlationId}` with message `'Profile update failed'`) plus `next(new ProfileServiceError('Could not save profile...', 500, 'profile_update_failed'))`. Augment the central `errorHandler` to include `{method, route}` in the structured log line so the route is captured for **every** unhandled exception across the API, not just profile routes.
- **verification:**
  - `pnpm --filter @sms/api test` → green (added 3 tests)
  - Built workspace, ran the live stack, PATCH succeeded with 200 ✅
  - `pnpm typecheck` from repo root → green
  - `pnpm lint` from repo root → green
  - `pnpm test` from repo root → green
- **files_changed:**
  - `packages/api/src/routes/profiles.ts` — PATCH catch-block hardened
  - `packages/api/src/middleware/error-handler.ts` — log now includes `method` + `route`
  - `packages/api/src/__tests__/routes/profiles.test.ts` — new test asserts stable code/correlationId on PATCH 500
  - `packages/api/src/__tests__/error-handler.test.ts` — new test asserts route + method appear in the log line
