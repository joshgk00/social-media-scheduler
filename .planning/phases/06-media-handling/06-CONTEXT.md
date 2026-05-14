# Phase 6: Media Handling - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Delivers media upload, processing, and storage for posts: image thumbnailing (300px), async video transcoding via ffmpeg, dual storage backend (local Docker volume or S3-compatible), and a media cleanup pipeline. Users attach media to posts through a drag-and-drop zone with thumbnail previews, client-side validation, and draggable reorder. The publish worker gains a media-readiness gate (skip posts with pending transcodes). A settings page card shows total storage consumed.

**In scope:**
- Media upload API via multer with disk storage, platform-specific validation (format, size, dimensions)
- Image processing: thumbnail generation (300px wide via sharp), format validation, auto-resize for platform limits before publish
- Video transcoding: async BullMQ `transcode` queue + worker using ffmpeg, H.264 MP4 720p output, 5-minute timeout
- Storage backend abstraction: `StorageBackend` interface with `LocalStorage` and `S3Storage` implementations, selected via `MEDIA_STORAGE_BACKEND` env var
- File path pattern: `{storage_root}/media/{profile_id}/{year}/{month}/{uuid}.{ext}`
- Post form media integration: drag-and-drop zone, thumbnail grid preview, drag-to-reorder, inline transcoding status
- Client-side validation: file type, size, count limits per platform (e.g., Twitter max 4 images, 15MB video)
- Publish worker media gate: skip posts where any media has `transcode_status = 'processing'` or `'pending'`
- Soft-delete on post deletion and media removal during editing; orphaned uploads cleaned after 24 hours
- Weekly `media-cleanup` BullMQ job: permanently deletes soft-deleted files older than 30 days
- Settings page storage usage card: total size, breakdown by type (images/videos), file count
- Docker volume mount for media storage in both dev and prod compose files

**Explicitly out of scope (belong in other phases):**
- LinkedIn and Facebook media upload APIs — Phase 7/8
- CSV bulk upload with media — Phase 10
- Platform-specific media upload to Twitter API (chunked upload) — already partially addressed in Phase 4 twitter publish service; Phase 6 handles the local pipeline, not the Twitter upload API itself
- Media in queue posts — queue posts use the same post form, so media attaches naturally, but queue-specific media behaviors (if any) are not special-cased here

</domain>

<decisions>
## Implementation Decisions

### Upload Experience

- **D-01:** Drag-and-drop zone below the post text field for media attachment. Also clickable to open native file picker. Shows per-file upload progress. Integrates into the existing `NewPostPage.tsx` post creation form.
- **D-02:** Attached media displayed as a thumbnail grid (2-4 per row depending on count). Each thumbnail has an X to remove and a drag handle to reorder. Upload progress shown as an overlay on each thumbnail while uploading.
- **D-03:** Client-side validation runs before upload begins — validates file type, size, and count against the selected platform's limits (e.g., Twitter: max 4 images at 5MB each, 1 video at 15MB; LinkedIn: 1 image at 20MB; Facebook: 10 images at 5MB each, 1 video at 100MB). Server validates again as the authority. Prevents wasted uploads of oversized files.
- **D-04:** Multiple images are reorderable via drag-and-drop in the thumbnail grid. The `sortOrder` column in `post_media` tracks position. Important because Twitter displays images in the order they're attached.

### Video Transcoding

- **D-05:** Accepted input formats: MP4, MOV, AVI, WEBM, MKV. Covers phone recordings (MOV/MP4), screen captures (WEBM/MKV), and common editor exports (AVI/MP4). Rejected formats fail at upload validation with a clear error message.
- **D-06:** Transcoding output: H.264 MP4, capped at 720p resolution. All three target platforms (Twitter, LinkedIn, Facebook) accept H.264 MP4. 720p keeps file sizes manageable for a self-hosted Proxmox box and transcoding fast. Good enough for social media viewed on phones.
- **D-07:** Transcoding status shown inline in the post form — video thumbnail in the media grid shows a spinner with "Transcoding..." overlay. The Schedule/Publish button is disabled until transcoding completes. If the user navigates away and returns, the status persists (polled from server). Post can be saved as draft while transcoding.
- **D-08:** Failed transcoding shows a red error state on the video thumbnail with the failure reason (e.g., "Unsupported codec", "Timeout exceeded — 5 minute limit"). User can click to retry transcoding or remove the video and upload a different one. Post remains in a draft-able state throughout.
- **D-09:** Transcoding timeout: 5 minutes per MEDIA-04. BullMQ job with `timeout: 300000`. Failed transcodes set `transcode_status = 'failed'` with `transcode_error` message on the `post_media` row.

### Storage Backend

