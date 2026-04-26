# Phase 08 — Deferred Items

Items discovered during plan execution that fall outside the scope of the current plan but must be addressed by a future plan.

## From Plan 02 (schema-shared-and-migration)

### Web type errors from discriminated-union upgrade

After upgrading `createPostSchema`, `updatePostSchema`, and `rateLimitStateSchema` to discriminated unions, several pre-existing web pages and components no longer typecheck because they were authored against the previous single-shape schemas. These are expected — Plans 05a / 05b will refactor the web layer to discriminate on `platform`. Tracking here so they are not silently masked.

| File | Symptom | Owning plan |
|---|---|---|
| `packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx` | Reads `state.budget` directly; needs `platform === 'twitter'` narrow | 05b |
| `packages/web/src/components/profiles/RateLimitSettingsDialog.tsx` | Same `budget` access pattern | 05b |
| `packages/web/src/pages/posts/EditPostPage.tsx` | `updatePostSchema` no longer accepts `isThread` outside the twitter variant | 05a |
| `packages/web/src/pages/posts/NewPostPage.tsx` | Submits without `platform` field; needs platform tag | 05a |

`pnpm --filter @sms/api build` and `pnpm --filter @sms/shared build` pass — only the web layer needs the follow-up. Tests for the affected web components were shipped in Plan 01 and remain RED (intended).

## From Plan 03 (api-routes-and-rate-limit)

### Pre-existing worker build errors (out of scope)

`pnpm --filter @sms/worker build` produces type errors in `transcode.service.ts` and `transcode.test.ts` related to `ChildProcess.on/emit` typings. These errors exist on `main` BEFORE Plan 03 lands (verified by checking out the pre-plan tip) and are unrelated to the rate-limit/post.service changes shipped in Plan 03.

| File | Symptom | Owning plan |
|---|---|---|
| `packages/worker/src/transcode.service.ts` | `Property 'on' does not exist on type 'ChildProcessWithoutNullStreams'` (lines 49, 64) | Phase 6 follow-up — node:child_process typings drift |
| `packages/worker/src/__tests__/transcode.test.ts` | `Property 'emit' does not exist on type 'ChildProcess'` (lines 119, 132, 171) | Phase 6 follow-up |

Plan 04 (worker publish services) is the next worker-modifying plan and will pick these up if the typings still drift.
