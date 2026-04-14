---
phase: 05-queue-engine
fixed_at: 2026-04-13T20:15:00Z
review_path: .planning/phases/05-queue-engine/05-REVIEW.md
iteration: 2
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-04-13T20:15:00Z
**Source review:** .planning/phases/05-queue-engine/05-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 8
- Fixed: 8
- Skipped: 0

## Fixed Issues

### WR-01: `calculateNextRunAt` called with hardcoded `'UTC'` instead of user timezone

**Files modified:** `packages/api/src/services/queue.service.ts`
**Commit:** e22e614
**Applied fix:** Added `users` import from `@sms/db`. Both `createQueue` and `updateQueue` now query the user's timezone from the `users` table before calling `calculateNextRunAt`, falling back to `'UTC'` only if the user row is missing.

### WR-02: Frontend allows removing published posts but API rejects them

**Files modified:** `packages/web/src/components/queues/QueuePostActionsMenu.tsx`
**Commit:** 89680db
**Applied fix:** Restricted `DELETABLE_QUEUE_STATES` to `['queued']` only, matching the API's WHERE clause that filters on `status = 'queued'`. Published posts no longer show the delete action.

### WR-03: `seasonalRepeat` parameter is accepted but never used

**Files modified:** `packages/shared/src/lib/schedule-evaluation.ts`, `packages/worker/src/queue-scanner.ts`, `packages/shared/src/__tests__/schedule-evaluation.test.ts`
**Commit:** 91057e3
**Applied fix:** Removed the unused `seasonalRepeat` parameter from the `isWithinSeasonalWindow` function signature. Added a TODO comment documenting that one-time seasonal windows are not yet implemented. Updated the queue-scanner caller and all test invocations to match the new signature.

### WR-04: `QueueStatusBadge` seasonal pause logic is inverted for cross-year windows

**Files modified:** `packages/web/src/components/queues/QueueStatusBadge.tsx`
**Commit:** 29227d4
**Status:** fixed: requires human verification
**Applied fix:** Changed the cross-year branch from `today < seasonalStart && today > seasonalEnd` (impossible condition) to `today > seasonalEnd && today < seasonalStart`, which correctly identifies dates in the gap between end and start for cross-year windows (e.g., Feb-Oct for a Nov-Jan window). This aligns with the server-side logic in `schedule-evaluation.ts`.

### WR-05: `QueueDetail` type has `cursor` but API returns `cursorPosition`

**Files modified:** `packages/web/src/hooks/use-queues.ts`, `packages/web/src/pages/queues/QueuePostsPage.tsx`
**Commit:** 66c79a7
**Applied fix:** Renamed `cursor` to `cursorPosition` in the `QueueDetail` interface. Changed the fallback value from `1` to `0` in `QueuePostsPage.tsx` to match the DB schema default (`cursorPosition` defaults to `0`).

### WR-06: `addPostToQueue` silently swallows state transition errors

**Files modified:** `packages/api/src/services/queue.service.ts`
**Commit:** de5c9c5
**Applied fix:** Removed the try-catch wrapper around `transitionPost(post.status, 'queued')`. If the state machine rejects the `draft -> queued` transition, the error now propagates instead of being silently swallowed, preventing inconsistent queue/post state.

### WR-07: `useAddToQueue` mutation has no error feedback

**Files modified:** `packages/web/src/hooks/use-queue-posts.ts`
**Commit:** 6acd67a
**Applied fix:** Added `onError` callback with `toast.error("Couldn't add post to queue. Try again.")` to the `useAddToQueue` mutation, matching the error handling pattern used by `useMovePostUp`, `useMovePostDown`, and `useRemoveFromQueue`.

### WR-08: `removePostFromQueue` is not wrapped in a transaction

**Files modified:** `packages/api/src/services/queue.service.ts`
**Commit:** 2ac5f05
**Applied fix:** Wrapped the queue ownership check and post update in `db.transaction()`, using `tx` for both queries. This matches the pattern used by `addPostToQueue` and follows the CLAUDE.md convention for multi-step DB mutations. The logger call remains outside the transaction.

---

_Fixed: 2026-04-13T20:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
