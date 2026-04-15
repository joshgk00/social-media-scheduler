---
phase: 06-media-handling
plan: 05
subsystem: media-cleanup-storage-usage
tags: [media, cleanup, storage, settings, bullmq, worker]
dependency_graph:
  requires:
    - StorageBackend interface and implementations (06-01)
    - post_media schema with deletedAt and transcodeStatus (06-01)
    - Queue constants QUEUE_NAMES.mediaCleanup, JOB_NAMES (06-01)
    - softDeleteMedia function (06-02)
    - createTranscodeWorker factory pattern (06-03)
    - useStorageUsage hook (06-04)
  provides:
    - createMediaCleanupWorker BullMQ worker factory
    - startMediaCleanupScheduler repeatable job setup
    - GET /api/settings/storage aggregate endpoint
    - StorageUsageCard settings page component
  affects:
    - packages/worker/src/index.ts (cleanup worker + scheduler registration)
    - packages/api/src/routes/settings.ts (new storage endpoint)
    - packages/web/src/pages/settings/SettingsPage.tsx (StorageUsageCard rendered)
tech_stack:
  added: []
  patterns:
    - BullMQ upsertJobScheduler for weekly cron with timezone
    - Raw SQL aggregate query via Drizzle sql template literal
    - Graceful storage.delete error handling (catch-log-continue)
key_files:
  created:
    - packages/worker/src/media-cleanup-worker.ts
    - packages/worker/src/__tests__/media-cleanup.test.ts
    - packages/api/src/__tests__/routes/settings.test.ts
    - packages/web/src/pages/settings/components/StorageUsageCard.tsx
  modified:
    - packages/worker/src/index.ts
    - packages/api/src/routes/settings.ts
    - packages/web/src/pages/settings/SettingsPage.tsx
decisions:
  - "Schema push deferred as manual step -- no running database in CI/worktree environment"
  - "Storage usage query uses raw SQL via Drizzle sql template literal for FILTER and COALESCE aggregate"
  - "Cleanup worker concurrency set to 1 -- no parallelism needed for weekly batch job"
metrics:
  duration: "8 minutes"
  completed: "2026-04-15T20:04:00Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 10
  files_created: 4
  files_modified: 3
---

# Phase 6 Plan 05: Media Cleanup and Storage Usage Summary

Weekly BullMQ media cleanup worker permanently deletes soft-deleted files older than 30 days and orphaned uploads older than 24 hours, storage usage API aggregates post_media stats, and settings page card displays total/image/video breakdown with loading/empty/error states.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 (RED) | Failing tests for cleanup worker and storage endpoint | 6b4a6bd | 7 cleanup worker tests, 1 scheduler test, 3 storage endpoint tests |
| 1 (GREEN) | Media cleanup worker, storage endpoint, bootstrap wiring | 4d8358f | media-cleanup-worker.ts, settings.ts storage route, index.ts registration |
| 2 | Storage usage card on settings page | cc1ec7a | StorageUsageCard.tsx, SettingsPage.tsx integration |

## Verification Results

- `pnpm --filter @sms/worker exec npx vitest run media-cleanup + transcode + post-lifecycle`: 30/30 passing
- `pnpm --filter @sms/api exec npx vitest run settings + media routes`: 23/23 passing
- `pnpm --filter @sms/web build`: TypeScript + Vite build clean (0 errors)
- `pnpm --filter @sms/worker build`: TypeScript compilation clean
- `pnpm --filter @sms/api build`: TypeScript compilation clean
- All acceptance criteria verified via grep (exports, queries, cron, shutdown, UI components, states)

## Implementation Details

### Media Cleanup Worker (media-cleanup-worker.ts)

Two exported functions:

- **createMediaCleanupWorker**: Factory function accepting `{ redis, db, storage }`. Creates BullMQ Worker on `media-cleanup` queue with concurrency 1. Processor runs two cleanup passes:
  1. **Expired soft-deletes**: Queries `post_media WHERE deleted_at IS NOT NULL AND deleted_at < 30 days ago`. For each row: deletes filePath and thumbnailPath from StorageBackend (catch-log-continue on failure), then hard-deletes the database row.
  2. **Orphaned uploads**: Queries `post_media WHERE post_id IS NULL AND deleted_at IS NULL AND created_at < 24 hours ago`. Same storage-delete + db-delete pattern.
  
  Logs summary with counts for both categories.

- **startMediaCleanupScheduler**: Creates a Queue and calls `upsertJobScheduler('weekly-media-cleanup', { pattern: '0 3 * * 0', tz: 'UTC' })` per D-14. Returns the queue for shutdown.

### Worker Bootstrap (index.ts)

Added `startMediaCleanupScheduler(redis)` and `createMediaCleanupWorker({ redis, db, storage })` to `main()`. Shutdown sequence includes `mediaCleanupWorker.close()` (before transcode) and `cleanupQueue.close()` (between scanner and notification queues).

### Storage Usage Endpoint (settings.ts)

`GET /api/settings/storage` with `requireAuth`. Executes raw SQL aggregate:
- `SUM(file_size)` for total, image, and video sizes
- `COUNT(*) FILTER (WHERE mime_type LIKE ...)` for image and video counts
- `WHERE deleted_at IS NULL` excludes soft-deleted files
- Response: `{ totalSize, imageSize, videoSize, imageCount, videoCount }` (numbers)

### StorageUsageCard (StorageUsageCard.tsx)

Settings page component using `useStorageUsage()` hook from Plan 04. Features:
- Card with HardDrive icon and "Storage Usage" title
- Three-column metric grid: Images (size + count), Videos (size + count), Total
- `formatBytes()` utility: 0 B / KB (whole) / MB (whole) / GB (1 decimal)
- Loading: three Skeleton rectangles
- Empty: "No media uploaded yet." centered
- Error: "Couldn't load storage info." in destructive color
- Accessibility: `aria-label` on each metric with full context

### Schema Push

Deferred as a manual step. The database is not running in the CI/worktree environment. Run `cd packages/db && npx drizzle-kit push` with `DATABASE_URL` set to apply all Phase 6 schema changes (transcode_status enum, transcode_status/transcode_error/deleted_at columns, nullable post_id, new indexes).

## Deviations from Plan

### Schema Push Deferred

- **Found during:** Task 1 step 4
- **Issue:** No running PostgreSQL database in the worktree/CI environment
- **Resolution:** Documented as a manual step per key_context instruction. All schema files are in place from Plan 01; the push command just needs a running DB.

## Self-Check: PASSED

- All 4 created files verified on disk
- All 3 modified files verified on disk
- All 3 commits verified in git log (6b4a6bd, 4d8358f, cc1ec7a)
- Test suite: 30/30 worker, 23/23 API, web build clean
- All acceptance criteria verified via automated grep checks
- No stubs found in created/modified files
