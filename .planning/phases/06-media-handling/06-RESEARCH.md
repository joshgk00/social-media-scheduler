# Phase 6: Media Handling - Research

**Researched:** 2026-04-14
**Domain:** Media upload, image processing, video transcoding, storage abstraction, BullMQ workers
**Confidence:** HIGH

## Summary

Phase 6 adds media upload, processing, and storage to the post creation workflow. The technical surface area spans five domains: (1) file upload via multer with server-side validation, (2) image processing via sharp for thumbnailing and platform-limit resizing, (3) async video transcoding via ffmpeg spawned as a child process through a BullMQ job, (4) a storage backend abstraction layer with local and S3-compatible implementations, and (5) frontend media attachment with drag-and-drop reorder using the already-installed @dnd-kit library.

The existing codebase provides strong foundations: the `post_media` table exists with core columns, multer and sharp are already installed and used for avatar uploads, BullMQ infrastructure is battle-tested across publish and auto-destruct workers, @dnd-kit is installed and used for thread reordering, and the `postFormData` method in api-client already handles multipart uploads with CSRF tokens. The primary work is schema extension (adding transcode status, soft-delete, and orphan tracking columns), building the StorageBackend abstraction, wiring up the transcode worker, and integrating the media drop zone into the post form.

**Primary recommendation:** Use `child_process.spawn` directly for ffmpeg (fluent-ffmpeg is archived), `@aws-sdk/client-s3` for S3-compatible storage (widest compatibility with self-hosted providers), and extend the existing @dnd-kit sortable pattern for media thumbnail reordering.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Drag-and-drop zone below the post text field for media attachment. Also clickable to open native file picker. Shows per-file upload progress. Integrates into the existing `NewPostPage.tsx` post creation form.
- **D-02:** Attached media displayed as a thumbnail grid (2-4 per row depending on count). Each thumbnail has an X to remove and a drag handle to reorder. Upload progress shown as an overlay on each thumbnail while uploading.
- **D-03:** Client-side validation runs before upload begins -- validates file type, size, and count against the selected platform's limits (e.g., Twitter: max 4 images at 5MB each, 1 video at 15MB; LinkedIn: 1 image at 20MB; Facebook: 10 images at 5MB each, 1 video at 100MB). Server validates again as the authority. Prevents wasted uploads of oversized files.
- **D-04:** Multiple images are reorderable via drag-and-drop in the thumbnail grid. The `sortOrder` column in `post_media` tracks position. Important because Twitter displays images in the order they're attached.
- **D-05:** Accepted input formats: MP4, MOV, AVI, WEBM, MKV. Covers phone recordings (MOV/MP4), screen captures (WEBM/MKV), and common editor exports (AVI/MP4). Rejected formats fail at upload validation with a clear error message.
- **D-06:** Transcoding output: H.264 MP4, capped at 720p resolution. All three target platforms (Twitter, LinkedIn, Facebook) accept H.264 MP4. 720p keeps file sizes manageable for a self-hosted Proxmox box and transcoding fast.
- **D-07:** Transcoding status shown inline in the post form -- video thumbnail in the media grid shows a spinner with "Transcoding..." overlay. The Schedule/Publish button is disabled until transcoding completes. If the user navigates away and returns, the status persists (polled from server). Post can be saved as draft while transcoding.
- **D-08:** Failed transcoding shows a red error state on the video thumbnail with the failure reason. User can click to retry transcoding or remove the video and upload a different one. Post remains in a draft-able state throughout.
- **D-09:** Transcoding timeout: 5 minutes per MEDIA-04. BullMQ job with `timeout: 300000`. Failed transcodes set `transcode_status = 'failed'` with `transcode_error` message on the `post_media` row.
- **D-10:** `StorageBackend` interface with `save()`, `get()`, `delete()`, `getUrl()` methods. Two implementations: `LocalStorage` (Docker volume) and `S3Storage` (S3-compatible via `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` env vars). Selected at startup via `MEDIA_STORAGE_BACKEND` env var (`local` default, `s3` optional). The existing avatar upload code from Phase 2 will be refactored to use this interface.
- **D-11:** No migration tool for switching backends. Switching from local to S3 is a fresh start.
- **D-12:** Docker volume mount added in both compose files for media persistence. Production: named volume `media_data` mounted at `/app/data/media`. Dev: bind mount for direct file inspection.
- **D-13:** Soft-delete triggered by: (1) post deletion -- all media for the post marked as soft-deleted, (2) user removes a specific media item from a post during editing. Orphaned uploads (uploaded but never attached to a saved post) cleaned up after 24 hours.
- **D-14:** Weekly cleanup job: BullMQ repeatable job in the `media-cleanup` queue, runs every Sunday at 3:00 AM UTC. Permanently deletes soft-deleted files older than 30 days from both the storage backend and the database.
- **D-15:** Storage usage displayed as a card on the settings page: total storage consumed, breakdown by type (images vs videos), and total file count. Computed on demand via aggregate query.

