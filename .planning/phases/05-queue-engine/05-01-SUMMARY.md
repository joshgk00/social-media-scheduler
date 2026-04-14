---
phase: 05-queue-engine
plan: 01
subsystem: database, shared
tags: [drizzle, postgresql, zod, luxon, spinnable-text, queue-scheduling, timezone]

requires:
  - phase: 01-infrastructure-foundation
    provides: "Drizzle ORM setup, DB schema patterns, shared package structure"
  - phase: 04-publish-worker-scheduled-posts
    provides: "Posts table, post status enum, BullMQ queue constants"
provides:
  - "Queues table schema with full schedule configuration"
  - "Posts table queue assignment columns (queueId FK, queuePosition, destroyedAt)"
  - "Spinnable text parser (resolveSpinnableText, extractVariants, countTotalVariants)"
  - "Timezone-aware schedule evaluation functions (isWithinHourWindow, isDayOfWeekAllowed, hasIntervalElapsed, isWithinSeasonalWindow, calculateNextRunAt)"
  - "Zod validation schemas for queue CRUD (createQueueSchema, updateQueueSchema, queueQuerySchema)"
  - "Extended queue constants (autoDestruct queue, scanQueues/autoDestructPost/scanAutoDestruct job names)"
affects: [05-02, 05-03, 05-04, 05-05]

tech-stack:
  added: [luxon@~3.7.2 in shared package]
  patterns: [Luxon DurationUnit typing for interval arithmetic, MMDD integer encoding for seasonal window comparison, SocialOomph day-of-week convention (0=Sun)]

key-files:
  created:
    - packages/db/src/schema/queues.ts
    - packages/shared/src/lib/spinnable-text.ts
    - packages/shared/src/lib/schedule-evaluation.ts
    - packages/shared/src/schemas/queues.ts
    - packages/shared/src/__tests__/spinnable-text.test.ts
    - packages/shared/src/__tests__/schedule-evaluation.test.ts
  modified:
    - packages/db/src/schema/posts.ts
    - packages/db/src/schema/index.ts
    - packages/shared/src/constants/queues.ts
    - packages/shared/src/index.ts
    - packages/shared/package.json

key-decisions:
  - "Used Luxon DurationLikeObject key type for interval unit casting instead of string-based keyof DateTime"
  - "MMDD integer encoding (month*100+day) for efficient seasonal window boundary comparison"
  - "Installed luxon in shared package since schedule evaluation functions are consumed by both API and worker"

patterns-established:
  - "Schedule evaluation functions accept optional DateTime param for testability without vi.useFakeTimers"
  - "Cross-year seasonal window detection via start > end MMDD comparison with OR logic"
  - "calculateNextRunAt scans up to 365 days forward to find next eligible slot"

requirements-completed: [QUEUE-01, QUEUE-05, QUEUE-06]

duration: 6min
completed: 2026-04-13
---

# Phase 5 Plan 01: Queue Schema & Shared Libraries Summary

**Queues table with timezone-aware schedule evaluation, spinnable text parser, and Zod validation schemas for the queue engine foundation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-13T10:03:53Z
- **Completed:** 2026-04-13T10:10:38Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- Created queues table with 21 columns covering interval scheduling (fixed/variable), day-of-week filtering, hour slot windows, seasonal date ranges, cursor-based recycling, and pause state
- Extended posts table with queueId FK (onDelete: set null), queuePosition for ordering, and destroyedAt for auto-destruct tracking
- Built spinnable text parser that resolves {opt1|opt2|opt3} syntax with 19 passing tests
- Implemented 5 timezone-aware schedule evaluation functions with 28 tests covering DST spring-forward/fall-back, cross-year seasonal windows, and interval boundary conditions
- Created Zod schemas enforcing hourSlot range 6-23, daysOfWeek 0-6, intervalValue 1-999
- Schema pushed to PostgreSQL -- queues table created, posts table extended with 3 new columns

## Task Commits

Each task was committed atomically:

1. **Task 1: Queue table schema, posts extension, shared constants, Zod schemas, and spinnable text parser** - `3e480e2` (feat)
2. **Task 2: Schedule evaluation pure functions with timezone-aware tests** - `71f95a6` (test)
3. **Task 3: Schema push to database** - No file changes (database-only operation via drizzle-kit push)

## Files Created/Modified
- `packages/db/src/schema/queues.ts` - Queues table with schedule config, seasonal windows, cursor, recycling
- `packages/db/src/schema/posts.ts` - Extended with queueId FK, queuePosition, destroyedAt
- `packages/db/src/schema/index.ts` - Barrel re-export of queues
- `packages/shared/src/lib/spinnable-text.ts` - {opt|opt} parser: resolve, extract variants, count
- `packages/shared/src/lib/schedule-evaluation.ts` - Timezone-aware hour window, day-of-week, interval, seasonal checks, calculateNextRunAt
- `packages/shared/src/schemas/queues.ts` - createQueueSchema, updateQueueSchema, queueQuerySchema
- `packages/shared/src/constants/queues.ts` - autoDestruct queue, scanQueues/autoDestructPost job names
- `packages/shared/src/index.ts` - Re-exports for queues schema, spinnable text, schedule evaluation
- `packages/shared/src/__tests__/spinnable-text.test.ts` - 19 tests for spin syntax parser
- `packages/shared/src/__tests__/schedule-evaluation.test.ts` - 28 tests with DST and timezone coverage
- `packages/shared/package.json` - Added luxon dependency

## Decisions Made
- Installed luxon (~3.7.2) in shared package to co-locate schedule evaluation with its consumers (both API and worker import from @sms/shared)
- Used DurationLikeObject key type from luxon rather than casting to keyof DateTime, which avoids TypeScript errors from non-duration keys like "toString"
- Encoded seasonal window boundaries as month*100+day integers for clean comparison without Date object overhead

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed luxon in shared package**
- **Found during:** Task 1 (schedule-evaluation.ts created alongside other files for barrel export)
- **Issue:** luxon was not in shared package dependencies, only in api/worker/web
- **Fix:** Added luxon@~3.7.2 and @types/luxon as dependencies
- **Files modified:** packages/shared/package.json, pnpm-lock.yaml
- **Verification:** TypeScript compiles, tests pass
- **Committed in:** 3e480e2 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed Luxon type cast for interval unit**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Casting intervalUnit to `keyof DateTime` includes non-duration keys (toString, etc.), causing TS2345 errors
- **Fix:** Used `DurationLikeObject` import and cast to `keyof DurationLikeObject` instead
- **Files modified:** packages/shared/src/lib/schedule-evaluation.ts
- **Verification:** `npx tsc --noEmit -p packages/shared/tsconfig.json` passes cleanly
- **Committed in:** 3e480e2 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for compilation and correctness. No scope creep.

## Issues Encountered
- vitest not available via npx in worktree root; resolved by using packages/shared/node_modules/.bin/vitest directly

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Queue schema and shared libraries ready for Plan 02 (Queue CRUD API routes)
- Schedule evaluation functions ready for Plan 03 (Queue scanner worker)
- Spinnable text parser ready for Plan 04 (Queue publish integration)
- All TypeScript types compile cleanly; tests provide regression safety for downstream plans

## Self-Check: PASSED

- All 10 created/modified files verified present on disk
- Commit 3e480e2 (Task 1) verified in git log
- Commit 71f95a6 (Task 2) verified in git log
- Task 3 was database-only (no file commit needed)

---
*Phase: 05-queue-engine*
*Completed: 2026-04-13*
