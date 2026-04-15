---
phase: 06-media-handling
verified: 2026-04-15T21:00:00Z
status: gaps_found
score: 9/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Schema push applies all pending schema changes to the database"
    status: failed
    reason: "No drizzle-kit migration was generated or applied for Phase 6. The post_media table in the running database still uses the original schema: post_id is NOT NULL, and the transcode_status, transcode_error, and deleted_at columns do not exist. The 06-05-SUMMARY explicitly deferred this as a manual step ('no running database in CI/worktree environment'). The entire media pipeline depends on these columns being present at runtime."
    artifacts:
      - path: "packages/db/drizzle/"
        issue: "No Phase 6 migration file. Most recent migration is 0002_phase-04-publish-worker.sql. Journal has 3 entries, none covering Phase 6 schema changes."
      - path: "packages/db/src/schema/post-media.ts"
        issue: "Schema file is correct (has transcodeStatusEnum, transcodeStatus, transcodeError, deletedAt, nullable postId) but no corresponding migration SQL exists in drizzle/ folder."
    missing:
      - "Run 'cd packages/db && npx drizzle-kit generate' to generate migration SQL for Phase 6 schema changes"
      - "Run 'cd packages/db && npx drizzle-kit migrate' (or 'drizzle-kit push' for dev) to apply the migration to the database"
      - "Confirm the generated migration includes: CREATE TYPE transcode_status enum, ALTER TABLE post_media ADD COLUMN transcode_status, transcode_error, deleted_at, ALTER TABLE post_media ALTER COLUMN post_id DROP NOT NULL"
human_verification:
  - test: "End-to-end media upload flow"
    expected: "Upload an image to a post — progress bar shows during upload, thumbnail appears in grid, X/drag-handle buttons visible. Upload a video — transcoding spinner overlay appears, Schedule button disabled with tooltip. On transcode fail — red overlay with Retry and Remove links. Click Retry — status resets to Queued. Post list shows media icon with count."
    why_human: "Full upload pipeline requires a running dev environment (docker compose up). Requires actual ffmpeg transcoding and BullMQ job processing. Cannot verify progress overlay, spinner animation, or transcode state transitions programmatically."
---

# Phase 6: Media Handling Verification Report