### Claude's Discretion
- Exact ffmpeg command flags and encoding presets for H.264 720p transcoding
- `fluent-ffmpeg` wrapper vs direct `child_process` spawn for ffmpeg
- Drag-and-drop library choice for the thumbnail grid reorder
- Upload progress implementation: XHR with progress events vs fetch with ReadableStream
- Exact multer configuration for disk storage (temp directory, filename pattern, limits)
- How the media upload API endpoint is structured (single endpoint vs per-post upload)
- S3Storage implementation: `@aws-sdk/client-s3` vs `minio` client
- Orphan cleanup: separate job or integrated into the weekly media-cleanup job
- How the publish worker discovers and skips posts with pending media (query modification vs pre-check)
- Avatar upload refactoring scope -- minimal changes to route through the new StorageBackend interface

### Deferred Ideas (OUT OF SCOPE)
- Media library / browser
- Image editing (crop, rotate, filter)
- Storage migration CLI
- Per-platform video transcoding profiles
- Video thumbnail extraction (poster frame)
- Resumable uploads
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEDIA-01 | Uploaded images generate a thumbnail (max 300px wide) stored alongside the original | sharp `resize(300)` with `withoutEnlargement: true`; avatar upload pattern in settings.ts already demonstrates sharp pipeline |
| MEDIA-02 | Images validated for format and dimensions; resized if exceeding platform limits before publish | sharp `metadata()` for dimensions; Zod schema for mime type validation; per-platform limit constants in shared package |
| MEDIA-03 | Videos transcoded asynchronously via ffmpeg BullMQ job; upload HTTP request returns immediately with `processing` status | BullMQ `transcode` queue + worker; `child_process.spawn` with ffmpeg; return media record with `transcode_status: 'processing'` |
| MEDIA-04 | Video transcoding timeout: 5 minutes; failed transcodes set `transcode_status = failed` with error message | BullMQ `timeout: 300_000` on transcode jobs; kill ffmpeg child process on timeout |
| MEDIA-05 | Posts with media in `pending` or `processing` transcode state are skipped by the publish worker with log message | Pre-publish query on `post_media` table checking `transcode_status`; PostLifecycleAbort with new `media_pending` reason |
| MEDIA-06 | Files stored at `{storage_root}/media/{profile_id}/{year}/{month}/{uuid}.{ext}`; metadata stored in MediaFile table | StorageBackend.save() generates path from template; all metadata columns exist in `post_media` table |
| MEDIA-07 | Media storage backend selectable via `MEDIA_STORAGE_BACKEND` env var | StorageBackend interface with LocalStorage and S3Storage; factory function reads env at startup |
| MEDIA-08 | Deleted post media soft-deleted; weekly background job permanently deletes soft-deleted files older than 30 days | `deletedAt` column on `post_media`; BullMQ repeatable job in `media-cleanup` queue |
| MEDIA-09 | Settings page shows total media storage consumed | SQL aggregate on `post_media.file_size` grouped by mime type prefix; settings route + frontend card |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| sharp | ~0.34.5 | Image thumbnailing, format validation, resize | Installed in @sms/api [VERIFIED: packages/api/package.json] |
| multer | ~2.0.2 | Multipart file upload middleware | Installed in @sms/api [VERIFIED: packages/api/package.json] |
| bullmq | ~5.73.0 | Async job queue for transcode and cleanup | Installed in @sms/api and @sms/worker [VERIFIED: package.json files] |
| @dnd-kit/core | ~6.3.1 | Drag-and-drop for media thumbnail reorder | Installed in @sms/web [VERIFIED: packages/web/package.json] |
| @dnd-kit/sortable | ~10.0.0 | Sortable preset for grid reorder | Installed in @sms/web [VERIFIED: packages/web/package.json] |
| ioredis | ~5.10.1 | Redis client for BullMQ | Installed in @sms/worker [VERIFIED: packages/worker/package.json] |

### New Dependencies
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @aws-sdk/client-s3 | ~3.1030.0 | S3-compatible storage backend | Official AWS SDK; works with any S3-compatible endpoint (MinIO, Backblaze, Cloudflare R2). 55 dependencies but widest compatibility with S3-compatible services. MinIO's own docs recommend AWS SDK for JS. [VERIFIED: npm registry] |
| @types/fluent-ffmpeg | - | NOT NEEDED | fluent-ffmpeg is archived; using child_process.spawn instead |

### Discretion Decisions (Researched)

