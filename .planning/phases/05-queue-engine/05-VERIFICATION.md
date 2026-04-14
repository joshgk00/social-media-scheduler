---
phase: 05-queue-engine
verified: 2026-04-13T11:00:00Z
status: gaps_found
score: 3/4 success criteria verified
overrides_applied: 0
gaps:
  - truth: "Queue scheduling engine publishes the next post at the configured interval, respecting day-of-week and hour window constraints; DST transitions do not shift scheduled times"
    status: failed
    reason: "@sms/db and @sms/shared dist files are stale and do not include Phase 5 additions. queues.js is absent from packages/db/dist/schema/, schemas/queues.js / lib/spinnable-text.js / lib/schedule-evaluation.js are absent from packages/shared/dist/. The Phase 5 constants update to QUEUE_NAMES and JOB_NAMES in shared/dist/constants/queues.js also predates Phase 5. This causes 26 test failures (14 in queue-scanner.test.ts, 8 in queues.test.ts, 4 in post-lifecycle.test.ts) and TypeScript compilation failures across packages/api and packages/worker."
    artifacts:
      - path: "packages/db/dist/schema/"
        issue: "queues.js missing — queues table not compiled. posts.js also missing queueId/queuePosition/destroyedAt columns."
      - path: "packages/shared/dist/lib/"
        issue: "spinnable-text.js and schedule-evaluation.js absent from dist."
      - path: "packages/shared/dist/schemas/"
        issue: "schemas/queues.js (createQueueSchema, updateQueueSchema) absent from dist."
      - path: "packages/shared/dist/constants/queues.js"
        issue: "Stale dist missing autoDestruct queue, new JOB_NAMES entries, and buildAutoDestructJobId."
    missing:
      - "Run `pnpm build` in packages/db to compile queues.ts and updated posts.ts into dist/"
      - "Run `pnpm build` in packages/shared to compile schemas/queues.ts, lib/spinnable-text.ts, lib/schedule-evaluation.ts, and updated constants/queues.ts into dist/"
      - "After rebuild, re-run `pnpm test` in packages/api and packages/worker to confirm all 26 failures resolve"
  - truth: "post-lifecycle.test.ts mock-db helper does not support .returning() on updateChain"
    status: failed
    reason: "Phase 4 fix commit 08a3e17 added .returning({ id: posts.id }) to the lifecycle lock transaction in post-lifecycle.service.ts, but packages/worker/src/__tests__/helpers/mock-db.ts updateChain was not updated to add .returning() support. This causes 4 test failures in post-lifecycle.test.ts that are independent of Phase 5 work but surfaced in the same test run."
    artifacts:
      - path: "packages/worker/src/__tests__/helpers/mock-db.ts"
        issue: "updateChain() returns { set: setFn }, setFn returns { where: whereFn }. whereFn has no .returning() method, so tx.update().set().where().returning() throws 'returning is not a function'."
      - path: "packages/worker/src/post-lifecycle.service.ts"
        issue: "Line 190: .returning({ id: posts.id }) requires mock support that was not added when the fix was applied."
    missing:
      - "In mock-db.ts updateChain, change setFn to return { where: whereFn, returning: vi.fn().mockResolvedValue([{ id: 'mock-id' }]) }, and update whereFn to also have a returning() chain method"
      - "Alternatively, update the where chain to return an object with returning() that resolves to [{ id }]"
human_verification:
  - test: "Full queue engine UI flow"
    expected: "Queues appear in sidebar. Queue list page shows all queues with filters, table columns, and per-queue actions. Create queue form has all schedule configuration fields. Queue posts page shows reorder buttons with cursor indicator. Post creation form in queue mode hides scheduling fields and shows 'Save to Queue'."
    why_human: "Visual rendering, interaction behavior, and UI/UX correctness cannot be verified programmatically. Plan 05-05 explicitly includes a human verification checkpoint (Task 2, checkpoint:human-verify gate) that was not completed."
---

# Phase 5: Queue Engine Verification Report

