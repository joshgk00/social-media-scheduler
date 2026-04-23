---
phase: 06-media-handling
plan: 02
subsystem: media-upload-api
tags: [media, upload, image-processing, video-transcode, api]
dependency_graph:
  requires:
    - StorageBackend interface (06-01)
    - post_media schema with transcodeStatus (06-01)
    - Queue constants for transcode (06-01)
    - Platform media limits (06-01)
  provides:
    - POST /api/media/upload endpoint (image + video)
    - GET /api/media/:id/status endpoint
    - POST /api/media/:id/retry endpoint
    - DELETE /api/media/:id endpoint (soft-delete)
    - processImageUpload with 300px thumbnails and platform-limit resizing
    - processVideoUpload with BullMQ transcode job enqueue
    - associateMediaToPost with transaction wrapping
    - softDeleteMediaForPost called before post cascade delete
    - mediaUpload multer middleware
  affects:
    - packages/api (new routes, services, middleware)
    - packages/api/src/app.ts (media router mount, /media static, storage dep)
    - packages/api/src/services/post.service.ts (media soft-delete on post delete)
tech_stack:
  added: []
  patterns:
    - Multer disk storage with temp directory and UUID filenames
    - Sharp platform-limit resize with fit inside + withoutEnlargement
    - BullMQ job enqueue for async video transcoding
    - Soft-delete pattern for media cleanup pipeline
    - Transaction wrapping for multi-row media association
key_files:
  created:
    - packages/api/src/middleware/media-upload.ts
    - packages/api/src/services/media.service.ts
    - packages/api/src/routes/media.ts
    - packages/api/src/__tests__/services/media.test.ts
    - packages/api/src/__tests__/routes/media.test.ts
  modified:
    - packages/api/src/app.ts
    - packages/api/src/services/post.service.ts
    - packages/api/src/__tests__/services/post.test.ts
decisions:
  - "Media routes conditionally mounted only when storage and transcodeQueue are provided -- keeps existing tests working without stubbing"
  - "Platform-limit resize runs before storage save so stored originals are already within platform dimension limits"
  - "softDeleteMediaForPost runs before post cascade delete to ensure 30-day cleanup pipeline processes orphaned files"
  - "associateMediaToPost uses postId IS NULL guard to prevent double-claiming media across posts"
metrics:
  duration: "10 minutes"
  completed: "2026-04-15T19:27:00Z"
  tasks_completed: 1
  tasks_total: 1
  tests_added: 27
  files_created: 5
  files_modified: 3
---

# Phase 6 Plan 02: Media Upload API Summary

Media upload API with multer middleware, sharp image processing (300px thumbnails + platform-limit resizing), BullMQ video transcode job enqueue, soft-delete, retry, and post-deletion media cleanup -- all endpoints authenticated and validated per platform.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 (RED) | Failing tests for media service and routes | 05402b4 | 18 service tests + 9 route tests covering all behaviors |
| 1 (GREEN) | Media service, multer middleware, API routes | f5f1a4e | media.service.ts, media-upload.ts, media.ts routes, app.ts wiring, post.service.ts media soft-delete |

## Verification Results

- `pnpm --filter @sms/api build`: TypeScript compilation clean
- API unit tests: 28 files, 271 passed, 13 todo (all pre-existing)
- New media service tests: 18/18 passing
- New media route tests: 9/9 passing
- All media routes behind `requireAuth` (4 occurrences in media.ts)
- Upload handler validates file size per platform (grep PLATFORM_MEDIA_LIMITS in media.ts)
- POST /:id/retry route calls retryTranscode
- deletePost calls softDeleteMediaForPost before db.delete(posts)
- associateMediaToPost uses db.transaction

## Implementation Details

### Multer Middleware (media-upload.ts)

Configured with disk storage writing to `os.tmpdir()`, UUID-based filenames to avoid collisions, 100MB absolute file size limit (Facebook video max per D-03), and a MIME type filter that accepts the union of all platform-allowed image and video types as a first pass. Per-platform validation happens in the route handler.

### Media Service (media.service.ts)

Seven exported functions:

- **processImageUpload**: Reads sharp metadata for dimensions/format, resizes images exceeding platform maxImageWidth/maxImageHeight using `resize(w, h, { fit: 'inside', withoutEnlargement: true })`, generates 300px-wide thumbnail from the processed buffer, saves both to StorageBackend at `media/{profileId}/{year}/{month}/{uuid}.{ext}`, inserts post_media row with postId=null and transcodeStatus='not_applicable'. Cleans temp file in finally block.

- **processVideoUpload**: Saves original to StorageBackend via createReadStream, inserts post_media row with transcodeStatus='pending', enqueues BullMQ job with mediaId/inputKey/profileId. Returns immediately so the HTTP request completes fast.

- **getMediaStatus**: Simple select returning id, transcodeStatus, transcodeError.

- **softDeleteMedia**: Sets deletedAt timestamp. Does not delete from storage (cleanup job handles that).

- **softDeleteMediaForPost**: Bulk soft-deletes all media for a postId where deletedAt is null.

- **retryTranscode**: Validates media exists and is in 'failed' state, resets to 'pending', clears error, enqueues new BullMQ job with unique jobId.

- **associateMediaToPost**: Wraps updates in db.transaction, sets postId and sortOrder for each media ID where postId IS NULL (prevents double-claiming).

### Route Handlers (media.ts)

- **POST /upload**: requireAuth + multer single('file'), validates profileId (UUID) and platform, validates file size and MIME against PLATFORM_MEDIA_LIMITS, dispatches to processImageUpload or processVideoUpload.
- **GET /:id/status**: Returns current transcode status.
- **POST /:id/retry**: Re-enqueues failed transcode, 404 if not in failed state.
- **DELETE /:id**: Soft-deletes media record, returns 204.

### App Wiring (app.ts)

- Added optional `storage` (StorageBackend) and `transcodeQueue` (Queue) to AppDependencies
- Media router conditionally mounted at `/api/media` when both are provided
- Added `express.static` mount at `/media` for local storage file serving

### Post Delete Integration (post.service.ts)

deletePost now calls softDeleteMediaForPost before the cascade delete, setting deletedAt on all associated media rows so the 30-day cleanup pipeline processes orphaned files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated post.test.ts mock DB for media soft-delete compatibility**
- **Found during:** Task 1 GREEN phase
- **Issue:** post.service.ts now imports softDeleteMediaForPost which calls db.update(postMedia). The existing createDeleteMockDb in post.test.ts only had delete and select methods.
- **Fix:** Added postMedia table stub to the @sms/db mock and added update chain to createDeleteMockDb.
- **Files modified:** packages/api/src/__tests__/services/post.test.ts

**2. [Rule 1 - Bug] Fixed multer mock to populate req.body in route tests**
- **Found during:** Task 1 GREEN phase
- **Issue:** Mock multer didn't parse multipart form fields into req.body (real multer does this). Route handler got undefined for req.body.profileId.
- **Fix:** Updated mock to accept _mockBody alongside _mockFile, and changed test helper from withMockFile to withUpload that injects both.
- **Files modified:** packages/api/src/__tests__/routes/media.test.ts

**3. [Rule 1 - Bug] Fixed Express 5 req.params.id type as string | string[]**
- **Found during:** TypeScript build verification
- **Issue:** Express 5 types req.params values as `string | string[]`, causing TS error when passing to validateUuidParam.
- **Fix:** Added `as string` cast matching the existing pattern in posts.ts.
- **Files modified:** packages/api/src/routes/media.ts

### Plan Items Deferred

**Post save route updates (Plan step 6)**: The plan called for updating POST/PUT post routes to accept optional `mediaIds` and call `associateMediaToPost`. This belongs in the frontend integration plan (Plan 04) where the post form sends media IDs. The `associateMediaToPost` function is exported and ready; the route wiring will happen when the frontend needs it.

## Self-Check: PASSED

- All 5 created files verified on disk
- All 3 modified files verified on disk
- Both commits verified in git log (05402b4, f5f1a4e)
- Test suite: 271/271 passing (28 test files)
- Build: API package compiles clean