**ffmpeg integration: Use `child_process.spawn` directly, NOT fluent-ffmpeg.**
- fluent-ffmpeg was archived by its maintainer on May 22, 2025 (repo is read-only, marked deprecated on npm) [VERIFIED: npm + GitHub issue #1324]
- A TypeScript fork `@ts-ffmpeg/fluent-ffmpeg` (v2.2.6) exists but was last updated August 2025 [VERIFIED: npm registry]
- For this project's single transcoding use case (any video to H.264 720p MP4), `child_process.spawn` with proper error handling is simpler, zero-dependency, and fully controllable
- CLAUDE.md mentions `fluent-ffmpeg` but the library is now archived -- direct spawn is the correct replacement

**S3 client: Use `@aws-sdk/client-s3`, NOT `minio` client.**
- `@aws-sdk/client-s3` v3.1030.0, actively maintained (last publish: April 13, 2026), 55 deps [VERIFIED: npm registry]
- `minio` v8.0.7, 13 deps, last updated Feb 2026 [VERIFIED: npm registry]
- MinIO's own documentation recommends using `@aws-sdk/client-s3` for JavaScript applications [CITED: docs.min.io]
- `@aws-sdk/client-s3` is the universal S3 client -- works with AWS S3, MinIO, Backblaze B2, Cloudflare R2, Wasabi. The `minio` client is MinIO-specific despite advertising S3 compatibility.
- For a project that says "S3-compatible via env var" without specifying which provider, the AWS SDK gives maximum flexibility

**Drag-and-drop: Use existing @dnd-kit/sortable with grid strategy.**
- @dnd-kit is already installed (v6.3.1 core, v10.0.0 sortable) and used in ThreadEditor.tsx [VERIFIED: codebase]
- The ThreadEditor uses `verticalListSortingStrategy`; media grid should use `rectSortingStrategy` for grid layout
- Same DndContext + SortableContext + useSortable pattern, just different strategy and item rendering

**Upload progress: Use XMLHttpRequest with `upload.onprogress`.**
- The `fetch` API does not provide upload progress in a straightforward way (ReadableStream approach is complex and has browser support caveats) [ASSUMED]
- XHR `upload.onprogress` is the standard, reliable approach for file upload progress tracking
- The api-client's `postFormData` method uses fetch but a dedicated upload function using XHR can coexist for the media upload endpoint specifically

**Orphan cleanup: Integrate into the weekly media-cleanup job.**
- One BullMQ repeatable job handles both: (1) permanently delete soft-deleted files > 30 days old, (2) delete orphaned uploads (no postId or unattached) > 24 hours old
- Two separate jobs adds complexity with no benefit -- both scan `post_media` and call `StorageBackend.delete()`

**Media upload API: Single endpoint `POST /api/media/upload`.**
- Media uploaded independently of post save -- user attaches files to the form, each file uploads immediately and returns a media record ID
- When saving the post, the frontend sends media IDs in the request body to associate them
- This decouples upload from post creation, enabling: upload progress per file, transcoding to start before post is saved, and orphan cleanup for abandoned uploads

**Publish worker media gate: Pre-check query inside the transaction.**
- Inside the existing publish lifecycle transaction (post-lifecycle.service.ts), add a query after locking the post: `SELECT COUNT(*) FROM post_media WHERE post_id = ? AND transcode_status IN ('pending', 'processing')`
- If count > 0, throw `PostLifecycleAbort('media_pending')` -- the scanner re-enqueues on next pass
- This keeps the media check atomic with the post state check, preventing race conditions

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| child_process.spawn | @ts-ffmpeg/fluent-ffmpeg (fork) | Adds a dependency for API convenience; fork maintenance uncertain; our use case is one command |
| @aws-sdk/client-s3 | minio npm client | Lighter (13 vs 55 deps) but MinIO-specific; limits future provider flexibility |
| XHR upload progress | fetch + ReadableStream | More "modern" but complex, inconsistent browser support for upload streams |
| Single upload endpoint | Per-post upload (attach at save time) | Simpler but blocks upload on post save; no async transcoding before save |

**Installation (new dependencies only):**
```bash
pnpm --filter @sms/api add @aws-sdk/client-s3@~3.1030.0
pnpm --filter @sms/worker add sharp@~0.34.5
```

Note: The worker needs `sharp` to generate thumbnails during transcoding completion (the transcode worker sets the video thumbnail after transcoding). Actually, thumbnail generation for uploaded images happens in the API at upload time. The worker only runs ffmpeg. The worker does NOT need sharp -- keep sharp in API only.

Correction: Only the API package needs the S3 SDK (it handles uploads and serves URLs). The worker package needs it too if the transcode worker writes the transcoded file to S3 storage. Since the transcode worker reads from temp storage and writes the output, it needs access to the StorageBackend -- so the S3 SDK should go in a shared location or in the worker package.

**Revised installation:**
```bash
pnpm --filter @sms/api add @aws-sdk/client-s3@~3.1030.0
pnpm --filter @sms/worker add @aws-sdk/client-s3@~3.1030.0
```

Or better: Put the StorageBackend abstraction in `@sms/shared` with `@aws-sdk/client-s3` as an optional peer dependency, and install it in both api and worker.

## Architecture Patterns

### Recommended Project Structure (new files)
```
packages/
  shared/src/
    constants/
      queues.ts              # Add `transcode` and `mediaCleanup` queue names
      media-limits.ts        # NEW: Per-platform file limits (type, size, count, dimensions)
    schemas/
      media.ts               # NEW: Zod schemas for media upload validation
    storage/
      storage-backend.ts     # NEW: StorageBackend interface
      local-storage.ts       # NEW: LocalStorage implementation
      s3-storage.ts          # NEW: S3Storage implementation
      index.ts               # NEW: Factory function createStorageBackend(env)
  db/src/
    schema/
      post-media.ts          # MODIFY: Add transcodeStatus, transcodeError, deletedAt, postId nullable
  api/src/
    routes/
      media.ts               # NEW: Upload, status, delete, storage usage endpoints
    services/
      media.service.ts       # NEW: Upload processing, thumbnail generation, association
    middleware/
      media-upload.ts        # NEW: Configured multer instance for media uploads
  worker/src/
    transcode-worker.ts      # NEW: BullMQ Worker for ffmpeg transcoding
    transcode.service.ts     # NEW: ffmpeg spawn wrapper with timeout and error handling
    media-cleanup-worker.ts  # NEW: Repeatable job for soft-delete cleanup + orphan cleanup
  web/src/
    components/posts/
      MediaDropZone.tsx       # NEW: Drag-and-drop upload area + file picker
      MediaThumbnailGrid.tsx  # NEW: Sortable thumbnail grid with status overlays
      MediaThumbnail.tsx      # NEW: Individual thumbnail with progress/status/remove
    hooks/
      use-media-upload.ts     # NEW: Upload hook with XHR progress tracking
      use-media.ts            # NEW: TanStack Query hooks for media status polling
    pages/settings/components/
      StorageUsageCard.tsx     # NEW: Storage usage display card
```

### Pattern 1: StorageBackend Interface
**What:** Abstract file storage behind an interface so local and S3 backends are interchangeable.
**When to use:** Any file write/read/delete/URL generation operation.

```typescript
// packages/shared/src/storage/storage-backend.ts
export interface StorageBackend {
  save(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  exists(key: string): Promise<boolean>;
}

// Factory reads env var at call time (not module scope)
export function createStorageBackend(): StorageBackend {
  const backend = process.env.MEDIA_STORAGE_BACKEND || 'local';
  if (backend === 's3') {
    return new S3Storage({
      endpoint: requireEnv('S3_ENDPOINT'),
      bucket: requireEnv('S3_BUCKET'),
      accessKey: requireEnv('S3_ACCESS_KEY'),
      secretKey: requireEnv('S3_SECRET_KEY'),
    });
  }
  const mediaDir = process.env.MEDIA_DIR || './data/media';
  return new LocalStorage(mediaDir);
}
```
[ASSUMED -- interface design based on project patterns]

### Pattern 2: Transcode Worker (child_process.spawn)
**What:** BullMQ worker that spawns ffmpeg as a child process with timeout enforcement.
**When to use:** Video upload triggers async transcoding job.

```typescript
// packages/worker/src/transcode.service.ts
import { spawn } from 'node:child_process';

const TRANSCODE_TIMEOUT_MS = 300_000; // 5 minutes (MEDIA-04)

export function transcodeVideo(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vf', 'scale=-2:720',           // Scale to 720p, keep aspect ratio
      '-c:v', 'libx264',               // H.264 codec
      '-preset', 'fast',               // Balance speed vs compression
      '-crf', '23',                     // Quality (lower = better, 23 is default)
      '-c:a', 'aac',                    // AAC audio
      '-b:a', '128k',                   // 128kbps audio bitrate
      '-movflags', '+faststart',        // Web-optimized MP4 (moov atom at start)
      '-y',                             // Overwrite output
      outputPath,
    ];

    const proc = spawn('ffmpeg', args);
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Transcoding timeout exceeded (5 minutes)'));
    }, TRANSCODE_TIMEOUT_MS);

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
```
[CITED: FFmpeg documentation and CRF guide at slhck.info/video/2017/02/24/crf-guide.html]

### Pattern 3: Media Upload with Deferred Association
**What:** Media files are uploaded independently and associated to a post at save time.
**When to use:** Upload begins when file is dropped; post save references media IDs.

```
1. User drops file -> POST /api/media/upload -> returns { id, thumbnailUrl, transcodeStatus }
2. Video? -> BullMQ transcode job enqueued -> status polling begins
3. User fills form, reorders media -> saves post with mediaIds: [id1, id2, ...]
4. POST /api/posts creates post, updates post_media rows to set postId + sortOrder
5. Orphaned media (uploaded but never associated) cleaned up after 24 hours
```
[ASSUMED -- standard pattern for decoupled media upload in web apps]

### Pattern 4: Publish Worker Media Gate
**What:** Check media readiness before publishing a post.
**When to use:** Inside the publish lifecycle transaction, after locking the post.

```typescript
// Addition to post-lifecycle.service.ts, inside the transaction after locking the post
const pendingMedia = await tx.execute<{ count: string }>(sql`
  SELECT COUNT(*)::text AS count
    FROM post_media
   WHERE post_id = ${ctx.postId}
     AND deleted_at IS NULL
     AND transcode_status IN ('pending', 'processing')
`);
const pendingCount = parseInt(pendingMedia[0]?.count ?? '0', 10);
if (pendingCount > 0) {
  lifecycleLogger.info(
    { pendingMediaCount: pendingCount },
    'Skipping publish — media still transcoding',
  );
  throw new PostLifecycleAbort('media_pending');
}
```
[ASSUMED -- follows existing PostLifecycleAbort pattern in codebase]

### Anti-Patterns to Avoid
- **Uploading media as part of the post save request:** Creates a blocking upload during form submission; prevents progress tracking and async transcoding
- **Storing files in the database:** Binary data in PostgreSQL bloats WAL, slows backups, complicates scaling
- **Using fluent-ffmpeg:** Archived as of May 2025; no security patches, no updates for newer ffmpeg versions
- **Polling transcoding status from the frontend on a tight interval:** Use 2-3 second polling interval, not sub-second; transcoding takes tens of seconds to minutes
- **Serving media files through Express in production:** Use nginx for static file serving (or S3 presigned URLs); Express is slow for static files at scale

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image thumbnailing | Custom canvas/ImageMagick wrapper | sharp `resize(300).withoutEnlargement()` | sharp uses libvips (fastest Node image processor); handles EXIF rotation, format detection, memory-efficient streaming |
| S3-compatible storage | Custom HTTP client for S3 API | @aws-sdk/client-s3 | S3 API is complex (request signing, multipart upload, presigned URLs); AWS SDK handles all edge cases |
| File upload parsing | Manual multipart/form-data parsing | multer disk storage | Streaming parser, busboy-based, handles memory efficiently for large files |
| Drag-and-drop reorder | Custom HTML5 DnD implementation | @dnd-kit/sortable | Already in the project; handles keyboard accessibility, touch support, animation out of the box |
| Video format detection | Parsing file headers manually | ffprobe (ships with ffmpeg) | ffprobe is ffmpeg's companion tool for metadata extraction; already installed in Docker image |

**Key insight:** Every library in this phase is already installed or is the well-known standard for its problem domain. The complexity is in wiring them together correctly, not in choosing tools.

## Common Pitfalls

### Pitfall 1: ffmpeg Not Available in Dev Container
**What goes wrong:** The development Dockerfile stage (`FROM base AS development`) installs Python/make/g++ for native addons but does NOT install ffmpeg. Video transcoding will fail silently or with a confusing "command not found" error.
**Why it happens:** ffmpeg is only added in the `api-production` and `worker-production` stages.
**How to avoid:** Add `apk add --no-cache ffmpeg` to the development stage in the Dockerfile. Alternatively, if running the worker outside Docker during dev, ffmpeg must be installed on the host (confirmed present on this machine at `/opt/homebrew/bin/ffmpeg` v8.0.1). [VERIFIED: Dockerfile inspection]
**Warning signs:** "ENOENT: spawn ffmpeg" errors in worker logs.

### Pitfall 2: post_media.postId Cannot Be Nullable Without Migration
**What goes wrong:** The current schema has `postId: uuid('post_id').notNull()` with cascade delete. Orphaned uploads (uploaded but not yet associated with a post) need `postId` to be nullable. Changing this requires a migration.
**Why it happens:** Phase 3 defined the table with `notNull()` because all media was assumed to belong to a post at creation time.
**How to avoid:** Generate a Drizzle migration that alters `post_media.post_id` to nullable. Also add the new columns: `transcode_status`, `transcode_error`, `deleted_at`. [VERIFIED: packages/db/src/schema/post-media.ts line 6]
**Warning signs:** Migration failure on startup; NOT NULL constraint violations during upload.

### Pitfall 3: CSRF Token Not Sent with FormData Upload
**What goes wrong:** If the media upload uses the `apiClient.postFormData` method, the CSRF token is properly included. But if a custom XHR upload function is built for progress tracking, forgetting to include `x-csrf-token` header will cause 403 errors.
**Why it happens:** The existing `postFormData` already handles this correctly -- the custom XHR function must replicate the CSRF token fetching logic. [VERIFIED: api-client.ts lines 114-146]
**How to avoid:** Extract CSRF token fetching into a shared utility function that both `postFormData` and the new XHR upload function can use.

### Pitfall 4: sharp Memory Spikes on Large Images
**What goes wrong:** Processing a 100MB image (e.g., a high-res TIFF from a DSLR) without streaming can spike memory.
**Why it happens:** sharp loads the entire image into memory by default.
**How to avoid:** Set multer file size limits per upload type (images: 20MB max per D-03). sharp's `resize()` pipeline streams internally, but the multer limit prevents extreme inputs. [ASSUMED]
**Warning signs:** OOM kills in Docker containers with tight memory limits.

### Pitfall 5: Race Condition Between Upload and Post Save
**What goes wrong:** User uploads 3 files, then saves the post. Between upload completion and post save, another request could theoretically claim the same media IDs.
**Why it happens:** Media records are created without a postId (orphaned), then associated at save time.
**How to avoid:** The association query should use `WHERE post_id IS NULL AND id IN (...)` to prevent double-claiming. Also, since this is a single-user app, the race window is essentially zero -- but the guard is still good practice. [ASSUMED]

### Pitfall 6: ffmpeg scale Filter With Odd Dimensions
**What goes wrong:** `scale=-2:720` can produce odd-width output that some codecs reject.
**Why it happens:** H.264 requires dimensions divisible by 2. If the input has an odd aspect ratio, `-2` rounds to the nearest even number but edge cases exist.
**How to avoid:** Use `scale='min(1280,iw)':min(720,ih):force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2` or the simpler `scale=-2:720` which already handles this (the `-2` means "scale to nearest even number"). Test with various input resolutions. [CITED: ffmpeg.org filter documentation]

### Pitfall 7: S3 Endpoint URL Format Varies by Provider
**What goes wrong:** `@aws-sdk/client-s3` requires the `endpoint` to be a full URL with protocol for non-AWS providers (e.g., `http://minio:9000`), and some providers require `forcePathStyle: true`.
**Why it happens:** AWS S3 uses virtual-hosted-style URLs by default; self-hosted S3-compatible services use path-style.
**How to avoid:** Set `forcePathStyle: true` in the S3 client config when using non-AWS endpoints. This is the standard approach for MinIO, Backblaze, and other S3-compatible services. [CITED: MinIO docs on S3 compatibility]

### Pitfall 8: nginx Not Configured to Serve Media Files
**What goes wrong:** The current nginx config serves `/avatars` via proxy to Express, but media files should be served directly by nginx for performance (for local storage) or proxied to S3 (for S3 storage).
**Why it happens:** Phase 2 serves avatars through Express (`app.use('/avatars', express.static(...))`). Media files at scale should be served more efficiently.
**How to avoid:** For local storage: add an nginx `location /media/` block pointing to the media volume. For S3: media URLs are direct S3 URLs or presigned URLs, no nginx change needed. Express can still serve as a fallback with `express.static` for simplicity in the initial implementation. [VERIFIED: nginx.conf and app.ts]

## Code Examples

### Image Upload and Thumbnail Generation
```typescript
// Thumbnail generation at upload time (in media.service.ts)
import sharp from 'sharp';
import path from 'path';
import { randomUUID } from 'node:crypto';

interface ProcessedImage {
  filePath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
}

export async function processImageUpload(
  tempFilePath: string,
  profileId: string,
  storage: StorageBackend,
): Promise<ProcessedImage> {
  const metadata = await sharp(tempFilePath).metadata();
  const { width, height, format } = metadata;

  const now = new Date();
  const fileId = randomUUID();
  const ext = format === 'jpeg' ? 'jpg' : (format ?? 'bin');
  const basePath = `media/${profileId}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  const filePath = `${basePath}/${fileId}.${ext}`;
  const thumbnailPath = `${basePath}/${fileId}_thumb.${ext}`;

  // Save original
  const originalBuffer = await sharp(tempFilePath).rotate().toBuffer();
  await storage.save(filePath, originalBuffer, `image/${format}`);

  // Generate and save thumbnail (300px wide, preserve aspect ratio)
  const thumbBuffer = await sharp(tempFilePath)
    .rotate()
    .resize(300, undefined, { withoutEnlargement: true })
    .toBuffer();
  await storage.save(thumbnailPath, thumbBuffer, `image/${format}`);

  const stats = await sharp(tempFilePath).metadata();

  return {
    filePath,
    thumbnailPath,
    width: width ?? 0,
    height: height ?? 0,
    fileSize: originalBuffer.length,
    mimeType: `image/${format}`,
  };
}
```
[ASSUMED -- based on sharp API and project patterns]

### Per-Platform Media Limits
```typescript
// packages/shared/src/constants/media-limits.ts
export interface PlatformMediaLimits {
  maxImages: number;
  maxImageSizeMb: number;
  maxVideos: number;
  maxVideoSizeMb: number;
  allowedImageTypes: string[];
  allowedVideoTypes: string[];
  maxImageWidth?: number;
  maxImageHeight?: number;
}

