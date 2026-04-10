---
phase: 04-publish-worker-scheduled-posts
status: findings
depth: standard
files_reviewed: 49
date: 2026-04-10
---

# Phase 4: Code Review Report

**Reviewed:** 2026-04-10
**Depth:** standard
**Files Reviewed:** 49
**Status:** issues_found

## Summary

Phase 4 delivers the publish worker, BullMQ scheduler integration, rate-limit enforcement, and all supporting UI. The implementation is solid — the security-critical paths (token decryption, idempotency guard, rate-limit advisory lock, IDOR prevention) are well-thought-out and correctly implemented. No credential leakage, no injection surface, no mass-assignment gaps on mutation endpoints.

The findings below are mostly medium and low severity. There are two high-severity bugs: a silent `publishing` state leak when the lifecycle transaction's `UPDATE` is a no-op, and a division-by-zero in the rate-limit indicator when budget is 0. One critical-category finding exists around the lifecycle transaction's missing row-update verification.

---

## Critical Issues

### CR-01: `publishing` state set without verifying the UPDATE matched a row

**File:** `packages/worker/src/post-lifecycle.service.ts:184-189`

**Issue:** The transition `scheduled → publishing` uses `.update(...).where(eq(posts.id) AND eq(posts.postVersion))` but does not call `.returning()` or check `rowCount`. If the version has already been bumped by a concurrent edit between the `SELECT FOR UPDATE` and the `UPDATE` (a short but real window given the budget re-check query at line 165 runs outside the lock on the same connection), the `UPDATE` silently matches zero rows. The post remains in `scheduled`, but the code proceeds to call Twitter with `lockedPost` and writes the attempt row as `success`, potentially publishing and recording a result the DB's post row never reflects.

In practice the `SELECT FOR UPDATE` serializes access on the post row itself for the duration of the transaction, so a concurrent `PATCH` from the API would block until this transaction commits. The risk is real only if the serialization assumption breaks (e.g., different isolation level, or a future refactor that splits the lock). However, the missing `.returning()` check means there is no hard backstop.

**Fix:**
```typescript
const [updatedRow] = await tx
  .update(posts)
  .set({ status: 'publishing', updatedAt: new Date() })
  .where(
    and(eq(posts.id, ctx.postId), eq(posts.postVersion, ctx.expectedVersion)),
  )
  .returning({ id: posts.id });

if (!updatedRow) {
  // Version raced between lock acquire and update — abort cleanly.
  throw new PostLifecycleAbort('version_mismatch');
}
```

---

## Warnings (High)

### WR-01: Division by zero in `ProfileRateLimitIndicator` when budget is 0

**File:** `packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx:38`

**Issue:** `const percent = Math.round((data.currentCount / data.budget) * 100)`. If a profile row somehow has `monthlyTweetBudget = 0` (schema allows `DEFAULT 500 NOT NULL` but no DB-level `CHECK (monthly_tweet_budget > 0)` constraint exists), this yields `NaN`. `resolveState(NaN, warnThreshold)` returns `'ok'` because all comparisons with `NaN` are false — the indicator displays `NaN / 0 tweets (NaN%)`, which is user-visible corruption.

Same pattern exists in `RateLimitBanner.tsx:17` and `RateLimitSettingsDialog.tsx:71`, but `RateLimitSettingsDialog` guards it at line 71 with `budget > 0 ? ... : 0`, making that instance safe. The other two are not guarded.

**Fix:**
```typescript
// ProfileRateLimitIndicator.tsx
const percent = data.budget > 0
  ? Math.round((data.currentCount / data.budget) * 100)
  : 0;

// RateLimitBanner.tsx
const percent = data.budget > 0
  ? Math.round((data.currentCount / data.budget) * 100)
  : 0;
```

### WR-02: `useRetryPost` fires and forgets without disabling the button

**File:** `packages/web/src/pages/posts/PostsPage.tsx:111-121`

**Issue:** `handleRetry` calls `apiClient.retryPost(postId).then(...).catch(...)` — a fire-and-forget pattern. While `.catch()` is present (so no unhandled rejection), there is no loading state, meaning the user can click "Retry Post" multiple times before the first request completes, generating multiple retry jobs for the same post. The API route has a `status !== 'failed'` guard that will reject the second call with 409, but the first call transitions the post to `scheduled`, so rapid double-clicks could result in two BullMQ jobs for the same postId+version.

