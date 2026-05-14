---
phase: 05-queue-engine
plan: 02
subsystem: api
tags: [express, drizzle, bullmq, queue-crud, queue-posts, auto-destruct, zod-validation]

requires:
  - phase: 05-queue-engine
    plan: 01
    provides: "Queues table schema, queue Zod schemas, schedule evaluation functions, shared constants"
  - phase: 04-publish-worker-scheduled-posts
    provides: "Posts table, post state machine, auth middleware, validation middleware, publish queue service pattern"
provides:
  - "Queue CRUD REST API (GET/POST/PUT/DELETE /api/queues)"
  - "Queue posts management API (add, list, reorder, remove)"
  - "Queue service layer with ownership enforcement on all operations"
  - "Auto-destruct BullMQ queue service with delay calculation"
  - "30 route-level tests covering CRUD, reorder, validation, auth, ownership"
affects: [05-03, 05-04, 05-05]

tech-stack:
  added: []
  patterns: [router factory with dependency injection, transactional position swap for reorder, calculateNextRunAt on create/update]

key-files:
  created:
    - packages/api/src/services/queue.service.ts
    - packages/api/src/services/auto-destruct-queue.service.ts
    - packages/api/src/routes/queues.ts
    - packages/api/src/__tests__/routes/queues.test.ts
  modified:
    - packages/api/src/app.ts

key-decisions:
  - "Avoided adding zod as direct API dependency -- used validateUuidParam for inline postId validation instead of a Zod schema"
  - "Queue list uses two queries (queues + post counts) instead of a single complex aggregate join for readability"
  - "Post reorder uses in-memory position lookup from sorted query results rather than SQL-level position arithmetic"

patterns-established:
  - "QueueServiceError extends AppError for structured error handling consistent with PostServiceError"
  - "Auto-destruct delay calculation: publishedAt + parseDuration - Date.now(), clamped to 0"
  - "Duration parsing supports minutes/hours/days/weeks with regex-based extraction"

requirements-completed: [QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-04, QUEUE-05]

duration: 7min
completed: 2026-04-13
---

# Phase 5 Plan 02: Queue CRUD API & Queue Posts Management Summary

**Queue REST API with 12 endpoints covering CRUD, post assignment, reorder, copy config, and auto-destruct BullMQ service -- all ownership-enforced**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-13T10:15:26Z
- **Completed:** 2026-04-13T10:22:49Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Built queue service layer with 11 exported functions: createQueue, updateQueue, deleteQueue, getQueues, getQueueById, copyQueueConfig, addPostToQueue, removePostFromQueue, getQueuePosts, movePostUp, movePostDown
- All service functions enforce userId ownership via `eq(queues.userId, userId)` WHERE clause -- no info leak on mismatch (returns 404)
- Queue creation and update recalculate nextRunAt using calculateNextRunAt from shared schedule evaluation
- Post reorder uses transactional position swap -- moveUp/moveDown swap queue_position with adjacent post inside a transaction
- Auto-destruct queue service wraps BullMQ with delay calculation: publishedAt + parsed duration - now, clamped to Math.max(0, ...)
- Created 12 REST endpoints mounted at /api/queues covering full queue lifecycle and post management
- All routes protected by requireAuth middleware and UUID parameter validation
- 30 passing tests covering CRUD, reorder, validation, auth enforcement, ownership, and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Queue service layer and CRUD routes** - `5ea4ee4` (feat)
2. **Task 2: Queue API route tests** - `598ab07` (test)

## Files Created/Modified

- `packages/api/src/services/queue.service.ts` - Queue CRUD, post assignment, reorder with transaction-based position swap
- `packages/api/src/services/auto-destruct-queue.service.ts` - BullMQ wrapper for delayed auto-destruct jobs with duration parsing
- `packages/api/src/routes/queues.ts` - 12 Express routes: queue CRUD + queue posts management
- `packages/api/src/app.ts` - Mounted queues router at /api/queues with autoDestructQueueService dependency
- `packages/api/src/__tests__/routes/queues.test.ts` - 30 tests for all queue routes

## Decisions Made

- Avoided adding zod as direct API package dependency; used existing validateUuidParam for inline postId validation instead of defining a Zod schema
- Queue list uses two queries (queues join + post count groupBy) rather than a single complex aggregate for readability and maintainability
- Post reorder fetches all queue posts sorted by position into memory, finds the target by index, and swaps with the adjacent post -- simpler than SQL-level position arithmetic for single-user queues

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

- packages/api/src/services/queue.service.ts: FOUND
- packages/api/src/services/auto-destruct-queue.service.ts: FOUND
- packages/api/src/routes/queues.ts: FOUND
- packages/api/src/__tests__/routes/queues.test.ts: FOUND
- packages/api/src/app.ts: FOUND (modified)
- Commit 5ea4ee4 (Task 1): FOUND
- Commit 598ab07 (Task 2): FOUND

---
*Phase: 05-queue-engine*
*Completed: 2026-04-13*