export const PLATFORM_MEDIA_LIMITS: Record<string, PlatformMediaLimits> = {
  twitter: {
    maxImages: 4,
    maxImageSizeMb: 5,
    maxVideos: 1,
    maxVideoSizeMb: 15,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedVideoTypes: ['video/mp4', 'video/quicktime'],
    maxImageWidth: 4096,
    maxImageHeight: 4096,
  },
  linkedin: {
    maxImages: 1,
    maxImageSizeMb: 20,
    maxVideos: 1,
    maxVideoSizeMb: 200,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif'],
    allowedVideoTypes: ['video/mp4', 'video/quicktime'],
  },
  facebook: {
    maxImages: 10,
    maxImageSizeMb: 5,
    maxVideos: 1,
    maxVideoSizeMb: 100,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff'],
    allowedVideoTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
  },
};
```
[CITED: Twitter API docs at developer.twitter.com; D-03 from CONTEXT.md]

### Schema Migration (post_media additions)
```typescript
// New columns for post_media table
import { pgTable, uuid, text, varchar, timestamp, integer, index, pgEnum } from 'drizzle-orm/pg-core';

export const transcodeStatusEnum = pgEnum('transcode_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'not_applicable',
]);

// Updated post_media table (schema change)
export const postMedia = pgTable('post_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),  // NOW NULLABLE
  filePath: text('file_path').notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  width: integer('width'),
  height: integer('height'),
  thumbnailPath: text('thumbnail_path'),
  sortOrder: integer('sort_order').notNull().default(0),
  transcodeStatus: transcodeStatusEnum('transcode_status').notNull().default('not_applicable'),
  transcodeError: text('transcode_error'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('post_media_post_id').on(table.postId),
  index('post_media_deleted_at').on(table.deletedAt),
  index('post_media_transcode_status').on(table.transcodeStatus),
]);
```
[VERIFIED: current schema in post-media.ts; new columns are ASSUMED design]

### Upload Progress with XHR
```typescript
// packages/web/src/hooks/use-media-upload.ts
export function uploadFile(
  file: File,
  csrfToken: string,
  onProgress: (percent: number) => void,
): Promise<MediaUploadResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload');
    xhr.setRequestHeader('x-csrf-token', csrfToken);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(JSON.parse(xhr.responseText)?.error || 'Upload failed'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}