**Phase Goal:** User can upload images and videos to posts with automatic thumbnailing, async video transcoding, and configurable storage backend
**Verified:** 2026-04-15T21:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | StorageBackend interface exists with save/get/delete/getUrl/exists methods | VERIFIED | `packages/shared/src/storage/storage-backend.ts` exports the interface with all 5 methods |
| 2 | LocalStorage reads/writes local filesystem with path traversal guard | VERIFIED | `local-storage.ts` uses `path.resolve() + startsWith(rootDir + path.sep)` guard on all operations |
| 3 | S3Storage reads/writes S3-compatible endpoint via @aws-sdk/client-s3 | VERIFIED | `s3-storage.ts` (99 lines) implements all 5 methods using PutObject/GetObject/Delete/Head commands with `forcePathStyle: true` |
| 4 | createStorageBackend factory returns LocalStorage by default, S3Storage when env=s3 | VERIFIED | `storage/index.ts` reads MEDIA_STORAGE_BACKEND at call time, returns correct implementation |
| 5 | post_media schema has transcodeStatus enum, transcodeError, deletedAt, and nullable postId | VERIFIED | `packages/db/src/schema/post-media.ts` has all 4 additions; postId has no `.notNull()`; two new indexes on deletedAt and transcodeStatus |
| 6 | Queue constants include transcode and mediaCleanup names | VERIFIED | `queues.ts` has `transcode: 'transcode'`, `mediaCleanup: 'media-cleanup'`, `transcodeVideo`, `mediaCleanup`, `mediaCleanupScheduler` in JOB_NAMES |
| 7 | Per-platform media limit constants exist for Twitter, LinkedIn, Facebook | VERIFIED | `media-limits.ts` exports `PLATFORM_MEDIA_LIMITS` with correct maxImages/maxVideos/allowedTypes for all 3 platforms |
| 8 | Docker compose files mount media_data volume | VERIFIED | `docker-compose.yml` has `media_data:/app/data/media` on api and worker; `docker-compose.dev.yml` has `./data/media:/app/data/media` bind mounts |
| 9 | Dockerfile development stage includes ffmpeg | VERIFIED | Line 8 of Dockerfile: `RUN apk add --no-cache python3 make g++ linux-headers ffmpeg` within the `development` stage |
| 10 | Uploaded images generate a 300px-wide thumbnail stored alongside the original | VERIFIED | `media.service.ts:processImageUpload` runs `sharp(buffer).resize(300, undefined, { withoutEnlargement: true })` and saves thumbnail via `storage.save(thumbnailKey, thumbnailBuffer, mimeType)` |
| 11 | Images exceeding platform dimension limits are resized before storage | VERIFIED | `media.service.ts` checks `PLATFORM_MEDIA_LIMITS[platform].maxImageWidth/maxImageHeight` and runs `resize(w, h, { fit: 'inside', withoutEnlargement: true })` before saving |
| 12 | Video uploads return immediately with transcode_status='pending' and enqueue BullMQ job | VERIFIED | `processVideoUpload` inserts row with `transcodeStatus: 'pending'`, calls `transcodeQueue.add(JOB_NAMES.transcodeVideo, ...)`, returns immediately |
| 13 | Video files are transcoded to H.264 MP4 at 720p via ffmpeg | VERIFIED | `transcode.service.ts` spawns ffmpeg with `-vf scale=-2:720 -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart` |
| 14 | Transcoding times out after 5 minutes with SIGKILL | VERIFIED | `TRANSCODE_TIMEOUT_MS = 300_000`, `proc.kill('SIGKILL')` on timeout, rejects with "Transcoding timeout exceeded (5 minutes)" |
| 15 | Publish worker skips posts with pending/processing media | VERIFIED | `post-lifecycle.service.ts` queries `postMedia WHERE transcodeStatus IN ('pending','processing') AND deletedAt IS NULL`, throws `PostLifecycleAbort('media_pending')` |
| 16 | User can drag-and-drop or click to upload media in post creation form | VERIFIED | `MediaDropZone.tsx` with `role="button"`, `tabIndex={0}`, `aria-label="Upload media files"`, hidden file input, drag event handlers |
| 17 | Upload progress shown as percentage overlay on each thumbnail | VERIFIED | `MediaThumbnail.tsx` renders `<Progress>` bar with `{uploadProgress}%` text when `isUploading` |
| 18 | Video thumbnails show transcoding status with retry on failure | VERIFIED | `MediaThumbnail.tsx` has queued/transcoding/complete/failed states; failed state renders "Retry" link that calls `onRetryTranscode()` |
| 19 | Schedule/Publish button disabled while any media is transcoding | VERIFIED | `NewPostPage.tsx` computes `hasTranscodingMedia` from mediaItems; disables submit button with tooltip |
| 20 | Client-side validation rejects files exceeding platform limits | VERIFIED | `MediaDropZone.tsx` validates against `PLATFORM_MEDIA_LIMITS[platform]` for type, size, count, and mixed image/video before calling `onFilesSelected` |
| 21 | Weekly cleanup job runs every Sunday at 3:00 AM UTC | VERIFIED | `startMediaCleanupScheduler` calls `upsertJobScheduler('weekly-media-cleanup', { pattern: '0 3 * * 0', tz: 'UTC' })` |
| 22 | Cleanup permanently deletes soft-deleted files older than 30 days | VERIFIED | `media-cleanup-worker.ts` queries `deletedAt IS NOT NULL AND deletedAt < 30 days ago`, calls `storage.delete(filePath)` and `storage.delete(thumbnailPath)`, then hard-deletes DB row |
| 23 | Orphaned uploads (no postId, older than 24h) are cleaned up | VERIFIED | `media-cleanup-worker.ts` queries `postId IS NULL AND deletedAt IS NULL AND createdAt < 24h ago`, deletes from storage and DB |
| 24 | Settings page shows storage usage card | VERIFIED | `StorageUsageCard.tsx` uses `useStorageUsage()` which queries `/api/settings/storage`; card renders 3-metric grid with formatBytes, loading/empty/error states |
| 25 | POST /api/media/:id/retry re-enqueues failed transcode | VERIFIED | `media.ts` route calls `retryTranscode(db, transcodeQueue, req.params.id)`; `retryTranscode` resets to 'pending', clears error, enqueues new BullMQ job |
| 26 | Post deletion soft-deletes associated media before cascade | VERIFIED | `post.service.ts:deletePost` imports and calls `softDeleteMediaForPost(db, postId)` before `db.delete(posts)` |
| 27 | associateMediaToPost runs inside a database transaction | VERIFIED | `media.service.ts:associateMediaToPost` line 289: `await db.transaction(async (tx) => { ... })` |
| 28 | Schema push applies all pending schema changes to the database | FAILED | No migration file exists for Phase 6. The drizzle/ folder only has 3 SQL files (0000, 0001, 0002); none contain transcode_status enum or related columns. The summary deferred this as a manual step. |