**Fix:** Convert to a `useMutation` (consistent with other mutations in the file) or track a `retryingPostId` set in local state to disable the menu item while a retry is in-flight:
```typescript
const [retryingPostIds, setRetryingPostIds] = useState<Set<string>>(new Set());

function handleRetry(postId: string) {
  if (retryingPostIds.has(postId)) return;
  setRetryingPostIds(prev => new Set(prev).add(postId));
  apiClient
    .retryPost(postId)
    .then(() => {
      toast.success('Retrying post...');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    })
    .catch((err: Error) => {
      toast.error(`Couldn't retry post. ${err.message ?? ''}`.trim());
    })
    .finally(() => {
      setRetryingPostIds(prev => { const next = new Set(prev); next.delete(postId); return next; });
    });
}
```

### WR-03: `EditPostPage` does not surface a `twitter_budget_exceeded` 409 from PATCH

**File:** `packages/web/src/pages/posts/EditPostPage.tsx:318-330`

**Issue:** `NewPostPage` correctly checks `error.status === 409 && error.body?.code === 'twitter_budget_exceeded'` and renders the `RateLimitBlockError` component. The `EditPostPage` error handler at line 319 only checks `error.status === 409` and falls through to a generic "modified elsewhere" / "currently being published" toast — it never checks for `twitter_budget_exceeded`. If a user edits a post and reschedules it when the budget is full, they receive a misleading "modified elsewhere" message instead of the budget-exceeded error.

**Fix:**
```typescript
onError: (error: Error & { status?: number; body?: Record<string, unknown> }) => {
  if (error.status === 409) {
    if (error.body?.code === 'twitter_budget_exceeded') {
      toast.error(
        `Twitter monthly budget reached (${error.body.currentCount}/${error.body.budget}).`
      );
      return;
    }
    const errorMsg = String(error.body?.error ?? '');
    if (errorMsg.includes('modified elsewhere')) {
      // ... existing handling
    } else {
      // ...
    }
  }
}
```

### WR-04: `PollingIndicator` renders `0s ago` immediately before `dataUpdatedAt` guard runs

**File:** `packages/web/src/components/posts/PollingIndicator.tsx:8-18`

**Issue:** `useState(() => computeSecondsAgo(dataUpdatedAt))` initializes state before the `useEffect` fires, so `secondsAgo` is correctly computed. However, the early-return guard (`if (!dataUpdatedAt) return null`) at line 18 runs **after** the hooks are called. This is not a React rules violation (hooks are always called), but it means if `dataUpdatedAt` is `0` on mount, the component renders `"Updated 0s ago"` for one frame before the guard returns `null`. The functional issue is minor, but the guard should move before the `useState` initialization logic (which is not possible with hooks) — the real fix is to guard inside `computeSecondsAgo` and render conditionally based on a prop check before the component body does work:

More importantly, the `useEffect` sets `secondsAgo` via `setSecondsAgo(computeSecondsAgo(dataUpdatedAt))` before starting the interval. If `dataUpdatedAt` is `0`, this sets state unnecessarily. The guard at line 18 is after both hooks — a `null` return does not skip the interval setup on subsequent renders when `dataUpdatedAt` becomes non-zero, because the effect key is `[dataUpdatedAt]`. This is fine and the effect is correctly cleaned up. The finding is minor: the guard-before-hook pattern cannot be fixed without restructuring.

**No code change required** — this is an awareness note only.

---

## Medium Issues

### MD-01: `loadTwitterUsage` / `loadWorkerUsage` are duplicate implementations with no shared abstraction

**Files:** `packages/api/src/services/rate-limit.service.ts:42-77`, `packages/worker/src/rate-limit.ts:29-64`

**Issue:** Both functions are byte-for-byte identical in logic (profile lookup, monthly count query, return shape). The duplication is intentional per the comments (avoids worker→api dependency) but the `COUNTED_STATUSES` constant is also duplicated. If a new status is added to the "counts toward quota" set, both files must be updated in lockstep, with no compile-time guarantee they stay in sync.

**Fix:** Extract the `COUNTED_STATUSES` constant to `@sms/shared` (alongside `checkTwitterBudget`). The DB query itself cannot be shared without a shared Drizzle schema client, which is already the case — `@sms/db` is imported by both. A shared `buildUsageQuery(db, profileId)` helper in `@sms/shared` is the right long-term solution; at minimum, export `COUNTED_STATUSES` from `@sms/shared` so the two implementations at least share the constant:

```typescript
// packages/shared/src/constants/rate-limit.ts
export const COUNTED_STATUSES = ['published', 'auto_destructing', 'destroyed'] as const;
export type CountedStatus = typeof COUNTED_STATUSES[number];
```

### MD-02: `cancelScheduled` has a TOCTOU gap between `getJob` and `isDelayed`

**File:** `packages/api/src/services/publish-queue.service.ts:67-84`

**Issue:** `getJob(jobId)` returns a snapshot, then `job.isDelayed()` re-fetches state from Redis. Between these two calls a job could transition from `delayed` to `active`. The comment acknowledges this and notes the post_version check in the worker handles it, which is correct. However, there is no error handling around `job.remove()` — if the job transitions to `active` between `isDelayed()` returning `true` and `job.remove()`, BullMQ will throw (cannot remove an active job). This exception propagates to the route handler's outer `try/catch` and is logged at line 307 in `posts.ts` — so it is safe today, but the comment at line 79 ("we rely on the post_version optimistic check") undersells the need to also handle the remove error.

**Fix:** Wrap `job.remove()` in its own try/catch so a race-caused remove failure doesn't surface to the request and is logged with context:
```typescript
if (isDelayed) {
  try {
    await job.remove();
  } catch (removeErr) {
    // Job moved to active between isDelayed() check and remove() — safe to ignore,
    // the worker's version check will abort the stale job cleanly.
  }
}
```

### MD-03: `checkBudget` runs inside the `SELECT FOR UPDATE` transaction in `post-lifecycle.service.ts`

**File:** `packages/worker/src/post-lifecycle.service.ts:165`

**Issue:** `ctx.checkBudget(post.profile_id)` is called while holding the `FOR UPDATE` lock on the post row (inside the transaction at line 105). `checkBudgetForWorker` issues two additional SELECT queries against `social_profiles` and `posts`. These are short reads on different tables, so the lock on `posts` does not block them — but it does mean the transaction holds its lock while two additional round trips complete. For a worker with `concurrency: 2`, this is acceptable; at higher concurrency it could become a bottleneck. The more important concern is correctness: the budget count query runs **after** the `SELECT FOR UPDATE` but **before** the `UPDATE` transition. Between the count query and the update, another concurrent worker could have published a different post for the same profile, meaning the count query's result is stale by the time we use it. The `FOR UPDATE` lock on the current post row does not prevent another worker from updating the `publishedAt` of a different post.

This is a documented accepted risk (D-26) and the comment at line 163 acknowledges it. Flagging for completeness: the budget check here provides a best-effort guard, not a hard guarantee. A future tighter implementation would require a separate advisory lock per profile.

**No immediate code change required** — this is an accepted design trade-off per D-26. However, the comment should explicitly state the race window.

### MD-04: `PostHistoryDialog` uses array index as React key

**File:** `packages/web/src/components/posts/PostHistoryDialog.tsx:192`

**Issue:** `key={cycleIndex}` where `cycleIndex` is the array index. If cycles are prepended or reordered (e.g., after a retry adds a new cycle at the end), React will reuse the wrong DOM nodes and incorrect `isOpen` state from `CycleSection` will be associated with the wrong cycle. Cycle ordering is append-only today (newest cycle at the end), so this is low risk, but arrays should use stable keys.

**Fix:** Use a content-derived key. Since each cycle's first attempt has a stable UUID, use that:
```tsx
key={cycle[0]?.id ?? cycleIndex}
```

### MD-05: `PostFullTextDialog` passes `tweetIndex` but names loop variable differently from convention

**File:** `packages/web/src/components/posts/PostFullTextDialog.tsx:36-46`

**Issue:** `tweets.map((tweet, tweetIndex) => ...)` uses `tweetIndex` as the loop variable name and as the `key` (`key={tweet.id}` is correct here — `tweet.id` is used, not the index). This is actually fine; `tweet.id` is stable. No issue here — included for completeness during the pass.

---

## Low Issues

### LO-01: `QUEUE_NAMES` / `JOB_NAMES` are not declared with tilde-version dependency discipline

**File:** `packages/shared/src/constants/queues.ts:1-38`

Not a code issue, but this file's consumers (`@sms/api`, `@sms/worker`) import it from `@sms/shared`. The file itself is clean. No finding.

### LO-02: `buildPublishJobId` is exported from `@sms/shared` but also re-exported via barrel

**File:** `packages/shared/src/index.ts:26`

`export * from './constants/queues.js'` re-exports `buildPublishJobId`. This function constructs internal Redis keys and should arguably be a non-public internal, but since both the API and worker use it, the export is intentional.

### LO-03: `scanner.ts` does not register an `error` handler on `scannerQueue` (Queue object)

**File:** `packages/worker/src/scanner.ts:121-151`

The `scannerWorker` has `worker.on('error', ...)` at line 147, but the `scannerQueue` (Queue) has no `error` listener. BullMQ Queue objects emit `error` events (e.g., Redis reconnection failures). An unhandled `error` event on a Node.js `EventEmitter` crashes the process. The `publishQueue` in `index.ts` similarly lacks an error listener (line 43). The `redis.on('error', ...)` at line 36 in `index.ts` catches Redis-level errors but not Queue-level errors that BullMQ might emit independently.

**Fix:**
```typescript
// scanner.ts, after scannerQueue creation
scannerQueue.on('error', (err) => {
  logger.error({ err }, 'Scanner queue error event');
});

