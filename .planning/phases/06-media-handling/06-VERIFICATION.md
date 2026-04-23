---
phase: 06-media-handling
verified: 2026-04-16T10:15:00Z
status: human_needed
score: 28/28 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 27/28
  gaps_closed:
    - "Schema push applies all pending schema changes to the database — migration 0003_phase-06-media-handling.sql generated and journal updated"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "End-to-end media upload flow"
    expected: "Upload an image to a post — progress bar shows during upload, thumbnail appears in grid, X/drag-handle buttons visible. Upload a video — transcoding spinner overlay appears, Schedule button disabled with tooltip. On transcode fail — red overlay with Retry and Remove links. Click Retry — status resets to Queued. Post list shows media icon with count."
    why_human: "Full upload pipeline requires a running dev environment (docker compose up). Requires actual ffmpeg transcoding and BullMQ job processing. Cannot verify progress overlay, spinner animation, or transcode state transitions programmatically."
---

# Phase 6: Media Handling Verification Report

**Phase Goal:** User can upload images and videos to posts with automatic thumbnailing, async video transcoding, and configurable storage backend
**Verified:** 2026-04-16T10:15:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure plan 06-06

## Re-verification Summary

The single gap from initial verification (Truth #28: schema migration not generated) has been closed. Plan 06-06 ran `pnpm drizzle-kit generate --name phase-06-media-handling` to produce `packages/db/drizzle/0003_phase-06-media-handling.sql`. The journal now has 4 entries with idx=3 tagged `phase-06-media-handling`. The snapshot file `0003_snapshot.json` was also created. No regressions detected on previously-passing truths.

All 28 observable truths are now VERIFIED. Status is `human_needed` because the end-to-end upload flow still requires manual testing with a running dev environment.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | StorageBackend interface exists with save/get/delete/getUrl/exists methods | VERIFIED | `packages/shared/src/storage/storage-backend.ts` exports interface with all 5 methods |
| 2 | LocalStorage reads/writes local filesystem with path traversal guard | VERIFIED | `local-storage.ts` uses `path.resolve() + startsWith(rootDir + path.sep)` guard on all operations |
| 3 | S3Storage reads/writes S3-compatible endpoint via @aws-sdk/client-s3 | VERIFIED | `s3-storage.ts` (99 lines) implements all 5 methods using PutObject/GetObject/Delete/Head commands |
| 4 | createStorageBackend factory returns LocalStorage by default, S3Storage when env=s3 | VERIFIED | `storage/index.ts` reads MEDIA_STORAGE_BACKEND at call time, returns correct implementation |
| 5 | post_media schema has transcodeStatus enum, transcodeError, deletedAt, and nullable postId | VERIFIED | `packages/db/src/schema/post-media.ts` has all 4 additions; postId has no `.notNull()`; two new indexes |
| 6 | Queue constants include transcode and mediaCleanup names | VERIFIED | `queues.ts` has `transcode: 'transcode'`, `mediaCleanup: 'media-cleanup'`, `transcodeVideo`, `mediaCleanup`, `mediaCleanupScheduler` in JOB_NAMES |
| 7 | Per-platform media limit constants exist for Twitter, LinkedIn, Facebook | VERIFIED | `media-limits.ts` exports `PLATFORM_MEDIA_LIMITS` with correct maxImages/maxVideos/allowedTypes for all 3 platforms |
| 8 | Docker compose files mount media_data volume | VERIFIED | `docker-compose.yml` has `media_data:/app/data/media` on api and worker; `docker-compose.dev.yml` has `./data/media:/app/data/media` bind mounts |
| 9 | Dockerfile development stage includes ffmpeg | VERIFIED | Line 8 of Dockerfile: `RUN apk add --no-cache python3 make g++ linux-headers ffmpeg` within `development` stage |
| 10 | Uploaded images generate a 300px-wide thumbnail stored alongside the original | VERIFIED | `media.service.ts:processImageUpload` runs `sharp(buffer).resize(300, undefined, { withoutEnlargement: true })` and saves thumbnail via `storage.save(thumbnailKey, ...)` |
| 11 | Images exceeding platform dimension limits are resized before storage | VERIFIED | `media.service.ts` checks `PLATFORM_MEDIA_LIMITS[platform].maxImageWidth/maxImageHeight` and runs `resize(w, h, { fit: 'inside', withoutEnlargement: true })` before saving |
| 12 | Video uploads return immediately with transcode_status='pending' and enqueue BullMQ job | VERIFIED | `processVideoUpload` inserts row with `transcodeStatus: 'pending'`, calls `transcodeQueue.add(JOB_NAMES.transcodeVideo, ...)`, returns immediately |
| 13 | Video files are transcoded to H.264 MP4 at 720p via ffmpeg | VERIFIED | `transcode.service.ts` spawns ffmpeg with `-vf scale=-2:720 -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart` |
| 14 | Transcoding times out after 5 minutes with SIGKILL | VERIFIED | `TRANSCODE_TIMEOUT_MS = 300_000`, `proc.kill('SIGKILL')` on timeout, rejects with "Transcoding timeout exceeded (5 minutes)" |
| 15 | Publish worker skips posts with pending/processing media | VERIFIED | `post-lifecycle.service.ts` queries `postMedia WHERE transcodeStatus IN ('pending','processing') AND deletedAt IS NULL`, throws `PostLifecycleAbort('media_pending')` |
| 16 | User can drag-and-drop or click to upload media in post creation form | VERIFIED | `MediaDropZone.tsx` with `role="button"`, `tabIndex={0}`, `aria-label="Upload media files"`, hidden file input, drag event handlers |
| 17 | Upload progress shown as percentage overlay on each thumbnail | VERIFIED | `MediaThumbnail.tsx` renders `<Progress>` bar with `{uploadProgress}%` text when `isUploading` |
| 18 | Video thumbnails show transcoding status with retry on failure | VERIFIED | `MediaThumbnail.tsx` has queued/transcoding/complete/failed states; failed state renders "Retry" link calling `onRetryTranscode()` |
| 19 | Schedule/Publish button disabled while any media is transcoding | VERIFIED | `NewPostPage.tsx` computes `hasTranscodingMedia` from mediaItems; disables submit button with tooltip |
| 20 | Client-side validation rejects files exceeding platform limits | VERIFIED | `MediaDropZone.tsx` validates against `PLATFORM_MEDIA_LIMITS[platform]` for type, size, count, and mixed image/video |
| 21 | Weekly cleanup job runs every Sunday at 3:00 AM UTC | VERIFIED | `startMediaCleanupScheduler` calls `upsertJobScheduler('weekly-media-cleanup', { pattern: '0 3 * * 0', tz: 'UTC' })` |
| 22 | Cleanup permanently deletes soft-deleted files older than 30 days | VERIFIED | `media-cleanup-worker.ts` queries `deletedAt IS NOT NULL AND deletedAt < 30 days ago`, calls `storage.delete(filePath)` and `storage.delete(thumbnailPath)`, then hard-deletes DB row |
| 23 | Orphaned uploads (no postId, older than 24h) are cleaned up | VERIFIED | `media-cleanup-worker.ts` queries `postId IS NULL AND deletedAt IS NULL AND createdAt < 24h ago`, deletes from storage and DB |
| 24 | Settings page shows storage usage card | VERIFIED | `StorageUsageCard.tsx` uses `useStorageUsage()` which queries `/api/settings/storage`; card renders 3-metric grid with formatBytes |
| 25 | POST /api/media/:id/retry re-enqueues failed transcode | VERIFIED | `media.ts` route calls `retryTranscode(db, transcodeQueue, req.params.id)`; `retryTranscode` resets to 'pending', clears error, enqueues new BullMQ job |
| 26 | Post deletion soft-deletes associated media before cascade | VERIFIED | `post.service.ts:deletePost` imports and calls `softDeleteMediaForPost(db, postId)` before `db.delete(posts)` |
| 27 | associateMediaToPost runs inside a database transaction | VERIFIED | `media.service.ts:associateMediaToPost` line 289: `await db.transaction(async (tx) => { ... })` |
| 28 | Schema push applies all pending schema changes to the database | VERIFIED | `packages/db/drizzle/0003_phase-06-media-handling.sql` exists with all required DDL; journal entry idx=3 tagged `phase-06-media-handling`; `0003_snapshot.json` present |

**Score:** 28/28 truths verified

### Gap Closure Verification — Truth #28

The specific must-haves from plan 06-06 were all met:

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| Migration SQL file exists at `packages/db/drizzle/0003_phase-06-media-handling.sql` | VERIFIED | File present in drizzle/ directory alongside 0000, 0001, 0002 |
| Migration creates `transcode_status` enum | VERIFIED | Line 1: `CREATE TYPE "public"."transcode_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'not_applicable')` |
| Migration adds `transcode_status` column | VERIFIED | `ALTER TABLE "post_media" ADD COLUMN "transcode_status" "transcode_status" DEFAULT 'not_applicable' NOT NULL` |
| Migration adds `transcode_error` column | VERIFIED | `ALTER TABLE "post_media" ADD COLUMN "transcode_error" text` |
| Migration adds `deleted_at` column | VERIFIED | `ALTER TABLE "post_media" ADD COLUMN "deleted_at" timestamp with time zone` |
| Migration makes `post_id` nullable | VERIFIED | `ALTER TABLE "post_media" ALTER COLUMN "post_id" DROP NOT NULL` |
| Migration creates `post_media_deleted_at` index | VERIFIED | `CREATE INDEX "post_media_deleted_at" ON "post_media" USING btree ("deleted_at")` |
| Migration creates `post_media_transcode_status` index | VERIFIED | `CREATE INDEX "post_media_transcode_status" ON "post_media" USING btree ("transcode_status")` |
| Journal has 4 entries, idx=3 tagged `phase-06-media-handling` | VERIFIED | `_journal.json` entries array has idx 0-3; idx=3 tag is `"0003_phase-06-media-handling"` |
| `0003_snapshot.json` exists | VERIFIED | File present at `packages/db/drizzle/meta/0003_snapshot.json` |

**Note on migration scope:** The generated migration also includes Phase 5 queue schema changes (CREATE TABLE queues, posts.queue_id, posts.queue_position, posts.destroyed_at). This is expected drizzle-kit behavior — it diffs against the last snapshot (0002) which predates both Phase 5 and Phase 6 schema additions. The migration is correct and complete.

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
| `packages/db/drizzle/0003_phase-06-media-handling.sql` | Migration SQL for Phase 6 schema | VERIFIED | All required DDL present; journal updated; snapshot created |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `storage/index.ts` | `local-storage.ts` | `new LocalStorage` | WIRED | Factory returns `new LocalStorage(mediaDir)` on default path |
| `storage/index.ts` | `s3-storage.ts` | `new S3Storage` | WIRED | Factory returns `new S3Storage({...})` when MEDIA_STORAGE_BACKEND='s3' |
| `media.ts` routes | `media.service.ts` | processImageUpload/processVideoUpload/retryTranscode | WIRED | All route handlers import and call correct service functions |
| `media.service.ts` | `storage/index.ts` | `storage.save` | WIRED | processImageUpload calls `storage.save(storageKey, ...)` and `storage.save(thumbnailKey, ...)` |
| `app.ts` | `media.ts` | `createMediaRouter` at `/api/media` | WIRED | `app.use('/api/media', createMediaRouter({ db, storage, transcodeQueue }))` |
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
| `0003_phase-06-media-handling.sql` | `post-media.ts` schema | drizzle-kit generate diff | WIRED | Migration SQL directly reflects schema: same enum values, same column definitions, same index names |

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
| Migration SQL contains all Phase 6 DDL | File content check | transcode_status enum, DROP NOT NULL, 3 new columns, 2 new indexes all present in 0003 migration | PASS |
| Journal idx=3 entry present | File content check | `_journal.json` entries[3].tag = "0003_phase-06-media-handling", idx=3 confirmed | PASS |
| Full build / test suite | Cannot run without Docker environment | Summaries report 271 API tests, 30 worker tests, 39 web tests all passing | SKIP (no running environment) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MEDIA-01 | 06-02, 06-04 | Uploaded images generate 300px thumbnail | SATISFIED | `processImageUpload` generates thumbnail; `MediaThumbnailGrid` displays it |
| MEDIA-02 | 06-02, 06-04 | Images validated and resized if exceeding platform limits | SATISFIED | sharp resize with `fit: 'inside'`; client-side PLATFORM_MEDIA_LIMITS validation |
| MEDIA-03 | 06-02, 06-04 | Videos transcoded async; upload returns immediately with processing status | SATISFIED | `processVideoUpload` saves original, inserts row with `transcodeStatus: 'pending'`, enqueues BullMQ job, returns immediately |
| MEDIA-04 | 06-03 | Video transcoding timeout 5 minutes; failed = transcodeStatus='failed' with error | SATISFIED | 300_000ms setTimeout with SIGKILL; catch block sets `transcodeStatus: 'failed'` with truncated error |
| MEDIA-05 | 06-03 | Posts with pending/processing media skipped by publish worker | SATISFIED | `post-lifecycle.service.ts` media-readiness gate inside transaction |
| MEDIA-06 | 06-01, 06-06 | Files stored at correct path pattern; metadata in MediaFile table | SATISFIED | Code generates correct path pattern; migration 0003 ensures all required columns exist in the database |
| MEDIA-07 | 06-01 | Storage backend selectable via env var (local or S3) | SATISFIED | `createStorageBackend()` reads `MEDIA_STORAGE_BACKEND`; both implementations complete |
| MEDIA-08 | 06-02, 06-05, 06-06 | Deleted post media soft-deleted; weekly job permanently removes files >30 days | SATISFIED | Soft-delete code correct; cleanup worker correct; `deleted_at` column now included in migration 0003 |
| MEDIA-09 | 06-05 | Settings page shows total media storage | SATISFIED | StorageUsageCard renders aggregate data from `/api/settings/storage` endpoint |

All 9 MEDIA requirements for Phase 6 are SATISFIED. MEDIA-06 and MEDIA-08 move from PARTIALLY SATISFIED to SATISFIED now that the migration exists.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/web/src/components/posts/MediaThumbnailGrid.tsx` | 102 | `return null` in MediaStatusPoller | Info | Intentional — MediaStatusPoller is a side-effect-only polling component; not a stub |
| `packages/web/src/components/posts/MediaThumbnail.tsx` | 71 | `{/* Image or video placeholder */}` comment | Info | JSX comment labels a conditional block; not a placeholder stub |
| `packages/web/src/components/posts/MediaDropZone.tsx` | Multiple | `return []` | Info | Validation function returns empty array on invalid input; correct behavior, not stub |

No blocking anti-patterns. No new anti-patterns introduced by 06-06 (the plan only created SQL and JSON files).

### Human Verification Required

1. **End-to-end media upload flow**

   **Test:** Start dev environment with `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`. Run `cd packages/db && pnpm drizzle-kit migrate` to apply the Phase 6 migration (0003). Then navigate to post creation.

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

No gaps. The single gap from initial verification is closed. All 28 observable truths are verified and all 9 MEDIA requirements are satisfied.

Phase 6 code is complete. Status is `human_needed` solely due to the end-to-end UI flow that requires a running Docker environment with ffmpeg.

---

_Verified: 2026-04-16T10:15:00Z_
_Verifier: Claude (gsd-verifier)_
