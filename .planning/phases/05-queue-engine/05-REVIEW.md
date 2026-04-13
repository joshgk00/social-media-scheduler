---
phase: 05-queue-engine
reviewed: 2026-04-13T19:45:00Z
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
  - packages/shared/package.json
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
  warning: 8
  info: 6
  total: 14
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-04-13T19:45:00Z
**Depth:** standard
**Files Reviewed:** 37
**Status:** issues_found

## Summary

Phase 5 delivers the queue engine: schedule evaluation, the `evaluateQueues` scanner, auto-destruct lifecycle, queue CRUD API routes, and the full React UI for managing queues. The core architecture is well-designed -- the three-phase auto-destruct pattern correctly mirrors the publish lifecycle, the transaction-based cursor advance prevents double-enqueue, and the DST handling in schedule evaluation is solid.

No security vulnerabilities were found. The issues below are correctness bugs, logic gaps, and consistency problems. The most consequential are: (1) `calculateNextRunAt` uses hardcoded `'UTC'` instead of the user's timezone when computing the initial `nextRunAt` on queue create/update, making the stored next-run time wrong for non-UTC users; (2) the frontend `QueuePostActionsMenu` allows removing published posts from a queue, but the API only permits removing posts with status `'queued'`, causing silent failures; and (3) the `seasonalRepeat` parameter is accepted but never used, making one-time seasonal windows behave identically to repeating ones.

---

## Warnings

### WR-01: `calculateNextRunAt` called with hardcoded `'UTC'` instead of user timezone

**File:** `packages/api/src/services/queue.service.ts:36` and `packages/api/src/services/queue.service.ts:114`

**Issue:** Both `createQueue` (line 36) and `updateQueue` (line 114) call `calculateNextRunAt(..., 'UTC')`. This function uses the timezone argument to evaluate which hour slots and days-of-week are eligible for the next run. Passing `'UTC'` means the initial `nextRunAt` is computed as if the user's hour slots (e.g., 9am, 12pm, 3pm) refer to UTC hours, not the user's local time. For a user in `America/New_York` (UTC-4/5), the stored `nextRunAt` will be 4-5 hours off. The queue scanner in `queue-scanner.ts` correctly reads `users.timezone` from the DB for runtime evaluation, but the persisted `nextRunAt` displayed in the UI (via `getQueues`) will be wrong until the scanner overwrites it on its next pass.

**Fix:** Load the user's timezone from the DB and pass it to `calculateNextRunAt`:
```typescript
const [userRow] = await db
  .select({ timezone: users.timezone })
  .from(users)
  .where(eq(users.id, userId));
const userTimezone = userRow?.timezone ?? 'UTC';

const nextRunAt = calculateNextRunAt(queueConfig, userTimezone);
```

---

### WR-02: Frontend allows removing published posts but API rejects them

**File:** `packages/web/src/components/queues/QueuePostActionsMenu.tsx:45` and `packages/api/src/services/queue.service.ts:330`

**Issue:** The frontend `QueuePostActionsMenu` defines `DELETABLE_QUEUE_STATES = ['queued', 'published']` (line 45), enabling the "Delete Post" action for posts with status `published`. However, `removePostFromQueue` in the API service has a WHERE clause that includes `eq(posts.status, 'queued')` (line 330). When a user clicks "Delete Post" on a published post, the API returns 404 ("Post not found in this queue") because the status filter excludes it. The user sees a confusing error for an action the UI told them was available.

**Fix:** Either expand the API WHERE clause to also accept `published` status:
```typescript
.where(
  and(
    eq(posts.id, postId),
    eq(posts.userId, userId),
    eq(posts.queueId, queueId),
    sql`${posts.status} IN ('queued', 'published')`,
  ),
)
```
Or restrict the frontend to only show the delete action for `queued` posts:
```typescript
const DELETABLE_QUEUE_STATES = ['queued'];
```

---

### WR-03: `seasonalRepeat` parameter is accepted but never used

**File:** `packages/shared/src/lib/schedule-evaluation.ts:57`

**Issue:** `isWithinSeasonalWindow` accepts `seasonalRepeat: boolean` as its third parameter but never references it in the function body. The function always evaluates the seasonal window as if it repeats annually. A one-time seasonal window (e.g., "only active during Nov-Dec 2026, then never again") behaves identically to a repeating one. The Zod schema, DB column, and UI toggle all expose this as a configurable option, but it has no effect.

