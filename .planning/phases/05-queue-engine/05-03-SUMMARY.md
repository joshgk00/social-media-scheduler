---
phase: 05-queue-engine
plan: 03
subsystem: worker
tags: [bullmq, queue-scanner, auto-destruct, twitter-delete, lifecycle, recycling, scheduling]

requires:
  - phase: 05-queue-engine
    plan: 01
    provides: "Queue schema, schedule evaluation functions, spinnable text parser, queue constants"
  - phase: 04-publish-worker-scheduled-posts
    provides: "Publish worker patterns, scanner patterns, backoff strategy, post-lifecycle service"
provides:
  - "Queue scheduling scanner (evaluateQueues, startQueueScanner) on 60s tick"
  - "Auto-destruct worker (createAutoDestructWorker) with 3 retries and exponential backoff"
  - "Auto-destruct lifecycle service (autoDestructPost) with three-phase lock/delete/commit"
  - "Twitter delete service (deleteTweet) with credential discipline and 404-as-success"
  - "Worker bootstrap integration with queue scanner and auto-destruct shutdown ordering"
affects: [05-04, 05-05]

tech-stack:
  added: []
  patterns: [Three-phase lifecycle for auto-destruct mirroring publish lifecycle, Thenable drizzle chain mocks for unit testing, Gap-safe cursor advancement via gt() operator]

key-files:
  created:
    - packages/worker/src/queue-scanner.ts
    - packages/worker/src/auto-destruct-worker.ts
    - packages/worker/src/auto-destruct-lifecycle.service.ts
    - packages/worker/src/twitter-delete.service.ts
    - packages/worker/src/__tests__/queue-scanner.test.ts
    - packages/worker/src/__tests__/auto-destruct-worker.test.ts
  modified:
    - packages/worker/src/index.ts

key-decisions:
  - "Used thenable chain mocks (objects with .then() that resolve to arrays) to simulate drizzle query builders in unit tests"
  - "Auto-destruct worker reuses publish worker backoff strategy (30s->5min->30min) for consistency"
  - "Queue scanner runs as a separate BullMQ repeatable job rather than sharing the existing scanner tick"

patterns-established:
  - "Thenable drizzle mock pattern: chain returns self for .from()/.where()/.orderBy()/.limit(), resolves via .then() for awaitable queries"
  - "Auto-destruct three-phase lifecycle mirrors publish lifecycle: transactional lock, external API call, commit phase"
  - "platformPostId sourced from job payload, never re-read from DB (Pitfall 1 prevention)"

requirements-completed: [QUEUE-06, WORKER-09]

duration: 8min
completed: 2026-04-13
---

# Phase 5 Plan 03: Queue Scanner & Auto-Destruct Worker Summary

**Queue scheduling scanner on 60s tick with full constraint evaluation, post recycling, and auto-destruct worker for delayed tweet deletion with 404-as-success handling**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-13T10:15:32Z
- **Completed:** 2026-04-13T10:24:07Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Built queue scanner that evaluates all active queues every 60s, checking 5 constraints in order: startDate, seasonal window, day-of-week, hour window, interval elapsed
- Cursor advancement uses `gt()` (queue_position > cursor) for gap-safe handling of deleted posts (Pitfall 6)
- Recycling wraps cursor to MIN(position) and transitions published posts back to queued status
- Spinnable text resolved at enqueue time via resolveSpinnableText (D-05)
- Double-enqueue prevention via transactional nextRunAt update (Pitfall 2)
- Auto-destruct lifecycle follows three-phase pattern: lock with FOR UPDATE, external API delete, commit destroyed status
- Twitter delete service mirrors credential discipline from twitter-publish (T-05-03-01)
- Platform 404 treated as success (D-13: post already deleted externally)
- Auto-destruct worker configured with 4 attempts (initial + 3 retries) and exponential backoff (D-12)
- Worker bootstrap integrates queue scanner and auto-destruct worker with proper shutdown ordering

## Task Commits

Each task was committed atomically:

1. **Task 1: Queue scanner and post-publish recycling logic** - `854c16d` (feat)
2. **Task 2: Auto-destruct worker, lifecycle service, Twitter delete service, and bootstrap integration** - `3deab5d` (feat)

## Files Created/Modified

- `packages/worker/src/queue-scanner.ts` - Queue scheduling scanner with evaluateQueues and startQueueScanner
- `packages/worker/src/twitter-delete.service.ts` - Twitter tweet deletion with credential discipline and 404 handling
- `packages/worker/src/auto-destruct-lifecycle.service.ts` - Three-phase auto-destruct lifecycle: lock, delete, commit
- `packages/worker/src/auto-destruct-worker.ts` - BullMQ worker for auto-destruct queue with retry config
- `packages/worker/src/index.ts` - Extended with queue scanner and auto-destruct worker, shutdown ordering updated
- `packages/worker/src/__tests__/queue-scanner.test.ts` - 16 tests for queue scanner
- `packages/worker/src/__tests__/auto-destruct-worker.test.ts` - 6 tests for auto-destruct system

## Decisions Made

- Reused the publish worker's backoff strategy (buildBackoffStrategy) for auto-destruct worker rather than creating a separate one, since both use the same 30s->5min->30min schedule
- Queue scanner runs as its own BullMQ repeatable job ('queue-scanner' queue) rather than piggy-backing on the existing scanner queue, keeping concerns separated
- Used thenable chain mock pattern for drizzle query builder simulation in tests, avoiding the need for database integration tests

## Deviations from Plan

None -- plan executed exactly as written.

## Threat Surface Scan

No new threat surface beyond what the plan's threat model covers. All mitigations implemented:
- T-05-03-01: Credential discipline mirrors twitter-publish exactly (decrypt in function scope, const binding, never logged)
- T-05-03-02: Auto-destruct jobs enqueued only by worker internals, platformPostId from publish-time capture
- T-05-03-03: nextRunAt transactional update + BullMQ jobId dedup prevents queue scanner from overwhelming publish queue
- T-05-03-04: platformPostId sourced from job payload, not re-read from DB (Pitfall 1)

## Self-Check: PASSED

- All 7 created/modified files verified present on disk
- Commit 854c16d (Task 1) verified in git log
- Commit 3deab5d (Task 2) verified in git log
- 22 tests pass (16 queue-scanner + 6 auto-destruct)
- TypeScript compiles cleanly (tsc --noEmit exits 0)

---
*Phase: 05-queue-engine*
*Completed: 2026-04-13*
