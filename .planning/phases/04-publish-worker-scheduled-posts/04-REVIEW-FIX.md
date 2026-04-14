---
phase: 04-publish-worker-scheduled-posts
status: all_fixed
findings_in_scope: 4
fixed: 4
skipped: 0
iteration: 1
date: 2026-04-10
---

# Phase 4: Code Review Fix Report

**Fixed at:** 2026-04-10
**Source review:** .planning/phases/04-publish-worker-scheduled-posts/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: `publishing` state set without verifying the UPDATE matched a row

**Files modified:** `packages/worker/src/post-lifecycle.service.ts`
**Commit:** 08a3e17
**Applied fix:** Added `.returning({ id: posts.id })` to the `scheduled -> publishing` UPDATE statement inside the lifecycle transaction. If the UPDATE matches zero rows (version mismatch between SELECT FOR UPDATE and UPDATE), the code now throws `PostLifecycleAbort('version_mismatch')` instead of silently proceeding to call Twitter. This adds a hard backstop against the race window described in the review.

### WR-01: Division by zero in `ProfileRateLimitIndicator` and `RateLimitBanner` when budget is 0

**Files modified:** `packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx`, `packages/web/src/components/posts/RateLimitBanner.tsx`
**Commit:** c55b8e4
**Applied fix:** Guarded both `percent` calculations with `data.budget > 0 ? ... : 0`. When budget is 0, percent resolves to 0 instead of `NaN`. This matches the existing guard pattern in `RateLimitSettingsDialog.tsx:71`.

### WR-02: `useRetryPost` fires and forgets without disabling the button

**Files modified:** `packages/web/src/pages/posts/PostsPage.tsx`
**Commit:** 42063cf
**Applied fix:** Added `retryingPostIds` state (a `Set<string>`) that tracks which post IDs have an in-flight retry request. `handleRetry` now early-returns if the postId is already in the set, adds it before firing the request, and removes it in `.finally()`. This prevents double-clicks from producing duplicate BullMQ jobs.

### WR-03: `EditPostPage` does not surface a `twitter_budget_exceeded` 409 from PATCH

**Files modified:** `packages/web/src/pages/posts/EditPostPage.tsx`
**Commit:** e8d5c2f
**Applied fix:** Added a `twitter_budget_exceeded` code check as the first branch inside the `error.status === 409` handler, before the existing `modified elsewhere` / `being published` checks. When the 409 body contains `code: 'twitter_budget_exceeded'`, a toast displays the budget/count values. This matches the pattern established in `NewPostPage.tsx`.

---

_Fixed: 2026-04-10_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