**Fix:** When `seasonalRepeat` is `false`, the function should also check the year. This requires either storing the year in the seasonal config or adding a `createdAt`/`seasonalYear` field. For now, if one-time seasonal windows are not yet needed, add a code comment documenting the gap and remove the parameter to avoid misleading callers:
```typescript
// TODO: seasonalRepeat=false (one-time window) not yet implemented.
// Currently all seasonal windows repeat annually.
export function isWithinSeasonalWindow(
  seasonalStart: string | null,
  seasonalEnd: string | null,
  now?: DateTime,
): boolean {
```

---

### WR-04: `QueueStatusBadge` seasonal pause logic is inverted for cross-year windows

**File:** `packages/web/src/components/queues/QueueStatusBadge.tsx:18-23`

**Issue:** The `isInSeasonalPause` function computes whether the queue is outside its seasonal window. For cross-year windows (e.g., Nov-Jan where `seasonalStart > seasonalEnd`), the function returns `today < seasonalStart && today > seasonalEnd` (line 22). This condition can never be true -- no date is simultaneously before November and after January. A queue with a Nov-Jan seasonal window will never show "Seasonal pause" during Feb-Oct. The server-side `isWithinSeasonalWindow` has this logic correct (lines 73-76 in `schedule-evaluation.ts`).

**Fix:** Align with the shared library logic:
```typescript
if (seasonalStart <= seasonalEnd) {
  return today < seasonalStart || today > seasonalEnd;
}
// Cross-year: paused when today is in the gap (after end AND before start)
return today > seasonalEnd && today < seasonalStart;
```

---

### WR-05: `QueueDetail` type has `cursor` but API returns `cursorPosition`

**File:** `packages/web/src/hooks/use-queues.ts:36` and `packages/web/src/pages/queues/QueuePostsPage.tsx:65`

**Issue:** The `QueueDetail` interface declares `cursor: number` (line 36 of `use-queues.ts`), but the API's `getQueueById` returns the full DB row which has the column named `cursorPosition`. In `QueuePostsPage.tsx` line 65, the code accesses `queue?.cursorPosition ?? 1`. Since `QueueDetail` does not declare `cursorPosition`, TypeScript should flag this as an error (though the runtime JSON object does have the property). The fallback value `1` is also incorrect -- `cursorPosition` defaults to `0` in the DB schema (line 20 of `queues.ts`), so a fresh queue with no publishes has cursor `0`, but the UI would display position `1` as the "Next" post marker instead of `0`.

**Fix:** Rename `cursor` to `cursorPosition` in the `QueueDetail` interface:
```typescript
interface QueueDetail extends QueueListItem {
  cursorPosition: number;
}
```
And update the fallback:
```typescript
const cursorPosition = queue?.cursorPosition ?? 0;
```

---

### WR-06: `addPostToQueue` silently swallows state transition errors

**File:** `packages/api/src/services/queue.service.ts:289-295`

**Issue:** When adding a post to a queue, the code checks `if (post.status === 'draft')` (line 289) and then wraps `transitionPost(post.status, 'queued')` in a try-catch that silently swallows all errors (lines 293-295). Since the `if` condition already confirms the status is `'draft'`, the only reason `transitionPost` would throw is if the state machine's transition table is broken (i.e., `draft -> queued` is not a valid transition). Silently swallowing that error hides a state machine bug. If the transition fails, the post gets assigned to the queue with its existing status, creating an inconsistent state.

**Fix:** Remove the try-catch -- if the state machine rejects `draft -> queued`, that's a real error that should propagate:
```typescript
if (post.status === 'draft') {
  transitionPost(post.status as PostStatus, 'queued');
  updateFields.status = 'queued';
}
```
Or, if the intent is to handle posts that are already `queued` (re-adding to the same queue), move the status check to cover that case explicitly.

---

### WR-07: `useAddToQueue` mutation has no error feedback

**File:** `packages/web/src/hooks/use-queue-posts.ts:137-148`

**Issue:** `useAddToQueue` has no `onError` callback. If the add-to-queue request fails (409 for duplicate assignment, network error, etc.), the user receives no feedback. The `NewPostPage.tsx` handles errors from `addToQueueMutation` inline (line 174), but any other caller of `useAddToQueue` would silently fail.

**Fix:** Add consistent error handling:
```typescript
onError: () => {
  toast.error("Couldn't add post to queue. Try again.");
},
```

---

### WR-08: `removePostFromQueue` is not wrapped in a transaction

**File:** `packages/api/src/services/queue.service.ts:307-339`

**Issue:** `removePostFromQueue` performs two separate queries -- a queue ownership check (lines 313-316) and the post update (lines 322-333) -- without a transaction. Between the two queries, the queue could be deleted by a concurrent request, making the ownership check stale. While unlikely in a single-user app, this violates the CLAUDE.md convention: "Multi-step DB mutations (delete + re-insert) -> `db.transaction()`". The `addPostToQueue` function correctly uses a transaction for the same pattern.