**Phase Goal:** User can create persistent post queues that publish on a recurring schedule with timezone-aware timing, post recycling, and auto-destruct
**Verified:** 2026-04-13T11:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create a queue with schedule configuration (interval, days-of-week, hour windows, start date, seasonal window) and assign it to a connected profile | VERIFIED | queues table schema complete with all columns; createQueueSchema validates hourSlots 6-23, daysOfWeek 0-6; POST /api/queues route wired with requireAuth; QueueDetailPage with ScheduleBuilder, HourWindowGrid, DayOfWeekSelector all present and wired |
| 2 | Queue scheduling engine publishes the next post at the configured interval, respecting day-of-week and hour window constraints; DST transitions do not shift scheduled times | FAILED | Code is substantive and correct in source. However @sms/db and @sms/shared dist files are stale — queues.js missing from db dist, spinnable-text.js/schedule-evaluation.js/schemas/queues.js missing from shared dist. Results in 26 test failures and TypeScript compilation errors in api/worker. |
| 3 | User can reorder posts within a queue (move up/down) and view spinnable text variants for queued posts | VERIFIED | useMovePostUp/useMovePostDown with optimistic cache updates; QueuePostsPage with border-l-2 border-primary cursor indicator; SpinnableVariantsDialog with countTotalVariants and Regenerate button; QueuePostActionsMenu with ChevronUp/ChevronDown and aria-labels |
| 4 | Auto-destruct worker deletes published posts from the platform after the configured time period; post transitions through `auto_destructing` to `destroyed` | VERIFIED (source) | auto-destruct-lifecycle.service.ts has three-phase lock/delete/commit; FOR UPDATE, transitionPost(), destroyedAt; deleteTweet handles 404 as success (D-13); auto-destruct-worker.ts has attempts: 4; worker/index.ts integrates startQueueScanner and createAutoDestructWorker. Note: TypeScript compilation fails due to stale @sms/shared dist but auto-destruct-worker.test.ts passes (6/6) |