```
[ASSUMED -- standard XHR upload pattern]

### BullMQ Repeatable Job for Cleanup
```typescript
// In worker/src/index.ts, during startup:
const mediaCleanupQueue = new Queue(QUEUE_NAMES.mediaCleanup, { connection: redis });
await mediaCleanupQueue.upsertJobScheduler(
  'weekly-media-cleanup',
  {
    pattern: '0 3 * * 0',  // Sunday at 3:00 AM UTC
    tz: 'UTC',
  },
  {
    name: JOB_NAMES.mediaCleanup,
    data: {},
  },
);
```
[ASSUMED -- based on BullMQ repeatable job pattern used in queue-scanner.ts]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| fluent-ffmpeg wrapper | child_process.spawn for ffmpeg | May 2025 (archived) | Must use spawn directly; no fluent API available |
| AWS SDK v2 | AWS SDK v3 (@aws-sdk/client-s3) | 2023 (v2 EOL) | Modular imports, smaller bundles, TypeScript native |
| multer 1.x (callback-based) | multer 2.x (promise-based) | 2024 | Already using v2.0.2; new busboy streaming engine |
| @dnd-kit separate packages | @dnd-kit monorepo | Ongoing | Already installed at latest versions |

**Deprecated/outdated:**
- `fluent-ffmpeg` (v2.1.3): Archived May 2025. Use `child_process.spawn` with ffmpeg directly. [VERIFIED: GitHub issue #1324]
- AWS SDK v2: End of life. Use `@aws-sdk/client-s3` v3.x. [VERIFIED: npm registry]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | XHR upload.onprogress is more reliable than fetch ReadableStream for upload progress | Discretion Decisions | LOW -- XHR is universally supported; fetch upload streams are newer but work too |
| A2 | StorageBackend interface design (save/get/delete/getUrl/exists) covers all needed operations | Architecture Patterns | MEDIUM -- may need `list()` for cleanup or `getSignedUrl()` for S3 |
| A3 | Single upload endpoint (POST /api/media/upload) is better than per-post upload | Discretion Decisions | LOW -- standard pattern; decouples upload from save |
| A4 | sharp does not spike memory dangerously with images under 20MB | Pitfalls | LOW -- sharp streams internally; multer limit prevents extreme inputs |
| A5 | The orphan cleanup can be combined into the weekly media-cleanup job | Discretion Decisions | LOW -- single job is simpler; if orphans accumulate faster than weekly, could add a daily sub-schedule |
| A6 | ffmpeg scale filter `-2:720` handles odd dimensions correctly for H.264 | Code Examples | LOW -- `-2` rounds to even; but should test edge cases |

## Open Questions

1. **StorageBackend package location**
   - What we know: Both API and worker need access to the StorageBackend
   - What's unclear: Should it live in `@sms/shared` (adding `@aws-sdk/client-s3` as a dependency there) or in a new `@sms/storage` package?
   - Recommendation: Put the interface in `@sms/shared` but keep the S3 implementation in each consuming package (api, worker) to avoid polluting shared with heavy AWS SDK dependencies. Alternatively, shared can have it as an optional peer dependency.

2. **Media serving in production (nginx vs Express)**
   - What we know: Current avatars are served through Express static middleware. For local storage, nginx can serve media files directly from the volume.
   - What's unclear: Whether to add nginx media serving now or keep Express static for simplicity.
   - Recommendation: Start with Express static (consistent with avatar pattern), add nginx media location as a future optimization. The app is single-user -- Express static is adequate.

3. **Avatar upload refactoring scope**
   - What we know: D-10 says "The existing avatar upload code from Phase 2 will be refactored to use this interface"
   - What's unclear: How much of settings.ts should change -- just the file I/O, or the entire upload flow?
   - Recommendation: Minimal refactoring -- replace the `fs.writeFile/unlink` calls with `StorageBackend.save/delete` calls. Keep the multer config and sharp processing as-is. This is a low-risk change that validates the StorageBackend interface works.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ffmpeg | Video transcoding | Host: Yes, Docker dev: No, Docker prod: Yes | 8.0.1 (host) | Add `apk add ffmpeg` to dev Dockerfile stage |
| Node.js | All packages | Yes | 22 LTS | -- |
| PostgreSQL | Database | Yes (Docker) | 17-alpine | -- |
| Redis | BullMQ queues | Yes (Docker) | 7.4-alpine | -- |
| Docker | Containers | Yes | -- | -- |
| sharp native binaries | Image processing | Yes (installed in api) | 0.34.5 | -- |

**Missing dependencies with no fallback:**
- None blocking

**Missing dependencies with fallback:**
- ffmpeg in development Docker image: Add `apk add --no-cache ffmpeg` to the `development` stage in the Dockerfile. Without this, video transcoding won't work when running the worker in Docker during development.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 |
| Config file | `packages/api/vitest.config.ts`, `packages/worker/vitest.config.ts`, `packages/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @sms/api test -- --run` |
| Full suite command | `pnpm -r test -- --run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEDIA-01 | Image upload generates 300px thumbnail | unit | `pnpm --filter @sms/api test -- --run src/__tests__/services/media.test.ts` | Wave 0 |
| MEDIA-02 | Image validation for format/dimensions; resize for platform limits | unit | `pnpm --filter @sms/api test -- --run src/__tests__/services/media.test.ts` | Wave 0 |
| MEDIA-03 | Video upload returns processing status; transcode job enqueued | unit + integration | `pnpm --filter @sms/api test -- --run src/__tests__/routes/media.test.ts` | Wave 0 |
| MEDIA-04 | Transcode timeout at 5 minutes; failed status set | unit | `pnpm --filter @sms/worker test -- --run src/__tests__/transcode.test.ts` | Wave 0 |
| MEDIA-05 | Publish worker skips posts with pending media | unit | `pnpm --filter @sms/worker test -- --run src/__tests__/post-lifecycle.test.ts` | Exists (extend) |
| MEDIA-06 | File stored at correct path pattern | unit | `pnpm --filter @sms/shared test -- --run src/__tests__/storage.test.ts` | Wave 0 |
| MEDIA-07 | Storage backend selection via env var | unit | `pnpm --filter @sms/shared test -- --run src/__tests__/storage.test.ts` | Wave 0 |
| MEDIA-08 | Soft-delete on post deletion; cleanup job removes files > 30 days | unit | `pnpm --filter @sms/worker test -- --run src/__tests__/media-cleanup.test.ts` | Wave 0 |
| MEDIA-09 | Settings storage usage endpoint returns correct totals | unit | `pnpm --filter @sms/api test -- --run src/__tests__/routes/storage-usage.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @sms/{package} test -- --run` (run tests for the affected package)
- **Per wave merge:** `pnpm -r test -- --run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/services/media.test.ts` -- covers MEDIA-01, MEDIA-02
- [ ] `packages/api/src/__tests__/routes/media.test.ts` -- covers MEDIA-03
- [ ] `packages/worker/src/__tests__/transcode.test.ts` -- covers MEDIA-04
- [ ] `packages/worker/src/__tests__/media-cleanup.test.ts` -- covers MEDIA-08
- [ ] `packages/shared/src/__tests__/storage.test.ts` -- covers MEDIA-06, MEDIA-07
- [ ] `packages/api/src/__tests__/routes/storage-usage.test.ts` -- covers MEDIA-09
- [ ] Extend `packages/worker/src/__tests__/post-lifecycle.test.ts` -- covers MEDIA-05

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Existing auth middleware (requireAuth) on all media endpoints |
| V3 Session Management | No | Existing session infrastructure |
| V4 Access Control | Yes | Media operations scoped to authenticated user; path traversal prevention |
| V5 Input Validation | Yes | Zod for API params; multer file type/size validation; sharp format validation |
| V6 Cryptography | No | Media files are not encrypted (not a requirement) |
| V12 File & Resources | Yes | Core category -- file upload validation, path traversal, storage limits |

