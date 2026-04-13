---
phase: 05-queue-engine
reviewed: 2026-04-13T00:00:00Z
depth: standard
files_reviewed: 37
files_reviewed_list:
  - packages/api/src/__tests__/routes/queues.test.ts
  - packages/api/src/app.ts
  - packages/api/src/routes/queues.ts
  - packages/api/src/services/auto-destruct-queue.service.ts
  - packages/api/src/services/queue.service.ts
  - packages/db/src/schema/index.ts
  - packages/db/src/schema/posts.ts
  - packages/db/src/schema/queues.ts
  - packages/shared/src/__tests__/schedule-evaluation.test.ts
  - packages/shared/src/__tests__/spinnable-text.test.ts
  - packages/shared/src/constants/queues.ts
  - packages/shared/src/index.ts
  - packages/shared/src/lib/schedule-evaluation.ts
  - packages/shared/src/lib/spinnable-text.ts
  - packages/shared/src/schemas/queues.ts
  - packages/web/src/App.tsx
  - packages/web/src/components/layout/Sidebar.tsx
  - packages/web/src/components/posts/PostStatusBadge.tsx
  - packages/web/src/components/queues/DayOfWeekSelector.tsx
  - packages/web/src/components/queues/HourWindowGrid.tsx
  - packages/web/src/components/queues/QueueActionsMenu.tsx
  - packages/web/src/components/queues/QueuePostActionsMenu.tsx
  - packages/web/src/components/queues/QueueStatusBadge.tsx
  - packages/web/src/components/queues/ScheduleBuilder.tsx
  - packages/web/src/components/queues/SpinnableVariantsDialog.tsx
  - packages/web/src/hooks/use-queue-posts.ts
  - packages/web/src/hooks/use-queues.ts
  - packages/web/src/pages/posts/NewPostPage.tsx
  - packages/web/src/pages/queues/QueueDetailPage.tsx
  - packages/web/src/pages/queues/QueuePostsPage.tsx
  - packages/web/src/pages/queues/QueuesPage.tsx
  - packages/worker/src/__tests__/auto-destruct-worker.test.ts
  - packages/worker/src/__tests__/queue-scanner.test.ts
  - packages/worker/src/auto-destruct-lifecycle.service.ts
  - packages/worker/src/auto-destruct-worker.ts
  - packages/worker/src/index.ts
  - packages/worker/src/queue-scanner.ts
  - packages/worker/src/twitter-delete.service.ts
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-04-13
**Depth:** standard
**Files Reviewed:** 37
**Status:** issues_found

## Summary

Phase 5 delivers the queue engine: the `evaluateQueues` scanner, auto-destruct lifecycle, queue CRUD API routes, and the full React UI for creating and managing queues. The core logic is solid. The `calculateNextRunAt` DST handling is correct, the three-phase auto-destruct pattern mirrors the publish lifecycle correctly, and the transaction-based atomic cursor advance properly prevents double-enqueue.

The issues below are all correctness or logic gaps — no security vulnerabilities were found. The most consequential is a race condition in the recycling path: the published→queued bulk update and the subsequent MIN(queue_position) select are not inside the same transaction, which means another scanner tick (or a concurrent worker restart) could race between those two operations.

---

## Warnings

### WR-01: Recycling path bulk update and MIN select are not atomic

**File:** `packages/worker/src/queue-scanner.ts:197-229`

**Issue:** When recycling triggers, the code bulk-updates all `published` posts back to `queued` (line 199-207), then does a separate `SELECT ... ORDER BY queue_position ASC LIMIT 1` to find the next post (lines 210-228). These two operations are outside the transaction at line 255. If the scanner runs concurrently on a second tick (unlikely but possible due to slow DB operations), or if the process restarts between lines 207 and 229, the `published→queued` transition commits but `nextPost` is never set, the cursor is never advanced, and the queue stalls until the next tick resets it. Additionally, when the recycling reset happens for a queue with many posts, the second `SELECT` could pick up a post that was concurrently moved to a different queue or deleted between the two operations.

**Fix:** Move the bulk update, the MIN select, and the cursor advance into a single transaction:
```typescript
// Replace the unprotected recycle block + the later transaction block
// with a single transaction that does all three steps atomically.
let nextPost: QueuedPostRow | null = null;
await db.transaction(async (tx) => {
  // existing: find queued post after cursor
  const nextPosts = await tx.select(...).from(posts).where(...).orderBy(...).limit(1);
  nextPost = nextPosts[0] ?? null;

  if (!nextPost && queue.isRecycling) {
    // transition published -> queued
    await tx.update(posts).set({ status: 'queued', updatedAt: new Date() }).where(...);
    // find MIN position
    const minPosts = await tx.select(...).from(posts).where(...).orderBy(...).limit(1);
    nextPost = minPosts[0] ?? null;
  }

  if (nextPost) {
    // advance cursor + update nextRunAt
    await tx.update(queues).set({ cursorPosition: nextPost.queuePosition, ... }).where(...);
  }
});
// enqueue outside transaction (BullMQ calls must not be inside a DB tx)
if (nextPost) { await publishQueue.add(...); }
```