**Score:** 3/4 success criteria verified (SC-2 blocked by stale dist builds)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/src/schema/queues.ts` | Queues table schema | VERIFIED | 21 columns: intervalType, hourSlots, seasonalStart/End, cursorPosition, isRecycling; indexes on userId, profileId, nextRunAt |
| `packages/shared/src/lib/spinnable-text.ts` | Spin parser | VERIFIED | resolveSpinnableText, extractVariants, countTotalVariants all exported |
| `packages/shared/src/lib/schedule-evaluation.ts` | Timezone-aware schedule eval | VERIFIED | isWithinHourWindow, isDayOfWeekAllowed, hasIntervalElapsed, isWithinSeasonalWindow, calculateNextRunAt; uses Luxon with DurationLikeObject |
| `packages/shared/src/schemas/queues.ts` | Zod validation schemas | VERIFIED | createQueueSchema, updateQueueSchema; hourSlots min(6).max(23), daysOfWeek min(0).max(6) |
| `packages/api/src/routes/queues.ts` | Queue CRUD routes | VERIFIED | createQueuesRouter; all 12 routes wired with requireAuth; mounted at /api/queues in app.ts |
| `packages/api/src/services/queue.service.ts` | Queue business logic | VERIFIED | createQueue, getQueues, movePostUp, movePostDown; all filter by queues.userId |
| `packages/api/src/services/auto-destruct-queue.service.ts` | Auto-destruct BullMQ service | VERIFIED | createAutoDestructQueueService; Math.max(0, ...) delay clamp; buildAutoDestructJobId |
| `packages/worker/src/queue-scanner.ts` | Queue scheduling scanner | VERIFIED | evaluateQueues, startQueueScanner; all 5 schedule constraints checked; gt() cursor operator; resolveSpinnableText at enqueue time |
| `packages/worker/src/auto-destruct-worker.ts` | Auto-destruct BullMQ worker | VERIFIED | createAutoDestructWorker; QUEUE_NAMES.autoDestruct; attempts: 4 |
| `packages/worker/src/auto-destruct-lifecycle.service.ts` | Auto-destruct lifecycle | VERIFIED | autoDestructPost; FOR UPDATE, transitionPost(), destroyedAt; platformPostId from job payload |
| `packages/worker/src/twitter-delete.service.ts` | Twitter delete service | VERIFIED | deleteTweet; client.v2.deleteTweet; 404 treated as success (D-13) |
| `packages/web/src/pages/queues/QueuesPage.tsx` | Queue list page | VERIFIED (302 lines) | useQueues hook; Create Queue; Skeleton loading; No queues yet empty state |
| `packages/web/src/pages/queues/QueueDetailPage.tsx` | Queue create/edit form | VERIFIED (262 lines) | useCreateQueue/useUpdateQueue; Queue name is required; Create Queue/Edit Queue/Save Queue |
| `packages/web/src/components/queues/ScheduleBuilder.tsx` | Schedule builder | VERIFIED (303 lines) | Fixed interval/Variable interval; Recycle posts; seasonal section |
| `packages/web/src/hooks/use-queues.ts` | TanStack Query hooks | VERIFIED | useQueues, useCreateQueue, useUpdateQueue, useDeleteQueue; refetchInterval: 30_000 |
| `packages/web/src/pages/queues/QueuePostsPage.tsx` | Queue posts page | VERIFIED (336 lines) | useQueuePosts; SpinnableVariantsDialog; No posts in this queue; border-l-2 border-primary; Skeleton |
| `packages/web/src/hooks/use-queue-posts.ts` | Queue posts hooks | VERIFIED | useQueuePosts, useMovePostUp, useMovePostDown, useRemoveFromQueue; refetchInterval: 10_000 |
| `packages/web/src/components/queues/SpinnableVariantsDialog.tsx` | Spinnable variants dialog | VERIFIED (84 lines) | Spinnable Text Variants; countTotalVariants; Regenerate |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/db/src/schema/posts.ts` | `packages/db/src/schema/queues.ts` | queue_id FK reference | WIRED | `queueId: uuid('queue_id').references(() => queues.id, { onDelete: 'set null' })` |
| `packages/db/src/schema/index.ts` | `packages/db/src/schema/queues.ts` | barrel re-export | WIRED | `export { queues } from './queues.js'` present |
| `packages/api/src/routes/queues.ts` | `packages/api/src/services/queue.service.ts` | import and function calls | WIRED | `import.*queue\.service` pattern found; all service functions called |
| `packages/api/src/app.ts` | `packages/api/src/routes/queues.ts` | router mount at /api/queues | WIRED | `app.use('/api/queues', createQueuesRouter({ db, autoDestructQueueService }))` |
| `packages/worker/src/queue-scanner.ts` | `packages/shared/src/lib/schedule-evaluation.ts` | import schedule evaluation | WIRED | All 4 evaluation functions imported and called |
| `packages/worker/src/auto-destruct-worker.ts` | `packages/worker/src/auto-destruct-lifecycle.service.ts` | import and function call | WIRED | `import.*auto-destruct-lifecycle` pattern found |
| `packages/worker/src/index.ts` | `packages/worker/src/queue-scanner.ts` | import and startup call | WIRED | `startQueueScanner` imported and called |
| `packages/worker/src/index.ts` | `packages/worker/src/auto-destruct-worker.ts` | import and worker creation | WIRED | `createAutoDestructWorker` imported and called |
| `packages/web/src/pages/queues/QueuesPage.tsx` | `/api/queues` | useQueues TanStack hook | WIRED | `useQueues(filters)` called; fetches GET /api/queues |
| `packages/web/src/pages/queues/QueueDetailPage.tsx` | `/api/queues` | mutation hooks | WIRED | `useCreateQueue` / `useUpdateQueue` mutations call POST/PUT /api/queues |
| `packages/web/src/App.tsx` | `packages/web/src/pages/queues/QueuesPage.tsx` | React Router route | WIRED | `<Route path="/queues" element={<QueuesPage />} />` and 3 additional queue routes |
| `packages/web/src/pages/queues/QueuePostsPage.tsx` | `/api/queues/:id/posts` | useQueuePosts hook | WIRED | `useQueuePosts(queueId)` fetches GET /api/queues/${queueId}/posts |
| `packages/web/src/pages/queues/QueuePostsPage.tsx` | SpinnableVariantsDialog | View Variants action | WIRED | `<SpinnableVariantsDialog` rendered in QueuePostsPage |
| `packages/web/src/pages/posts/NewPostPage.tsx` | `/api/queues/:id/posts` | queue post save handler | WIRED | `addToQueueMutation` calls POST /api/queues/${queueId}/posts; "Save to Queue" button present |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `QueuesPage.tsx` | `queues` from `useQueues` | GET /api/queues → getQueues() → DB select with userId filter | Yes (Drizzle query with eq(queues.userId, userId)) | FLOWING |
| `QueuePostsPage.tsx` | `posts` from `useQueuePosts` | GET /api/queues/:id/posts → getQueuePosts() → DB select | Yes (Drizzle select ordered by queue_position) | FLOWING |
| `queue-scanner.ts` `evaluateQueues` | `activeQueues` from DB | SELECT queues JOIN users WHERE isPaused=false | Yes (real DB query in source) | FLOWING (source) |