### Known Threat Patterns for Media Handling

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via crafted filename | Tampering | `path.resolve()` + `startsWith(root + path.sep)` guard (already used in avatar upload) |
| Malicious file masquerading as image | Tampering | sharp `metadata()` validation (rejects non-image files regardless of extension); multer MIME filter |
| Zip bomb / decompression bomb | Denial of Service | multer file size limits; sharp processes pixel data, not compressed size |
| SSRF via S3 endpoint env var | Information Disclosure | S3 endpoint is admin-configured via env var, not user-supplied |
| Excessive storage consumption | Denial of Service | Per-upload size limits; weekly cleanup job; storage usage monitoring on settings page |
| ffmpeg command injection | Tampering | Arguments passed as array to `spawn()` (not string interpolation); file paths are UUID-generated |
| Cross-user media access | Elevation of Privilege | Not applicable (single-user app); still validate session auth on all endpoints |

## Sources

### Primary (HIGH confidence)
- [npm registry: sharp v0.34.5](https://www.npmjs.com/package/sharp) -- verified installed version
- [npm registry: multer v2.0.2](https://www.npmjs.com/package/multer) -- verified installed version
- [npm registry: @aws-sdk/client-s3 v3.1030.0](https://www.npmjs.com/package/@aws-sdk/client-s3) -- verified latest version
- [npm registry: fluent-ffmpeg v2.1.3 DEPRECATED](https://www.npmjs.com/package/fluent-ffmpeg) -- confirmed archived
- [GitHub: fluent-ffmpeg archived issue #1324](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/1324) -- phasing out confirmed
- [Twitter API media upload docs](https://developer.twitter.com/en/docs/twitter-api/v1/media/upload-media/overview) -- media limits
- [MinIO S3 compatibility docs](https://docs.min.io/docs/how-to-use-aws-sdk-for-javascript-with-minio-server.html) -- @aws-sdk recommended
- Codebase inspection: Dockerfile, package.json files, post-media.ts schema, settings.ts avatar upload, api-client.ts postFormData

### Secondary (MEDIUM confidence)
- [FFmpeg CRF Guide](https://slhck.info/video/2017/02/24/crf-guide.html) -- encoding quality settings
- [FFmpeg video optimization for platforms](https://www.videoscompress.com/blog/FFmpeg-Video-Optimization-for-Different-Platforms) -- social media presets
- [npm registry: @ts-ffmpeg/fluent-ffmpeg v2.2.6](https://www.npmjs.com/package/@ts-ffmpeg/fluent-ffmpeg) -- fork status

### Tertiary (LOW confidence)
- [Using FFmpeg in Node.js Without Fluent-FFmpeg](https://copyprogramming.com/howto/using-ffmpeg-in-node-without-using-fluent-ffmpeg) -- spawn pattern guide

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all core libraries verified installed; new dependency (@aws-sdk/client-s3) verified on npm
- Architecture: HIGH -- patterns follow established codebase conventions (factory functions, BullMQ workers, Drizzle schema)
- Pitfalls: HIGH -- verified against actual Dockerfile, schema, and nginx config
- Security: HIGH -- follows ASVS V12 (File & Resources) patterns; path traversal guard already exists in codebase

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable libraries, no fast-moving dependencies)
