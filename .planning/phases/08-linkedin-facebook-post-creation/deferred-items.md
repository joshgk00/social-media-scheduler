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