// index.ts, after publishQueue creation
publishQueue.on('error', (err) => {
  logger.error({ err }, 'Publish queue error event');
});
notificationQueue.on('error', (err) => {
  logger.error({ err }, 'Notification queue error event');
});
```

### LO-04: `createAdminRouter` creates `createBullBoard` but does not handle potential throw

**File:** `packages/api/src/routes/admin.ts:34-41`

`createBullBoard` is a synchronous setup call. If it throws (e.g., adapter misconfiguration), the error propagates out of `createAdminRouter`, which is called during `createApp`. There is no documentation of what this throws. Low risk since BullMQ adapters are well-tested. No code change required — noting for visibility.

### LO-05: `RateLimitBanner` hides itself when `blockThresholdHit` is true

**File:** `packages/web/src/components/posts/RateLimitBanner.tsx:13`

```typescript
if (!data || !data.warnThresholdHit || data.blockThresholdHit) return null;
```

The banner correctly hides when the budget is fully exhausted (block threshold), deferring to `RateLimitBlockError`. However, the condition `data.blockThresholdHit` is `true` when `projectedCount >= monthlyBudget`, which uses `additionalCount: 0` (from `GET /rate-limit` with `additionalPostCount: 0`). So the banner correctly shows only in the "warn but not yet blocked" zone. This is correct behavior — noting it explicitly since the logic is subtle.

### LO-06: `api-client.ts` CSRF token is module-level mutable state

**File:** `packages/web/src/lib/api-client.ts:1`

`let csrfToken: string | null = null` is module-level state. In a multi-tab scenario, each tab has its own module scope so this is fine. However, if the session expires and a new login happens in the same tab without a page reload, the cached token from the old session would be used until the first 403/retry cycle refreshes it. The retry logic at lines 45-60 handles this by invalidating on 403 CSRF errors. The design is correct for a SPA.

### LO-07: `useRetry` fire-and-forget `.then`/`.catch` chain in `PostsPage.tsx` vs convention

**File:** `packages/web/src/pages/posts/PostsPage.tsx:111`

Per CLAUDE.md: "Unawaited promises: `.catch()` with logging." The `.catch()` is present and shows a toast rather than logging — this is an accepted UI pattern rather than a convention violation. The real concern is captured in WR-02 above (no loading guard).

### LO-08: `EditPostPage` 409 error message branch is incorrect for budget-exceeded case

**File:** `packages/web/src/pages/posts/EditPostPage.tsx:320-323`

Already captured as WR-03. The specific sub-issue: the `errorMsg.includes('modified elsewhere')` check at line 321 will be `false` for a budget-exceeded 409, so it falls through to line 323: `toast.error('This post is currently being published and cannot be edited.')` — a message that is factually wrong for a budget-exceeded scenario. Covered in WR-03 fix.

### LO-09: `PollingIndicator` label has no accessible unit announcement

**File:** `packages/web/src/components/posts/PollingIndicator.tsx:22`

`"Updated {secondsAgo}s ago"` — the `s` abbreviation for seconds is not screen-reader friendly. Consider `{secondsAgo} seconds ago` or wrapping in an `aria-label`. Low priority for an internal operator tool.

### LO-10: `PostAttemptSchema.attemptNum` uses `z.number().int().positive()` but first attempt is 1

**File:** `packages/shared/src/schemas/post-history.ts:17`

`z.number().int().positive()` — `positive()` means `> 0`, so `1` is valid. This is correct. No issue — noted during review pass.

### LO-11: `packages/db/src/schema/social-profiles.ts` missing `CHECK` constraint on new columns

**File:** `packages/db/src/schema/social-profiles.ts:30-31`

`monthlyTweetBudget` has `default(500)` and `warnThresholdPercent` has `default(80)`, both `notNull`. The Zod schema (`rateLimitUpdateSchema`) enforces `min(1)` and `max(10000)` / `max(99)` on the API path. However, the DB schema has no `CHECK` constraint. A direct DB write (e.g., from a migration or admin script) could set `monthlyTweetBudget = 0`, causing the division-by-zero described in WR-01. The SQL migration at line 15-16 also has no `CHECK`. For defense-in-depth, add constraints:

```sql
ALTER TABLE "social_profiles"
  ADD CONSTRAINT monthly_tweet_budget_positive CHECK (monthly_tweet_budget > 0),
  ADD CONSTRAINT warn_threshold_valid CHECK (warn_threshold_percent BETWEEN 1 AND 99);