- **D-10:** `StorageBackend` interface with `save()`, `get()`, `delete()`, `getUrl()` methods. Two implementations: `LocalStorage` (Docker volume) and `S3Storage` (S3-compatible via `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` env vars). Selected at startup via `MEDIA_STORAGE_BACKEND` env var (`local` default, `s3` optional). The existing avatar upload code from Phase 2 will be refactored to use this interface.
- **D-11:** No migration tool for switching backends. Switching from local to S3 is a fresh start — new uploads go to S3, old local files remain on disk. A migration script is a future task if ever needed. For a single-user tool, the realistic path is: start local, switch to S3 only if storage outgrows the Proxmox disk.
- **D-12:** Docker volume mount added in both compose files for media persistence. Production: named volume `media_data` mounted at `/app/data/media`. Dev: bind mount for direct file inspection.

### Media Cleanup

- **D-13:** Soft-delete triggered by: (1) post deletion — all media for the post marked as soft-deleted, (2) user removes a specific media item from a post during editing. Orphaned uploads (uploaded but never attached to a saved post) cleaned up after 24 hours. Covers all realistic deletion paths.
- **D-14:** Weekly cleanup job: BullMQ repeatable job in the `media-cleanup` queue, runs every Sunday at 3:00 AM UTC. Permanently deletes soft-deleted files older than 30 days from both the storage backend and the database. Fire-and-forget infrastructure — no user configuration needed.
- **D-15:** Storage usage displayed as a card on the settings page: total storage consumed (e.g., "2.3 GB"), breakdown by type (images vs videos), and total file count. No per-profile breakdown — single-user tool. Computed on demand via aggregate query on `post_media` table.

### Claude's Discretion

- Exact ffmpeg command flags and encoding presets for H.264 720p transcoding
- `fluent-ffmpeg` wrapper vs direct `child_process` spawn for ffmpeg — Claude picks based on error handling ergonomics
- Drag-and-drop library choice for the thumbnail grid reorder (e.g., `@dnd-kit/core` or similar)
- Upload progress implementation: XHR with progress events vs fetch with ReadableStream
- Exact multer configuration for disk storage (temp directory, filename pattern, limits)
- How the media upload API endpoint is structured (single endpoint vs per-post upload)
- S3Storage implementation: `@aws-sdk/client-s3` vs `minio` client — Claude picks based on compatibility with generic S3 endpoints
- Orphan cleanup: separate job or integrated into the weekly media-cleanup job
- How the publish worker discovers and skips posts with pending media (query modification vs pre-check)
- Avatar upload refactoring scope — minimal changes to route through the new StorageBackend interface

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §MEDIA — MEDIA-01 through MEDIA-09 (thumbnailing, validation, transcoding, timeout, publish gate, file paths, storage backend, soft-delete cleanup, storage usage display)
- `.planning/ROADMAP.md` §Phase 6 — Goal and 4 success criteria that must be TRUE for phase completion

### Project Context
- `.planning/PROJECT.md` §Constraints — "Video transcoding: ffmpeg included in Docker image; transcoding is async with 5-minute timeout; posts with pending media cannot publish" and "Media storage: Local filesystem via Docker volume as default; S3-compatible optional via env var"
- `CLAUDE.md` §Technology Stack — sharp ~0.34.x for image processing, multer ~2.x for file uploads, fluent-ffmpeg for video transcoding

### Prior Phase Context
- `.planning/phases/01-infrastructure-foundation/01-CONTEXT.md` — Docker Compose structure (D-04, D-05), factory function pattern, pino logging with correlation IDs
- `.planning/phases/02-authentication-user-account/02-CONTEXT.md` — Profile image upload via multer + sharp (D-29), storage pattern to refactor into StorageBackend interface
- `.planning/phases/04-publish-worker-scheduled-posts/04-CONTEXT.md` — BullMQ worker architecture (D-04 queue ownership), worker bootstrap pattern, publish pipeline, graceful shutdown. Phase 4 explicitly deferred media transcoding blocking to Phase 6.
- `.planning/phases/05-queue-engine/05-CONTEXT.md` — Auto-destruct worker pattern (D-12 through D-14), scanner reconciliation, queue post management

### Codebase Integration Points
- `packages/db/src/schema/post-media.ts` — Existing `post_media` table with filePath, thumbnailPath, mimeType, fileSize, width, height, sortOrder, post_id FK
- `packages/worker/src/index.ts` — Worker bootstrap; Phase 6 adds `transcode` queue/worker and `media-cleanup` repeatable job
- `packages/worker/src/publish-worker.ts` — Publish worker to add media-readiness gate
- `packages/shared/src/constants/queues.ts` — Queue names; add `transcode` and `mediaCleanup`
- `packages/api/src/routes/settings.ts` — Existing avatar upload via multer + sharp; refactor to use StorageBackend
- `packages/web/src/pages/posts/NewPostPage.tsx` — Post creation form; add drag-and-drop media zone, thumbnail grid, transcoding status
- `docker-compose.yml` / `docker-compose.dev.yml` — Add media volume mount, ffmpeg in Dockerfile