**Fix:** Wrap in a transaction for consistency:
```typescript
await db.transaction(async (tx) => {
  const [queue] = await tx.select(...).from(queues).where(...);
  if (!queue) throw new QueueServiceError('Queue not found', 404);

  const updatedRows = await tx.update(posts).set(...).where(...).returning(...);
  if (updatedRows.length === 0) throw new QueueServiceError('Post not found in this queue', 404);
});
```

---

## Info

### IN-01: Duplicate import of `ListOrdered` in Sidebar

**File:** `packages/web/src/components/layout/Sidebar.tsx:5-7`

**Issue:** `ListOrdered` is imported twice from `lucide-react` on lines 5 and 7. The bundler deduplicates silently, but this is dead weight from a copy-paste error.

**Fix:** Remove line 7 (`ListOrdered,` duplicate).

---

### IN-02: `QueueListItem` declares fields absent from the API list response

**File:** `packages/web/src/hooks/use-queues.ts:11-33`

**Issue:** `QueueListItem` declares `intervalType`, `intervalValue`, `intervalUnit`, `startDate`, `seasonalRepeat`, `createdAt`, `updatedAt`, and `profile` fields. The `getQueues` service in `queue.service.ts` (lines 148-169) does not include `intervalType`, `intervalValue`, `intervalUnit`, `startDate`, `seasonalRepeat`, `createdAt`, or `updatedAt` in its select projection. It also does not return a nested `profile` object. Code like `queue.profile?.displayName` in `QueuesPage.tsx:238` will always evaluate to `undefined`, showing `'-'` for every profile name -- the `profileName` field is returned directly at the top level, not nested under `profile`.

**Fix:** Update `QueueListItem` to match the actual API response shape, or add the missing fields to the `getQueues` select query.

---

### IN-03: `createLogger` called inside `evaluateQueues` on every 60s tick

**File:** `packages/worker/src/queue-scanner.ts:83`

**Issue:** `createLogger('queue-scanner')` is called at the top of `evaluateQueues`, which runs every 60 seconds. A second `createLogger` call exists inside `startQueueScanner` on line 295. The established convention throughout the codebase is a single module-level logger (e.g., `auto-destruct-lifecycle.service.ts:20`).

**Fix:** Move to module scope:
```typescript
const logger = createLogger('queue-scanner');

export async function evaluateQueues(...) {
  // use the module-level logger
}
```

---

### IN-04: Magic number `5` for spinnable variant preview count

**File:** `packages/web/src/components/queues/SpinnableVariantsDialog.tsx:21,37`

**Issue:** `generateVariants(postText, 5)` uses `5` as a magic number in two places.

**Fix:** Extract to a named constant:
```typescript
const PREVIEW_VARIANT_COUNT = 5;
```

---

### IN-05: `QueuesPage.tsx` profile display references missing nested property

**File:** `packages/web/src/pages/queues/QueuesPage.tsx:237-239`

**Issue:** The queue list table accesses `queue.profile?.platform` and `queue.profile?.displayName`, but the API returns `network` and `profileName` as top-level fields (see `getQueues` service, lines 153-154). The `QueueListItem` type does have a `profile?: QueueProfile` field, but the API never populates it. As a result, the profile column always shows `'-'` and the platform icon is always empty.

**Fix:** Use the top-level fields that the API actually returns:
```tsx
<span className="text-sm">
  {getPlatformIcon(queue.network)}{' '}
  {queue.profileName ?? '-'}
</span>
```
And update `QueueListItem` to include `profileName: string` and `network: string` instead of the nested `profile` object.

---

### IN-06: Auto-destruct worker test only checks `typeof` without verifying config

**File:** `packages/worker/src/__tests__/auto-destruct-worker.test.ts:253-259`

**Issue:** The `createAutoDestructWorker` test only verifies the export is a function. The `AUTO_DESTRUCT_CONFIG` constant (line 33 of `auto-destruct-worker.ts`) is a plain object that could be tested directly for regression (e.g., `expect(AUTO_DESTRUCT_CONFIG.attempts).toBe(4)`), but the constant is not exported.

**Fix:** Export `AUTO_DESTRUCT_CONFIG` and add a lightweight assertion:
```typescript
expect(AUTO_DESTRUCT_CONFIG.attempts).toBe(4);
expect(AUTO_DESTRUCT_CONFIG.concurrency).toBe(2);
```

---

_Reviewed: 2026-04-13T19:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