```

---

## Files with No Findings

The following files were read and contained no issues worth flagging:

- `packages/db/src/schema/post-attempts.ts` — clean
- `packages/db/src/schema/index.ts` — clean
- `packages/db/drizzle/0002_phase-04-publish-worker.sql` — clean (migrations match schema)
- `packages/shared/src/constants/queues.ts` — clean
- `packages/shared/src/lib/error-classifier.ts` — clean; type-safe throughout, no credential leakage
- `packages/shared/src/rate-limit/check-budget.ts` — clean
- `packages/shared/src/schemas/rate-limit.ts` — clean; `.strict()` present on PATCH schema
- `packages/shared/src/schemas/post-history.ts` — clean
- `packages/shared/src/index.ts` — clean
- `packages/api/src/app.ts` — clean; middleware ordering is correct; CSRF exception documented
- `packages/api/src/index.ts` — clean; shutdown follows individual try/catch per resource
- `packages/api/src/routes/admin.ts` — clean; `requireAuth` applied before board router
- `packages/api/src/routes/posts.ts` — clean (WR-03 noted for edit page, not this file); ownership enforced on all endpoints
- `packages/api/src/routes/profiles.ts` — clean; ownership enforced, `.strict()` on PATCH body
- `packages/api/src/services/publish-queue.service.ts` — clean (MD-02 noted)
- `packages/api/src/services/rate-limit.service.ts` — clean (MD-01 duplication noted)
- `packages/worker/src/backoff.ts` — clean; Retry-After honored correctly
- `packages/worker/src/db.ts` — clean
- `packages/worker/src/index.ts` — clean; shutdown order correct
- `packages/worker/src/rate-limit.ts` — clean (MD-01 duplication noted)
- `packages/worker/src/publish-worker.ts` — clean; graceful abort vs retryable error handling correct
- `packages/worker/src/twitter-publish.service.ts` — clean; no credential logging, key validated before use
- `packages/web/src/components/posts/PostActionsMenu.tsx` — clean
- `packages/web/src/components/posts/PostErrorCell.tsx` — clean
- `packages/web/src/components/posts/PostFullTextDialog.tsx` — clean
- `packages/web/src/components/posts/PostHistoryDialog.tsx` — clean (MD-04 key issue noted)
- `packages/web/src/components/posts/PostStatusBadge.tsx` — clean
- `packages/web/src/components/posts/RateLimitBlockError.tsx` — clean
- `packages/web/src/components/profiles/ProfileCard.tsx` — clean
- `packages/web/src/components/profiles/RateLimitSettingsDialog.tsx` — clean
- `packages/web/src/hooks/use-post-history.ts` — clean
- `packages/web/src/hooks/use-posts.ts` — clean
- `packages/web/src/hooks/use-rate-limit.ts` — clean
- `packages/web/src/lib/api-client.ts` — clean (LO-06 noted)
- `packages/web/src/pages/posts/NewPostPage.tsx` — clean; budget-exceeded 409 handled correctly
- `packages/web/src/pages/profiles/ProfilesPage.tsx` — clean
- `packages/web/src/components/layout/Sidebar.tsx` — clean
- `packages/web/src/index.css` — clean

---

_Reviewed: 2026-04-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
