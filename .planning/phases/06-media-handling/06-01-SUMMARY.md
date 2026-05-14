---
phase: 06-media-handling
plan: 01
subsystem: media-storage-foundation
tags: [storage, database-schema, docker, infrastructure]
dependency_graph:
  requires: []
  provides:
    - StorageBackend interface and implementations (local + S3)
    - createStorageBackend factory function
    - post_media schema with transcode status and soft-delete columns
    - Queue constants for transcode and media-cleanup
    - Per-platform media limit constants
    - Zod schemas for media upload/status responses
    - Docker media volume mount
  affects:
    - packages/shared (new storage module, constants, schemas)
    - packages/db (schema extension)
    - docker-compose.yml (new volume)
    - docker-compose.dev.yml (bind mount)
    - Dockerfile (ffmpeg in dev stage)
tech_stack:
  added:
    - "@aws-sdk/client-s3 ~3.1030.0 (S3-compatible storage backend)"
  patterns:
    - StorageBackend interface with factory function
    - Path traversal guard via resolve + startsWith
    - pgEnum for transcode_status column
key_files:
  created:
    - packages/shared/src/storage/storage-backend.ts
    - packages/shared/src/storage/local-storage.ts
    - packages/shared/src/storage/s3-storage.ts
    - packages/shared/src/storage/index.ts
    - packages/shared/src/constants/media-limits.ts
    - packages/shared/src/schemas/media.ts
    - packages/shared/src/__tests__/storage.test.ts
  modified:
    - packages/shared/src/constants/queues.ts
    - packages/shared/src/index.ts
    - packages/shared/package.json
    - packages/db/src/schema/post-media.ts
    - packages/db/src/schema/index.ts
    - docker-compose.yml
    - docker-compose.dev.yml
    - Dockerfile
    - .env.example
decisions:
  - "StorageBackend uses subpath export (@sms/shared/storage) since it depends on node:fs and AWS SDK -- not re-exported from barrel to keep browser bundle clean"
  - "S3Storage configured with forcePathStyle:true for MinIO/self-hosted S3 compatibility per RESEARCH.md Pitfall 7"
  - "postId made nullable to support orphaned uploads that haven't been attached to a post yet"
metrics:
  duration: "11 minutes"
  completed: "2026-04-15T19:05:33Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 12
  files_created: 7
  files_modified: 9
---

# Phase 6 Plan 01: Media Storage Foundation Summary

Storage backend abstraction with local filesystem and S3-compatible implementations, post_media schema extended with transcode status tracking and soft-delete, Docker media volumes mounted, ffmpeg available in all Docker stages.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | StorageBackend interface, implementations, media-limits, schemas, queue constants | de14194, 2fef690 | StorageBackend interface + LocalStorage + S3Storage, createStorageBackend factory, post_media schema with transcodeStatus/transcodeError/deletedAt, queue constants, media limits, Zod schemas, 12 tests |
| 2 | Docker infrastructure for media persistence and ffmpeg | 56d3dc0 | media_data volume in production, bind mount in dev, ffmpeg in Dockerfile dev stage, .env.example media vars |

## Verification Results

- `pnpm --filter @sms/shared test -- --run`: 126 tests passing (6 test files)
- `pnpm --filter @sms/shared build`: TypeScript compilation clean
- `pnpm --filter @sms/db build`: TypeScript compilation clean
- `docker compose config --quiet`: Valid for both production and dev compose files
- transcode queue constant present in queues.ts
- PLATFORM_MEDIA_LIMITS exported from media-limits.ts

## Implementation Details

### StorageBackend Abstraction

The `StorageBackend` interface defines five methods: `save`, `get`, `delete`, `getUrl`, and `exists`. Two implementations:

- **LocalStorage**: Reads/writes to the local filesystem at a configurable root directory. Uses `path.resolve()` + `startsWith(rootDir + path.sep)` guard on every operation to prevent path traversal (T-06-01 mitigation). Creates parent directories automatically on save. Ignores ENOENT on delete.

- **S3Storage**: Uses `@aws-sdk/client-s3` with `forcePathStyle: true` for self-hosted S3-compatible endpoints (MinIO, Backblaze B2, Cloudflare R2). Maps interface methods to PutObject/GetObject/DeleteObject/HeadObject commands.

- **Factory**: `createStorageBackend()` reads `MEDIA_STORAGE_BACKEND` env var at call time (not module scope). Returns LocalStorage by default, S3Storage when set to `s3` with required S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY env vars.

### Database Schema Changes

The `post_media` table gains three columns and a pgEnum:
- `transcode_status` enum: pending, processing, completed, failed, not_applicable (default)
- `transcode_error` text: stores failure reason for failed transcodes
- `deleted_at` timestamptz: soft-delete marker for cleanup pipeline
- `post_id` changed from NOT NULL to nullable: supports orphaned uploads before post save
- Two new indexes: `post_media_deleted_at` and `post_media_transcode_status`

### Queue Constants

Added to `QUEUE_NAMES`: `transcode` and `mediaCleanup`. Added to `JOB_NAMES`: `transcodeVideo`, `mediaCleanup`, `mediaCleanupScheduler`.

### Platform Media Limits

Twitter: 4 images (5MB each), 1 video (15MB), max 4096x4096 images. LinkedIn: 1 image (20MB), 1 video (200MB). Facebook: 10 images (5MB each), 1 video (100MB). Upload-time allowed formats include MOV, AVI, WEBM, MKV in addition to MP4 (server transcodes to MP4 before publish).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] StorageBackend as subpath export instead of barrel re-export**
- **Found during:** Task 1
- **Issue:** The storage module imports from `../env.js` (server-only) and uses `node:fs/promises` and `@aws-sdk/client-s3`. Re-exporting from the barrel `index.ts` would break browser bundles (the existing pattern excludes server-only modules from the barrel).
- **Fix:** Added `"./storage"` subpath export in package.json instead of barrel re-export. Media-limits constants and Zod schemas (browser-safe) are exported from the barrel as planned.
- **Files modified:** `packages/shared/package.json`

## Self-Check: PASSED

- All 7 created files verified on disk
- All 3 commits verified in git log (de14194, 2fef690, 56d3dc0)
- All 9 modified files confirmed via git diff
- Test suite: 126/126 passing
- Build: shared and db packages both compile clean
- Docker: both compose files validate
