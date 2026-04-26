# Phase 08 — Deferred Items

Items discovered during plan execution that fall outside the scope of the current plan but must be addressed by a future plan.

## From Plan 02 (schema-shared-and-migration) — RESOLVED in Plan 05a (2026-04-26)

### Web type errors from discriminated-union upgrade — RESOLVED

After upgrading `createPostSchema`, `updatePostSchema`, and `rateLimitStateSchema` to discriminated unions, several pre-existing web pages and components no longer typecheck. Plan 05a resolved every entry below; Plan 05b will replace the temporary narrowing in the rate-limit components with full per-platform copy.

| File | Symptom | Resolution |
|---|---|---|
| `packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx` | Reads `state.budget` directly | Plan 05a: narrowed on `platform === 'twitter'`, returns placeholder for LI/FB. Plan 05b will add the per-platform chip. |
| `packages/web/src/components/profiles/RateLimitSettingsDialog.tsx` | Same `budget` access pattern | Plan 05a: narrowed on `platform === 'twitter'`. Plan 05b will add LI/FB settings if those become user-configurable. |
| `packages/web/src/pages/posts/EditPostPage.tsx` | `updatePostSchema` no longer accepts `isThread` outside the twitter variant | Plan 05a: refactored to platform-aware submit body via `buildUpdatePayload`. |
| `packages/web/src/pages/posts/NewPostPage.tsx` | Submits without `platform` field | Plan 05a: refactored to platform-aware submit body via `buildPlatformPayload`. |
| `packages/web/src/components/posts/RateLimitBanner.tsx` | Reads `state.budget` directly | Plan 05a: narrowed on `platform === 'twitter'`. Plan 05b will add LI/FB banner copy. |

`pnpm --filter @sms/web build` exits 0. Plan 01 RED tests in scope (cross-platform-switch, VisibilitySelector, LinkedInPreview, FacebookPreview) are GREEN. The lone remaining RED test, `RateLimitsCard.test.tsx`, is Plan 05b's responsibility — Plan 05a created stub modules so `tsc -b` succeeds.

## From Plan 03 (api-routes-and-rate-limit)

### Pre-existing worker build errors (out of scope)

`pnpm --filter @sms/worker build` produces type errors in `transcode.service.ts` and `transcode.test.ts` related to `ChildProcess.on/emit` typings. These errors exist on `main` BEFORE Plan 03 lands (verified by checking out the pre-plan tip) and are unrelated to the rate-limit/post.service changes shipped in Plan 03.

| File | Symptom | Owning plan |
|---|---|---|
| `packages/worker/src/transcode.service.ts` | `Property 'on' does not exist on type 'ChildProcessWithoutNullStreams'` (lines 49, 64) | Phase 6 follow-up — node:child_process typings drift |
| `packages/worker/src/__tests__/transcode.test.ts` | `Property 'emit' does not exist on type 'ChildProcess'` (lines 119, 132, 171) | Phase 6 follow-up |

Plan 04 (worker publish services) is the next worker-modifying plan and will pick these up if the typings still drift.