---

### WR-02: `removePostFromQueue` does not reset post status to `draft`

**File:** `packages/api/src/services/queue.service.ts:307-339`

**Issue:** When a post is removed from a queue, its `queueId` and `queuePosition` are nulled (line 323) but its `status` is left unchanged. A post that was automatically transitioned from `draft` to `queued` when added (line 289-294 in the same file) will remain in `queued` status after removal. A `queued` post with no `queueId` is an inconsistent state: the worker scanner will never pick it up (it filters by `queueId`), and the UI will show it as "Queued" with no queue association. This will confuse users and may block the post from being rescheduled.

**Fix:** Reset to `draft` on removal:
```typescript
const updatedRows = await db
  .update(posts)
  .set({
    queueId: null,
    queuePosition: null,
    status: 'draft',   // add this
    updatedAt: new Date(),
  })
  .where(
    and(
      eq(posts.id, postId),
      eq(posts.userId, userId),
      eq(posts.queueId, queueId),
    ),
  )
  .returning({ id: posts.id });
```
Only reset to `draft` when the current status is `queued` — add an `eq(posts.status, 'queued')` to the `where` clause if you want to avoid touching posts already in `publishing` or other states (though the existing logic already guards against removing publishing posts at the route level).

---

### WR-03: `createQueuesRouter` receives `autoDestructQueueService` in its dependency object but never uses it

**File:** `packages/api/src/routes/queues.ts:28`

**Issue:** The `QueuesDependencies` interface declares `autoDestructQueueService?: AutoDestructQueueService` (line 25), but `createQueuesRouter` destructures only `{ db }` from its argument (line 28), silently discarding the service. The type is imported at line 19 but is dead code. If auto-destruct is supposed to be triggered from a queue API action (e.g., when a post is removed from a recycling queue and needs its scheduled auto-destruct job cancelled), that integration is missing.

**Fix:** If `autoDestructQueueService` is intentionally unused in routes (because auto-destruct is only enqueued from the publish worker), remove it from the interface and the import to avoid misleading readers:
```typescript
// routes/queues.ts
interface QueuesDependencies {
  db: Db;
  // Remove: autoDestructQueueService?: AutoDestructQueueService;
}
// Remove: import type { AutoDestructQueueService } from '../services/auto-destruct-queue.service.js';
```

---

### WR-04: `QueueStatusBadge` seasonal pause logic is inverted for cross-year windows

**File:** `packages/web/src/components/queues/QueueStatusBadge.tsx:18-23`

**Issue:** The `isInSeasonalPause` function determines whether the queue is *outside* its seasonal window (i.e., in a pause). For a cross-year window where `seasonalStart > seasonalEnd` (e.g., Nov–Jan), the queue is active when `today >= start OR today <= end`. The code on line 21 returns `today < seasonalStart && today > seasonalEnd` for the cross-year case, which can never be true for valid dates (no date is simultaneously before November *and* after January). This means a queue with a Nov–Jan seasonal window will always show as "Active" when it should show "Seasonal pause" during Feb–Oct.

The server-side `isWithinSeasonalWindow` in `packages/shared/src/lib/schedule-evaluation.ts` has this logic correct (line 73-76). The frontend component reimplements it with the wrong condition.