### External Library Docs (resolved during planning via mcp__context7__*)
- `sharp` — thumbnail generation, format validation, resize
- `multer` — disk storage configuration, file limits, multipart handling
- `fluent-ffmpeg` or native ffmpeg — H.264 transcoding, 720p cap, timeout handling
- `bullmq` — delayed/repeatable jobs for transcode queue and weekly cleanup
- `@aws-sdk/client-s3` or `minio` — S3-compatible storage implementation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **post_media table** — Already defined in `packages/db/src/schema/post-media.ts` with all needed columns (filePath, thumbnailPath, mimeType, fileSize, width, height, sortOrder, post_id FK with cascade delete). No schema changes needed for the core table.
- **multer + sharp** — Both installed in `packages/api`. Avatar upload in `packages/api/src/routes/settings.ts` demonstrates the full pipeline: multer disk storage → sharp resize → save to `./data/media/avatars/`. Phase 6 refactors this into the StorageBackend abstraction.
- **Path traversal guard** — Avatar upload uses `resolve() + startsWith(root + path.sep)` pattern to prevent directory breakout. Reuse for media upload.
- **BullMQ infrastructure** — `bullmq` and `ioredis` installed in worker and api packages. Queue constants file at `packages/shared/src/constants/queues.ts`. Worker bootstrap pattern in `packages/worker/src/index.ts` with per-resource graceful shutdown.
- **Worker patterns** — `createPublishWorker()` and auto-destruct worker provide templates for the transcode worker: factory function, dependency injection, try/catch per resource, BullMQ Worker constructor with concurrency/lockDuration/backoff.
- **Post state machine** — `transitionPost()` is the single state authority. Publish worker already checks post state before publishing; Phase 6 adds a media-readiness check alongside this.
- **shadcn/ui components** — Dialog, DropdownMenu, Table, Badge, Button all available for the storage usage card and media management UI.
- **TanStack Query hooks** — Polling pattern from `use-posts.ts` reusable for transcoding status polling.

### Established Patterns
- Factory functions with injected dependencies (`createApp`, `createWorker`)
- Env vars read at runtime inside functions, never at module scope
- Zod schemas in `packages/shared/src/schemas/` for request/response validation
- Router factory pattern: `createXxxRouter({ db })` returns Express Router
- Drizzle ORM transactions for multi-step mutations
- BullMQ repeatable jobs for scheduled background work (scanner, auto-destruct scanner)

### Integration Points
- **New BullMQ queues** — `transcode` (async video processing) and `media-cleanup` (weekly file deletion). Both registered in queue constants and added to worker bootstrap.
- **Publish worker modification** — Add pre-publish check: query `post_media` for the post, skip if any row has `transcode_status IN ('pending', 'processing')`.
- **New API routes** — `POST /api/media/upload` (multer upload), `GET /api/media/:id/status` (transcoding status polling), `DELETE /api/media/:id` (soft-delete), `GET /api/settings/storage` (usage stats).
- **Post form expansion** — `NewPostPage.tsx` gains a media drop zone component, thumbnail grid with reorder, and transcoding status indicator.
- **Dockerfile update** — Add `ffmpeg` installation in the production Docker image (and dev image).
- **Docker Compose** — Add named `media_data` volume mount for persistent media storage.
- **Settings page** — Add storage usage card to the existing settings page.

</code_context>

<specifics>
## Specific Ideas

- **Drag-and-drop + thumbnail grid mirrors Twitter/Facebook compose** — the mental model is: attach media below the text, see what you'll post, drag to reorder. Not a file manager, not a media library. Simple, per-post attachment.
- **720p cap is a deliberate constraint** — social media video is consumed on phones. 1080p doubles transcode time and file size for negligible viewer benefit on a 6-inch screen. If a specific platform needs higher res, that's a future per-platform profile decision.
- **No migration tool is pragmatic** — this is a single-user tool on Proxmox. The realistic storage evolution is: start local, run for months, maybe switch to S3 if the disk fills up. A migration script for that one-time event isn't worth the Phase 6 scope.
- **Orphan cleanup at 24 hours** — covers the case where a user starts composing, uploads media, then abandons the draft without saving. 24 hours is generous enough to not delete media from an in-progress draft session.
- **Storage usage card on settings is information, not action** — shows "you're using X GB" so the user knows when to consider S3 or clean up old posts. No manage/browse media UI — that's overkill for a personal tool.

</specifics>

<deferred>
## Deferred Ideas

- **Media library / browser** — a standalone page to browse all uploaded media, search by date/type, reuse media across posts. Not needed for a single-user tool; media is per-post.
- **Image editing (crop, rotate, filter)** — in-browser image editing before upload. Out of scope; user can edit in their image tool before uploading.
- **Storage migration CLI** — script to copy files from local to S3 or vice versa when switching backends. Deferred until someone actually needs it.
- **Per-platform video transcoding profiles** — different resolution/bitrate targets for Twitter vs LinkedIn vs Facebook. 720p H.264 works for all three right now.
- **Video thumbnail extraction** — auto-generate a poster frame from the video for the thumbnail grid. Currently would show a generic video icon. Nice-to-have for a polish phase.
- **Resumable uploads** — for very large video files (50-100MB), supporting upload resume on network interruption. Standard multer upload is fine for a self-hosted local network tool.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-media-handling*
*Context gathered: 2026-04-14*