**Score:** 27/28 truths verified (1 failed: schema migration not applied)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/storage/storage-backend.ts` | StorageBackend interface | VERIFIED | 7 lines, exports interface with 5 required methods |
| `packages/shared/src/storage/local-storage.ts` | LocalStorage class | VERIFIED | 64 lines, implements StorageBackend with path traversal guard |
| `packages/shared/src/storage/s3-storage.ts` | S3Storage class | VERIFIED | 99 lines, implements StorageBackend via @aws-sdk/client-s3 |
| `packages/shared/src/storage/index.ts` | createStorageBackend factory | VERIFIED | Exports factory + all storage classes |
| `packages/shared/src/constants/media-limits.ts` | Per-platform media limits | VERIFIED | PLATFORM_MEDIA_LIMITS with twitter/linkedin/facebook entries |
| `packages/shared/src/schemas/media.ts` | Zod media schemas | VERIFIED | Exports mediaUploadResponseSchema, mediaStatusResponseSchema, TranscodeStatus |
| `packages/db/src/schema/post-media.ts` | Updated post_media schema | VERIFIED | Has transcodeStatusEnum, transcodeStatus, transcodeError, deletedAt; postId nullable |
| `packages/api/src/routes/media.ts` | Media upload/status/retry/delete endpoints | VERIFIED | Exports createMediaRouter with 4 routes all behind requireAuth |
| `packages/api/src/services/media.service.ts` | Image/video processing, retry, soft-delete | VERIFIED | Exports 7 functions as required |
| `packages/api/src/middleware/media-upload.ts` | Configured multer instance | VERIFIED | Exports mediaUpload with 100MB limit and MIME filter |
| `packages/worker/src/transcode.service.ts` | ffmpeg transcoding function | VERIFIED | Exports transcodeVideo with correct args and 5min timeout |
| `packages/worker/src/transcode-worker.ts` | BullMQ transcode worker | VERIFIED | Exports createTranscodeWorker with concurrency:1 and lockDuration:360_000 |
| `packages/worker/src/media-cleanup-worker.ts` | BullMQ media cleanup worker | VERIFIED | Exports createMediaCleanupWorker and startMediaCleanupScheduler |
| `packages/web/src/components/posts/MediaDropZone.tsx` | Drag-and-drop upload zone | VERIFIED | Has role="button", tabIndex, aria-label, PLATFORM_MEDIA_LIMITS validation |
| `packages/web/src/components/posts/MediaThumbnailGrid.tsx` | Sortable thumbnail grid | VERIFIED | Uses @dnd-kit/sortable with rectSortingStrategy |
| `packages/web/src/components/posts/MediaThumbnail.tsx` | Thumbnail with status overlays | VERIFIED | Has all states: uploading, queued, transcoding, complete, failed with Retry |
| `packages/web/src/hooks/use-media-upload.ts` | XHR upload hook | VERIFIED | Uses XMLHttpRequest with upload.onprogress for progress tracking |
| `packages/web/src/hooks/use-media.ts` | TanStack Query media hooks | VERIFIED | Exports useMediaStatus (refetchInterval:3000), useRetryTranscode, useDeleteMedia, useStorageUsage |
| `packages/web/src/pages/settings/components/StorageUsageCard.tsx` | Storage usage card | VERIFIED | HardDrive icon, 3-metric grid, formatBytes, loading/empty/error states |
| `packages/db/drizzle/` (Phase 6 migration) | Migration SQL for Phase 6 schema | MISSING | No migration file generated. Most recent is 0002 (Phase 4). Database does not have transcode_status column. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `storage/index.ts` | `local-storage.ts` | `new LocalStorage` | WIRED | Factory returns `new LocalStorage(mediaDir)` on default path |
| `storage/index.ts` | `s3-storage.ts` | `new S3Storage` | WIRED | Factory returns `new S3Storage({...})` when MEDIA_STORAGE_BACKEND='s3' |
| `media.ts` routes | `media.service.ts` | processImageUpload/processVideoUpload/retryTranscode | WIRED | All route handlers import and call correct service functions |
| `media.service.ts` | `storage/index.ts` | `storage.save` | WIRED | processImageUpload calls `storage.save(storageKey, processedBuffer, mimeType)` and `storage.save(thumbnailKey, ...)` |
| `app.ts` | `media.ts` | `createMediaRouter` at `/api/media` | WIRED | `app.use('/api/media', createMediaRouter({ db, storage, transcodeQueue }))` with conditional on storage+transcodeQueue |
| `post.service.ts` | `media.service.ts` | `softDeleteMediaForPost` before cascade | WIRED | `deletePost` imports and calls `softDeleteMediaForPost(db, postId)` before `db.delete(posts)` |
| `transcode-worker.ts` | `transcode.service.ts` | `transcodeVideo` | WIRED | Processor calls `await transcodeVideo(inputPath, outputPath)` |
| `worker/index.ts` | `transcode-worker.ts` | `createTranscodeWorker` | WIRED | Bootstrap calls `createTranscodeWorker({ redis, db, storage })` and includes in shutdown |
| `worker/index.ts` | `media-cleanup-worker.ts` | `createMediaCleanupWorker` + `startMediaCleanupScheduler` | WIRED | Both called in `main()`, both added to shutdown sequence |
| `post-lifecycle.service.ts` | `post-media` schema | transcode_status pending/processing check | WIRED | Queries `inArray(postMedia.transcodeStatus, ['pending', 'processing'])` + `isNull(postMedia.deletedAt)` |
| `NewPostPage.tsx` | `MediaDropZone.tsx` | Renders drop zone below text area | WIRED | Imports and renders `<MediaDropZone>` with all required props |
| `MediaDropZone.tsx` | `use-media-upload.ts` | `uploadMediaFile` on file drop | WIRED | MediaDropZone calls onFilesSelected; NewPostPage.handleFilesSelected calls `uploadMediaFile` |
| `MediaThumbnailGrid.tsx` | `use-media.ts` | `useMediaStatus` polling | WIRED | MediaStatusPoller inner component uses `useMediaStatus(mediaId, shouldPoll)` |
| `MediaThumbnail.tsx` | `use-media.ts` (via prop) | `useRetryTranscode` mutation | WIRED | "Retry" button calls `onRetryTranscode()` → NewPostPage.handleRetryTranscode → `retryTranscodeMutation.mutate(mediaId)` |
| `SettingsPage.tsx` | `StorageUsageCard.tsx` | Renders card after SecuritySection | WIRED | Imports and renders `<StorageUsageCard />` |
| `StorageUsageCard.tsx` | `/api/settings/storage` | `useStorageUsage()` | WIRED | `useStorageUsage()` calls `apiClient.get('/api/settings/storage')`; endpoint runs real DB aggregate |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `MediaThumbnailGrid.tsx` | `mediaItems` prop | `NewPostPage.mediaItems` state, populated via `processImageUpload`/`processVideoUpload` API responses | Yes — response comes from real DB inserts in media.service.ts | FLOWING |
| `StorageUsageCard.tsx` | `data` from `useStorageUsage()` | `GET /api/settings/storage` aggregate SQL on post_media | Yes — raw SQL `SUM(file_size)` with `WHERE deleted_at IS NULL` | FLOWING |
| `media-cleanup-worker.ts` | `expiredMedia`, `orphans` | DB select on post_media with date filter | Yes — queries post_media with `lt(deletedAt, thirtyDaysAgo)` and `lt(createdAt, twentyFourHoursAgo)` | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| transcodeVideo exports function | File content check | `export function transcodeVideo` found, SIGKILL + 300_000ms present | PASS |
| createTranscodeWorker concurrency=1 | grep check | `concurrency: 1`, `lockDuration: 360_000` confirmed | PASS |
| media_pending in LifecycleAbortReason | grep check | `'media_pending'` in union type, `PostLifecycleAbort('media_pending')` thrown | PASS |
| Full build / test suite | Cannot run without Docker environment | Summaries report 271 API tests, 30 worker tests, 39 web tests all passing | SKIP (no running environment) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MEDIA-01 | 06-02, 06-04 | Uploaded images generate 300px thumbnail | SATISFIED | `processImageUpload` generates thumbnail; `MediaThumbnailGrid` displays it |
| MEDIA-02 | 06-02, 06-04 | Images validated and resized if exceeding platform limits | SATISFIED | sharp resize with `fit: 'inside'`; client-side PLATFORM_MEDIA_LIMITS validation |
| MEDIA-03 | 06-02, 06-04 | Videos transcoded async; upload returns immediately with processing status | SATISFIED | `processVideoUpload` saves original, inserts row with `transcodeStatus: 'pending'`, enqueues BullMQ job, returns immediately |
| MEDIA-04 | 06-03 | Video transcoding timeout 5 minutes; failed = transcodeStatus='failed' with error | SATISFIED | 300_000ms setTimeout with SIGKILL; catch block sets `transcodeStatus: 'failed'` with truncated error |
| MEDIA-05 | 06-03 | Posts with pending/processing media skipped by publish worker | SATISFIED | `post-lifecycle.service.ts` media-readiness gate inside transaction |
| MEDIA-06 | 06-01 | Files stored at `{storage_root}/media/{profile_id}/{year}/{month}/{uuid}.{ext}` | PARTIALLY SATISFIED | Code generates correct path pattern; database schema columns do not exist in running DB (no migration applied) |
| MEDIA-07 | 06-01 | Storage backend selectable via env var (local or S3) | SATISFIED | `createStorageBackend()` reads `MEDIA_STORAGE_BACKEND`; both implementations complete and tested |
| MEDIA-08 | 06-02, 06-05 | Deleted post media soft-deleted; weekly job permanently removes files >30 days | PARTIALLY SATISFIED | Soft-delete code correct; cleanup worker correct; but `deleted_at` column not in running DB schema |
| MEDIA-09 | 06-05 | Settings page shows total media storage | SATISFIED | StorageUsageCard renders aggregate data from `/api/settings/storage` endpoint |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/web/src/components/posts/MediaThumbnailGrid.tsx` | 102 | `return null` in MediaStatusPoller | Info | Intentional — MediaStatusPoller is a side-effect-only polling component; not a stub |
| `packages/web/src/components/posts/MediaThumbnail.tsx` | 71 | `{/* Image or video placeholder */}` comment | Info | JSX comment labels a conditional block; not a placeholder stub |
| `packages/web/src/components/posts/MediaDropZone.tsx` | Multiple | `return []` | Info | Validation function returns empty array on invalid input; correct behavior, not stub |