**Note on IN-02 (code review finding):** `QueueListItem` in use-queues.ts declares `startDate`, `seasonalRepeat`, `profile`, `createdAt`, `updatedAt` but `getQueues()` service does not select these fields. `queue.profile?.displayName` in QueuesPage.tsx line 238 will always return `undefined`, showing `'-'` for every profile name. This is a data-flow disconnect at the type boundary.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Queue schema in @sms/db dist | `ls packages/db/dist/schema/ | grep queue` | No output — queues.js absent | FAIL |
| Shared schedule-eval in dist | `ls packages/shared/dist/lib/` | Only error-classifier.js — spinnable-text.js and schedule-evaluation.js absent | FAIL |
| Worker TypeScript compilation | `tsc --noEmit -p packages/worker/tsconfig.json` | 10+ errors: queues not exported from @sms/db, schedule eval functions not from @sms/shared | FAIL |
| API TypeScript compilation | `tsc --noEmit -p packages/api/tsconfig.json` | Errors: createQueueSchema/updateQueueSchema/queueQuerySchema not in @sms/shared | FAIL |
| Web TypeScript compilation | `tsc --noEmit -p packages/web/tsconfig.json` | Passes cleanly | PASS |
| Shared source TypeScript | `tsc --noEmit -p packages/shared/tsconfig.json` | Passes cleanly | PASS |
| DB source TypeScript | `tsc --noEmit -p packages/db/tsconfig.json` | Passes cleanly | PASS |
| Shared unit tests (104) | `pnpm test --filter @sms/shared` | 104 pass including spinnable-text (19) and schedule-evaluation (28) | PASS |
| Auto-destruct-worker tests | Part of worker test run | Pass (6 tests) — no db schema dependency | PASS |
| Queue scanner tests | `pnpm test --filter @sms/worker` | 14/16 fail — queues.id is undefined because @sms/db dist missing queues.js | FAIL |
| API queues route tests | `pnpm test --filter @sms/api` | 8 fail (all return 500 instead of expected status) — createQueueSchema not available | FAIL |
| post-lifecycle tests | Part of worker test run | 4/11 fail — mock-db.ts updateChain missing .returning() support (pre-existing gap from Phase 4 fix 08a3e17) | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|----------|
| QUEUE-01 | 05-01, 05-02, 05-04 | User can create a queue with name, network, social profile, schedule type, interval, days-of-week, hour windows, start date, optional seasonal window, internal notes | SATISFIED | queues table + createQueueSchema + POST /api/queues + QueueDetailPage with ScheduleBuilder |
| QUEUE-02 | 05-02, 05-04 | Queue list shows all queues with name, network icon, profile, queue ID, total post count, last published, next run; filterable by network | SATISFIED | getQueues() service + GET /api/queues + QueuesPage with filter dropdowns; partial gap — profile name always shows '-' (IN-02) |
| QUEUE-03 | 05-02, 05-04 | Per-queue actions: Edit, Copy Configuration, Delete with confirmation, View Posts, View Notes | SATISFIED | QueueActionsMenu has all 5 actions; delete confirmation dialog present |
| QUEUE-04 | 05-02, 05-05 | Queue posts list with per-post actions: Edit, View media, Move Up, Move Down, Delete, View History, View spinnable variants | SATISFIED | QueuePostsPage + QueuePostActionsMenu with all actions including ChevronUp/Down |
| QUEUE-05 | 05-02, 05-05 | Queue posts can be reordered (move up/down within queue) | SATISFIED | movePostUp/movePostDown in service; useMovePostUp/useMovePostDown with optimistic updates |
| QUEUE-06 | 05-03 | Queue scheduling uses BullMQ with timezone-aware scheduling; DST transitions do not shift scheduled times | SATISFIED (source) | evaluateQueues uses Luxon with user timezone; isWithinHourWindow/isDayOfWeekAllowed/hasIntervalElapsed all accept DateTime; tests cover DST cases in shared package |
| WORKER-09 | 05-03 | Auto-destruct worker: after configured time period post published, calls platform delete; transitions auto_destructing -> destroyed | SATISFIED | autoDestructPost three-phase lifecycle; deleteTweet; PostStatusBadge has auto_destructing/destroyed states |