**Fix:** Align with the shared library logic:
```typescript
function isInSeasonalPause(seasonalStart?: string | null, seasonalEnd?: string | null): boolean {
  if (!seasonalStart || !seasonalEnd) return false;
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${month}-${day}`;

  // Queue is active when today is within the window; paused otherwise
  if (seasonalStart <= seasonalEnd) {
    // Standard window: active when start <= today <= end
    return today < seasonalStart || today > seasonalEnd;
  }
  // Cross-year window (e.g. Nov-Jan): active when today >= start OR today <= end
  return today < seasonalStart && today > seasonalEnd; // WRONG — always false
  // Correct:
  return !(today >= seasonalStart || today <= seasonalEnd);
}
```
Simplified correct version:
```typescript
if (seasonalStart <= seasonalEnd) {
  return today < seasonalStart || today > seasonalEnd;
}
// Cross-year: paused when today is in the gap (after end but before start)
return today > seasonalEnd && today < seasonalStart;
```

---

### WR-05: `useRemoveFromQueue` mutation has no error feedback to the user

**File:** `packages/web/src/hooks/use-queue-posts.ts:121-132`

**Issue:** `useRemoveFromQueue` has no `onError` callback. If the delete request fails (network error, 404 because the post was already removed, etc.), the UI silently invalidates the query cache, potentially re-fetching the same post that failed to delete. The user gets no toast or indication that their action did not succeed. Every other mutation in this file (`useMovePostUp`, `useMovePostDown`) and in the rest of the codebase consistently shows a toast on error.

**Fix:**
```typescript
export function useRemoveFromQueue(queueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      apiClient.delete<{ success: boolean }>(
        `/api/queues/${queueId}/posts/${postId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-posts', queueId] });
    },
    onError: () => {
      toast.error("Couldn't remove post from queue. Try again.");
    },
  });
}
```

---

### WR-06: `HourWindowGrid` "Clear All" allows submitting an invalid form

**File:** `packages/web/src/components/queues/HourWindowGrid.tsx:31-33`

**Issue:** The "Clear All" button calls `onChange([])`, setting `hourSlots` to an empty array. The Zod schema (`createQueueSchema`) requires `hourSlots` to have at least one entry. While the form will fail validation on submit and show an error message, the user can click "Clear All" repeatedly without understanding why they cannot proceed. There is no visual indicator that an empty selection is invalid until they attempt submission. The `DayOfWeekSelector` has the same pattern but does not have a "Clear All" button, so this is only a concern here.

This is a minor UX issue with a correctness implication: a user who accidentally clears all hours and saves has the client-side error caught, but it's a confusing failure mode.

**Fix:** Disable the "Clear All" button if it would leave the selection empty, or immediately show an inline error when the array is empty:
```tsx
<button
  type="button"
  className="text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
  onClick={handleClearAll}
  disabled={value.length === 0}
>
  Clear All
</button>
```

---

## Info

### IN-01: Duplicate import of `ListOrdered` from lucide-react in Sidebar

**File:** `packages/web/src/components/layout/Sidebar.tsx:6-7`

**Issue:** `ListOrdered` is imported twice on lines 6 and 7. TypeScript/bundlers deduplicate this silently but it's dead weight and signals a copy-paste error.

**Fix:** Remove the duplicate import line.

---

### IN-02: `QueueListItem` in `use-queues.ts` has fields absent from the API response

**File:** `packages/web/src/hooks/use-queues.ts:11-33`

**Issue:** `QueueListItem` declares `startDate`, `seasonalRepeat`, `createdAt`, `updatedAt`, and `profile` but the `getQueues` service function in `queue.service.ts` does not include these fields in its select projection (lines 148-169). The API returns what the DB select projects, not the full row. `startDate` and `seasonalRepeat` are not in the `getQueues` select; they exist on `getQueueById`. `profile` is a nested object not returned by the list endpoint. Code that reads `queue.startDate` or `queue.profile` from the list response will get `undefined` at runtime while TypeScript believes they are defined (or nullable). `queue.profile?.displayName` in `QueuesPage.tsx:238` will always be `undefined`, showing `'-'` for every profile name.

**Fix:** Either add the missing fields to the `getQueues` select projection, or narrow the `QueueListItem` interface to match what the endpoint actually returns. The simplest fix is to add the missing fields to the `getQueues` DB query in `queue.service.ts`.

---

### IN-03: `createLogger` called inside `evaluateQueues` on every invocation

**File:** `packages/worker/src/queue-scanner.ts:83`

**Issue:** `createLogger('queue-scanner')` is called at the top of `evaluateQueues`, which runs every 60 seconds. Depending on pino's factory implementation, this may be cheap, but it's an unnecessary allocation per tick. The module-level logger pattern used throughout the rest of the codebase (e.g., `auto-destruct-lifecycle.service.ts:20`) is the established convention.

**Fix:**
```typescript
// Move outside evaluateQueues, at module scope
const logger = createLogger('queue-scanner');

export async function evaluateQueues(...) {
  // remove: const logger = createLogger('queue-scanner');
  ...
}
```
Same for `startQueueScanner` on line 294 — it creates a second logger with the same name.

---

### IN-04: Magic number `5` for spinnable variant preview count

**File:** `packages/web/src/components/queues/SpinnableVariantsDialog.tsx:21`

**Issue:** `generateVariants(postText, 5)` uses `5` as a magic number in two places (line 21 and line 37). This is a minor readability issue but inconsistent with the named-constants convention in the codebase.

**Fix:**
```typescript
const PREVIEW_VARIANT_COUNT = 5;
// ...
const [variants, setVariants] = useState<string[]>(() =>
  hasSpinSyntax ? generateVariants(postText, PREVIEW_VARIANT_COUNT) : [],
);
// ...
setVariants(generateVariants(postText, PREVIEW_VARIANT_COUNT));
```

---

### IN-05: `auto-destruct-worker.test.ts` smoke test for `createAutoDestructWorker` does not verify configuration

**File:** `packages/worker/src/__tests__/auto-destruct-worker.test.ts:253-259`

**Issue:** The test at line 253 only verifies `typeof createAutoDestructWorker === 'function'`. The comment acknowledges this is intentional due to needing a real Redis connection, but the `attempts: 4` configuration mentioned in the test description (and the file comment on line 7) is never actually verified. Compare to the queue scanner tests which properly verify enqueue behavior via mocked queues. The worker package's own `CLAUDE.md` calls for testing both success and failure paths for async ops.

This is an info-level gap — the test won't catch regressions in the worker's concurrency, backoff, or attempt configuration.

**Fix:** Consider extracting the worker config object so it can be tested independently, similar to how `AUTO_DESTRUCT_CONFIG` is already defined as a constant on line 33. A test can assert `AUTO_DESTRUCT_CONFIG.attempts === 4` as a lightweight regression check without needing Redis.

---

_Reviewed: 2026-04-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