No blocking anti-patterns found. All `return null` / `return []` instances are intentional conditional behavior or validation returns, not stub implementations.

### Human Verification Required

1. **End-to-end media upload flow**

   **Test:** Start dev environment with `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`. Run `cd packages/db && npx drizzle-kit push` to apply Phase 6 schema (required first). Then navigate to post creation.
   
   **Expected:**
   - Drop zone appears below text area with "Drop files or click to upload" text
   - Select a Twitter profile — hint text shows "Twitter: up to 4 images (5 MB each) or 1 video (15 MB)"
   - Upload an image — progress bar shows during upload, thumbnail appears in grid, X button and drag handle visible
   - Upload 2+ images — drag to reorder works
   - Upload a video — "Transcoding..." spinner overlay appears, Schedule button disabled with tooltip
   - If transcode fails — red overlay with AlertCircle icon, "Retry" and "Remove" links; clicking Retry resets to "Queued..." and polling resumes
   - Save a post with media as draft — media preserved
   - Post list shows media indicator (image icon + count)
   - Edit a post with existing media — thumbnails pre-populated
   
   **Why human:** Requires running dev environment with real ffmpeg transcoding and BullMQ job processing. Upload progress overlay, spinner animation, and transcode state transitions cannot be verified programmatically.

### Gaps Summary

**1 gap found, 1 human verification item pending.**

**Schema migration not applied (BLOCKING for runtime).** The Phase 6 schema changes are correctly defined in `packages/db/src/schema/post-media.ts` (transcodeStatus enum, transcodeStatus/transcodeError/deletedAt columns, nullable postId, two new indexes) but no corresponding SQL migration has been generated or applied. The drizzle/ folder only has migrations through Phase 4. The running database has the original `post_media` schema with `post_id NOT NULL` and no transcode columns.

This means: at runtime, every media upload would fail (INSERT into non-existent columns), every media-readiness check would fail (querying non-existent transcodeStatus column), and the cleanup worker would fail (querying non-existent deletedAt column).

**Resolution:** Run `cd packages/db && npx drizzle-kit generate --name phase-06-media-handling` to generate the migration, then `npx drizzle-kit migrate` to apply it. The gap can be closed quickly — all schema TypeScript is correct, only the migration artifact and its application are missing.

---

_Verified: 2026-04-15T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
