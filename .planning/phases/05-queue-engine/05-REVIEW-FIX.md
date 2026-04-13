---
phase: 05-queue-engine
fixed_at: 2026-04-13T11:29:23Z
review_path: .planning/phases/05-queue-engine/05-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 5
skipped: 1
status: partial
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-04-13T11:29:23Z
**Source review:** .planning/phases/05-queue-engine/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 5
- Skipped: 1

## Fixed Issues

### WR-01: Recycling path bulk update and MIN select are not atomic

**Files modified:** `packages/worker/src/queue-scanner.ts`
**Commit:** 1e4d1c0
**Applied fix:** Moved the post selection query, the published-to-queued recycling bulk update, the MIN(queue_position) select, and the cursor advance into a single `db.transaction()` call. The transaction callback returns the selected post (or null) so TypeScript can properly type-narrow it. BullMQ enqueue calls remain outside the transaction since they are not DB operations.

### WR-02: `removePostFromQueue` does not reset post status to `draft`

**Files modified:** `packages/api/src/services/queue.service.ts`
**Commit:** 69e2814
**Applied fix:** Added `status: 'draft'` to the `.set()` clause in `removePostFromQueue`. Also added `eq(posts.status, 'queued')` to the `.where()` clause so the status reset only applies to posts currently in `queued` state, avoiding interference with posts in `publishing` or other transient states.

### WR-03: `createQueuesRouter` receives `autoDestructQueueService` but never uses it

**Files modified:** `packages/api/src/routes/queues.ts`, `packages/api/src/app.ts`
**Commit:** e55275d
**Applied fix:** Removed `autoDestructQueueService` from the `QueuesDependencies` interface and the dead `AutoDestructQueueService` type import in the queues router. Also cleaned up the corresponding dead code in `app.ts`: removed the field from `AppDependencies`, the destructuring parameter, the type import, and the argument passed to `createQueuesRouter()`. No callers were passing the value.

### WR-05: `useRemoveFromQueue` mutation has no error feedback to the user

**Files modified:** `packages/web/src/hooks/use-queue-posts.ts`
**Commit:** 1fab3e0
**Applied fix:** Added `onError` callback with `toast.error("Couldn't remove post from queue. Try again.")`, consistent with the error handling pattern used by `useMovePostUp` and `useMovePostDown` in the same file.

### WR-06: `HourWindowGrid` "Clear All" allows submitting an invalid form

**Files modified:** `packages/web/src/components/queues/HourWindowGrid.tsx`
**Commit:** dc00bdd
**Applied fix:** Added `disabled={value.length === 0}` to the "Clear All" button with `disabled:opacity-50 disabled:cursor-not-allowed` Tailwind classes for visual feedback. This prevents the user from clearing an already-empty selection and encountering a confusing validation error on submit.

## Skipped Issues

### WR-04: `QueueStatusBadge` seasonal pause logic is inverted for cross-year windows

**File:** `packages/web/src/components/queues/QueueStatusBadge.tsx:18-23`
**Reason:** Reviewer's analysis is incorrect. The existing code `today < seasonalStart && today > seasonalEnd` for cross-year windows is actually correct when using MM-DD string comparison. For example, with a Nov-Jan window (start="11-01", end="01-31"): March ("03-15") correctly evaluates as paused because "03-15" < "11-01" (true) AND "03-15" > "01-31" (true). December ("12-15") correctly evaluates as active because "12-15" < "11-01" is false. January ("01-05") correctly evaluates as active because "01-05" > "01-31" is false. The reviewer confused lexicographic string comparison with numeric/calendar reasoning. No code change needed.
**Original issue:** The `isInSeasonalPause` function allegedly has inverted logic for cross-year seasonal windows, causing queues with Nov-Jan windows to always show as "Active" during Feb-Oct.

---

_Fixed: 2026-04-13T11:29:23Z_
_Fixer: gsd-code-fixer_
_Iteration: 1_
