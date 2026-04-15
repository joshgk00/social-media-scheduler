---
phase: 06-media-handling
plan: 03
subsystem: video-transcode-worker
tags: [video, transcode, ffmpeg, bullmq, publish-gate, worker]
dependency_graph:
  requires:
    - StorageBackend interface and implementations (06-01)
    - post_media schema with transcodeStatus (06-01)
    - Queue constants for transcode (06-01)
    - processVideoUpload enqueuing transcode jobs (06-02)
  provides:
    - transcodeVideo ffmpeg wrapper function
    - createTranscodeWorker BullMQ worker factory
    - PostLifecycleAbort media_pending abort reason
    - Publish worker media-readiness gate
  affects:
    - packages/worker/src/index.ts (transcode worker registration + shutdown)
    - packages/worker/src/post-lifecycle.service.ts (media check in transaction)
    - packages/worker/src/publish-worker.ts (media_pending abort handling)
tech_stack:
  added: []
  patterns:
    - child_process.spawn with array args for ffmpeg (no shell interpolation)
    - Temp file cleanup in finally blocks
    - BullMQ worker with lockDuration > job timeout to prevent stalled detection
key_files:
  created:
    - packages/worker/src/transcode.service.ts
    - packages/worker/src/transcode-worker.ts
    - packages/worker/src/__tests__/transcode.test.ts
  modified:
    - packages/worker/src/index.ts
    - packages/worker/src/post-lifecycle.service.ts
    - packages/worker/src/publish-worker.ts
    - packages/worker/src/__tests__/post-lifecycle.test.ts
    - packages/worker/src/__tests__/helpers/mock-db.ts
decisions:
  - "child_process.spawn used directly for ffmpeg (fluent-ffmpeg is archived) per RESEARCH.md recommendation"
  - "lockDuration set to 360s (6 min) exceeding the 5-min transcode timeout to prevent BullMQ stalled job detection during transcoding"
  - "Media-readiness check placed inside the publish transaction between budget check and profile load to maintain consistent read view"
  - "mock-db updated with .returning() support to unblock all post-lifecycle unit tests"
metrics:
  duration: "12 minutes"
  completed: "2026-04-15T19:45:49Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 12
  files_created: 3
  files_modified: 5
---

# Phase 6 Plan 03: Video Transcode Worker and Publish Media Gate Summary

ffmpeg transcode service spawns H.264 720p MP4 conversion with 5-minute SIGKILL timeout, BullMQ worker processes jobs at concurrency 1 with status tracking (processing/completed/failed), and publish lifecycle aborts with media_pending when posts have un-transcoded media.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 (RED) | Failing tests for transcode service and worker | ac3ca5a | 8 test cases: ffmpeg spawn args, exit codes, stderr capture, timeout, error events, worker factory |
| 1 (GREEN) | Transcode service, BullMQ worker, bootstrap wiring | 9336075 | transcode.service.ts, transcode-worker.ts, index.ts with storage + shutdown |
| 2 (RED) | Failing tests for media-readiness gate | 3e506bc | 4 test cases: pending abort, processing abort, completed proceeds, no media proceeds |
| 2 (GREEN) | Media-readiness gate in publish lifecycle | f85f160 | post-lifecycle.service.ts media check, publish-worker.ts abort handler, mock-db .returning() fix |

## Verification Results

- `pnpm --filter @sms/worker build`: TypeScript compilation clean
- `pnpm --filter @sms/worker exec vitest run src/__tests__/transcode.test.ts`: 8/8 passing
- `pnpm --filter @sms/worker exec vitest run src/__tests__/post-lifecycle.test.ts`: 15/15 passing (including 4 previously broken tests fixed by mock-db update)
- grep confirms `media_pending` in post-lifecycle.service.ts
- grep confirms `transcodeVideo` call in transcode-worker.ts
- grep confirms `createTranscodeWorker` in worker/src/index.ts
- grep confirms `isNull(postMedia.deletedAt)` in media check query

## Implementation Details

### Transcode Service (transcode.service.ts)

Exports `transcodeVideo(inputPath, outputPath)` that spawns ffmpeg as a child process with array arguments (T-06-09: no shell interpolation). Arguments: `-vf scale=-2:720` (720p, preserve aspect ratio), `-c:v libx264`, `-preset fast`, `-crf 23`, `-c:a aac -b:a 128k`, `-movflags +faststart` (web-optimized). A 5-minute setTimeout kills the process via SIGKILL (D-09/MEDIA-04). Stderr is captured and the last 500 characters are included in error messages for failed transcodes. The `isSettled` flag prevents double-resolution from close+timeout race conditions.

### Transcode Worker (transcode-worker.ts)

Factory function `createTranscodeWorker({ redis, db, storage })` returns a BullMQ Worker consuming the `transcode` queue with `concurrency: 1` (T-06-10: resource exhaustion mitigation) and `lockDuration: 360_000` (6 minutes, exceeding the 5-minute timeout to prevent stalled job detection during active transcoding).

Job processor flow:
1. Set `transcode_status = 'processing'` on the post_media row
2. Download original file from StorageBackend to a temp file
3. Call `transcodeVideo(inputPath, outputPath)`
4. On success: read output stats, save to storage at `media/{profileId}/{year}/{month}/{uuid}.mp4`, update post_media with new filePath, fileSize, mimeType, transcodeStatus='completed'
5. On failure: set transcodeStatus='failed' with truncated error message, rethrow for BullMQ retry
6. Finally: clean up both temp files (T-06-12), ignoring ENOENT

### Publish Media Gate (post-lifecycle.service.ts)

Added `media_pending` to `LifecycleAbortReason` union type. Inside the publish transaction, after the budget check and before the profile load, queries `post_media` for rows matching the post ID with `transcode_status IN ('pending', 'processing')` and `deleted_at IS NULL`. If count > 0, throws `PostLifecycleAbort('media_pending')`. The publish worker handles this as a graceful abort (scanner will re-evaluate when transcoding completes).

### Bootstrap Wiring (index.ts)

Creates `StorageBackend` via `createStorageBackend()` and `transcodeWorker` via `createTranscodeWorker({ redis, db, storage })` inside `main()`. The transcode worker is closed first in the shutdown sequence (before autoDestruct and publish workers) to stop accepting new transcode jobs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mock DB missing .returning() support**
- **Found during:** Task 2 GREEN phase
- **Issue:** The mock-db's `updateChain` returned `{ where: fn }` where `fn` resolved directly. The lifecycle service calls `.update().set().where().returning()`, which failed with "returning is not a function". This was a pre-existing issue affecting 4 existing tests.
- **Fix:** Added `.returning()` method to the `where` return value in `createMockWorkerDb()`. Returns `[{ id: 'mock-updated-id' }]` to satisfy the destructuring in the lifecycle service.
- **Files modified:** `packages/worker/src/__tests__/helpers/mock-db.ts`
- **Commit:** f85f160

## Self-Check: PASSED

- All 3 created files verified on disk
- All 5 modified files verified on disk
- All 4 commits verified in git log (ac3ca5a, 9336075, 3e506bc, f85f160)
- Test suite: 23/23 passing across both test files
- Build: worker package compiles clean
- Pre-existing integration test failures (2 files, 6 tests) unrelated to this plan (queue_id column missing in test DB)