All 7 phase requirements accounted for. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/web/src/components/layout/Sidebar.tsx` | 5-7 | Duplicate `ListOrdered` import from lucide-react | Warning (IN-01) | Bundler deduplicates silently; dead weight |
| `packages/web/src/components/queues/QueueStatusBadge.tsx` | 21 | Cross-year seasonal pause logic inverted (`today < seasonalStart && today > seasonalEnd` is always false) | Warning (WR-04) | QueueStatusBadge shows "Active" for Nov-Jan windows during Feb-Oct when it should show "Seasonal pause" |
| `packages/api/src/services/queue.service.ts` | ~307 | `removePostFromQueue` leaves post in `queued` status with null queueId | Warning (WR-02) | Post shows as "Queued" with no queue association; stuck state; can't be rescheduled |
| `packages/api/src/routes/queues.ts` | 25 | `autoDestructQueueService` in QueuesDependencies interface but router destructures only `{ db }` | Info (WR-03) | Dead interface field; misleading to readers |
| `packages/web/src/hooks/use-queue-posts.ts` | ~121 | `useRemoveFromQueue` has no onError callback | Warning (WR-05) | Silent failure on delete — user gets no toast feedback |
| `packages/web/src/components/queues/HourWindowGrid.tsx` | ~31 | "Clear All" allows empty hourSlots, violating Zod min(1) | Info (WR-06) | Confusing UX — user can clear all hours, then submission fails with validation error |
| `packages/worker/src/queue-scanner.ts` | 83, 294 | `createLogger('queue-scanner')` called inside `evaluateQueues` on every 60s tick | Info (IN-03) | Minor allocation per tick; should be module-level |
| `packages/web/src/components/queues/SpinnableVariantsDialog.tsx` | 21, 37 | Magic number `5` for preview variant count | Info (IN-04) | Named constant `PREVIEW_VARIANT_COUNT` would be clearer |

**Recycling race condition (WR-01):** The bulk published→queued update and subsequent MIN(queue_position) select in queue-scanner.ts are not inside the same transaction. A concurrent scanner tick or process restart between the two operations could leave the queue stalled. This is a correctness gap, not a data safety issue for a single-user app, but it should be addressed before the queue engine is considered production-ready.

### Human Verification Required

#### 1. Complete Queue Engine UI Flow

**Test:** Run the app in the browser. Navigate to Queues in the sidebar. Create a queue with schedule configuration. Add a post to the queue. Verify the queue posts page renders correctly with reorder buttons and cursor indicator. Test the spinnable variants dialog on a post with `{opt1|opt2}` syntax. Use "Add Post" via the queue mode form.

**Expected:** Sidebar shows "Queues" between "Posts" and "New Post" with the ListOrdered icon. Queue list shows all queues with all table columns. Create queue form has interval type, days-of-week checkboxes, hour window grid, seasonal window section, and recycling toggle. Queue posts page shows position numbers, reorder buttons (disabled at boundaries), and "Next" label on the cursor post. SpinnableVariantsDialog shows 5 resolved variants with Regenerate button. NewPostPage in queue mode hides profile selector and schedule picker, shows "Save to Queue" button.

**Why human:** Visual rendering, interaction flow, and copy accuracy against UI-SPEC cannot be verified programmatically. Plan 05-05 Task 2 is an explicit `checkpoint:human-verify` gate that was not yet completed.

---

## Gaps Summary

There are two gaps blocking a clean pass:

**Gap 1 (Primary — stale dist builds):** `@sms/db` and `@sms/shared` packages have not been rebuilt after Phase 5 additions. The built dist in both packages predates Phase 5. This single root cause accounts for all 26 test failures across the three test files and all TypeScript compilation errors in packages/api and packages/worker. The source code is correct; the fix is `pnpm build` in `packages/db` and `packages/shared` followed by a test re-run. This is a standard post-merge build step, not a code quality issue.

**Gap 2 (Secondary — mock-db .returning() regression):** Phase 4 fix commit 08a3e17 added `.returning({ id: posts.id })` to `post-lifecycle.service.ts` but `packages/worker/src/__tests__/helpers/mock-db.ts` `updateChain` was not updated to support `.returning()` after `.where()`. This causes 4 failures in `post-lifecycle.test.ts`. These are pre-existing test infrastructure failures from Phase 4 that were not caught at Phase 4 close. They do not reflect a Phase 5 regression but must be fixed for worker tests to fully pass.

**Known code quality issues from code review (not blockers):** WR-01 (recycling race condition), WR-02 (removePostFromQueue leaves queued status), WR-04 (QueueStatusBadge cross-year seasonal logic inverted), WR-05 (no error toast on remove from queue). These were documented in 05-REVIEW.md and should be addressed in a follow-up.

---

_Verified: 2026-04-13T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
