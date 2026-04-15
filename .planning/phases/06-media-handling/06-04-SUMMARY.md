---
phase: 06-media-handling
plan: 04
subsystem: media-frontend-ui
tags: [media, upload, drag-drop, thumbnails, transcoding-status, react, dnd-kit]
dependency_graph:
  requires:
    - POST /api/media/upload endpoint (06-02)
    - GET /api/media/:id/status endpoint (06-02)
    - POST /api/media/:id/retry endpoint (06-02)
    - DELETE /api/media/:id endpoint (06-02)
    - PLATFORM_MEDIA_LIMITS constants (06-01)
    - MediaUploadResponse and MediaStatusResponse schemas (06-01)
  provides:
    - MediaDropZone component with drag-and-drop and client-side validation
    - MediaThumbnailGrid with @dnd-kit/sortable reorder
    - MediaThumbnail with upload progress, transcoding status, and retry
    - useMediaUpload hook (XHR-based with progress tracking)
    - useMediaStatus hook (3-second TanStack Query polling)
    - useRetryTranscode and useDeleteMedia mutations
    - useStorageUsage query hook for settings page
    - Media-aware post creation and editing (mediaIds in payloads)
    - Post list media indicator with transcoding spinner
  affects:
    - packages/web (new components, hooks, updated pages)
    - packages/shared (mediaIds added to post schemas)
tech_stack:
  added:
    - "@radix-ui/react-progress ~1.1.8 (shadcn progress component)"
  patterns:
    - XHR upload with progress tracking (not fetch, per RESEARCH.md)
    - TanStack Query polling with refetchInterval for transcoding status
    - @dnd-kit/sortable rectSortingStrategy for grid-based media reorder
    - Client-side platform-specific validation before upload
key_files:
  created:
    - packages/web/src/components/posts/MediaDropZone.tsx
    - packages/web/src/components/posts/MediaThumbnail.tsx
    - packages/web/src/components/posts/MediaThumbnailGrid.tsx
    - packages/web/src/components/ui/progress.tsx
    - packages/web/src/hooks/use-media-upload.ts
    - packages/web/src/hooks/use-media.ts
    - packages/web/src/hooks/__tests__/use-media-upload.test.ts
    - packages/web/src/hooks/__tests__/use-media.test.ts
  modified:
    - packages/web/src/lib/api-client.ts
    - packages/web/src/pages/posts/NewPostPage.tsx
    - packages/web/src/pages/posts/EditPostPage.tsx
    - packages/web/src/pages/posts/PostsPage.tsx
    - packages/shared/src/schemas/posts.ts
    - packages/web/package.json
    - pnpm-lock.yaml
decisions:
  - "XHR chosen over fetch for upload progress (XHR.upload.onprogress is reliable; fetch ReadableStream has no upload progress)"
  - "mediaIds added to createPostSchema and updatePostSchema in @sms/shared to support frontend-API contract"
  - "Media status polling uses TanStack Query refetchInterval rather than WebSocket for simplicity in single-user app"
  - "Tooltip wrapping disabled submit button uses shadcn Tooltip with aria-describedby for accessibility"
metrics:
  duration: "14 minutes"
  completed: "2026-04-15T19:48:00Z"
  tasks_completed: 3
  tasks_total: 3
  tests_added: 10
  files_created: 8
  files_modified: 7
---

# Phase 6 Plan 04: Frontend Media Upload UI Summary

Drag-and-drop media upload zone, sortable thumbnail grid with @dnd-kit, XHR-based upload progress tracking, video transcoding status polling with retry, client-side platform validation, and media-aware post creation/editing wired into all three post pages.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Hooks, API client export, and media components | 943ae48 | MediaDropZone, MediaThumbnail, MediaThumbnailGrid, useMediaUpload (XHR), useMediaStatus (3s poll), useRetryTranscode, useDeleteMedia, useStorageUsage, shadcn progress, 10 tests |
| 2 | Wire media components into post pages and post list | 56f7f2a | NewPostPage media integration with state management, EditPostPage with existing media loading, PostsPage media indicator, mediaIds in create/update schemas, transcoding-aware submit disable |
| 3 | Verify media upload UI end-to-end | - | Auto-approved per autonomous execution; build passes, all tests pass |

## Verification Results

- `pnpm --filter @sms/web test -- --run`: 6 test files, 39 passed, 13 todo (all pre-existing)
- `pnpm --filter @sms/web build`: TypeScript compilation and Vite build clean, 0 errors
- New hook tests: 10/10 passing (5 upload XHR tests, 5 media query/mutation tests)
- All acceptance criteria verified via grep checks

## Implementation Details

### MediaDropZone

Drag-and-drop upload area that replaces the Phase 3 placeholder in NewPostPage (lines 321-327) and EditPostPage. Features:
- Idle state: dashed border, Upload icon, "Drop files or click to upload" text
- Compact strip when files already attached: "Add more files"
- Hidden when at platform file limit or when disabled
- Drag-over states: primary border for valid files, destructive border for invalid types
- Client-side validation against PLATFORM_MEDIA_LIMITS: file type, size, count, no mixed images/video
- Platform hint text below zone (Twitter/LinkedIn/Facebook limits or "Select a profile")
- Accessibility: role="button", tabIndex={0}, Enter/Space opens picker, aria-live region for drag feedback

### MediaThumbnail

Individual thumbnail card with multiple overlay states:
- Uploading: semi-transparent overlay with shadcn Progress bar and percentage text
- Transcode queued: static Loader2 icon + "Queued..." text
- Transcoding: spinning Loader2 + "Transcoding..." in warning color
- Transcode complete: momentary green CheckCircle (1.5s fade)
- Transcode failed (D-08): red overlay with AlertCircle, error text, "Retry" and "Remove" links
- Drag active: opacity-50 with ring-2 ring-primary
- Remove button (X) top-right, drag handle (GripVertical) top-left
- Read-only mode: no buttons, no handles, slight opacity

### MediaThumbnailGrid

Sortable grid using @dnd-kit/sortable with rectSortingStrategy (grid strategy vs ThreadEditor's verticalListSortingStrategy). Renders MediaThumbnail in a responsive grid (2 cols mobile, 4 cols desktop). Includes MediaStatusPoller components that poll GET /api/media/:id/status for items with pending/processing transcodeStatus.

### useMediaUpload Hook

XHR-based upload with per-file progress tracking. The uploadMediaFile function:
- Creates FormData with file, profileId, platform
- Sets x-csrf-token header via exported getCsrfToken from api-client
- Tracks upload progress via xhr.upload.onprogress
- Returns parsed MediaUploadResponse on success
- The useMediaUpload hook wraps this with React state (Map of temp IDs to progress/status)

### useMedia Hooks

- useMediaStatus: TanStack Query with refetchInterval: 3000ms, pauses when tab backgrounded
- useDeleteMedia: mutation calling DELETE /api/media/:id
- useRetryTranscode: mutation calling POST /api/media/:id/retry, invalidates media-status query
- useStorageUsage: query for GET /api/settings/storage (ready for Plan 05)

### Post Page Integration

NewPostPage and EditPostPage both manage mediaItems state, upload via handleFilesSelected, remove via handleRemoveMedia (soft-delete), reorder via handleReorderMedia, and retry via handleRetryTranscode (calls real POST /api/media/:id/retry). Submit payloads include mediaIds array. Schedule/Publish buttons disabled during transcoding with tooltip explanation. Draft save always available (D-07).

PostsPage text column shows media count indicator (Image icon + count) when post has media. Transcoding-in-progress media shows spinning Loader2 instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added mediaIds to createPostSchema and updatePostSchema**
- **Found during:** Task 2
- **Issue:** Frontend sends mediaIds array in post create/update payloads, but the Zod schemas in @sms/shared did not include this field. TypeScript build failed with "mediaIds does not exist in type".
- **Fix:** Added `mediaIds: z.array(z.string().uuid()).optional()` to both schemas in packages/shared/src/schemas/posts.ts.
- **Files modified:** packages/shared/src/schemas/posts.ts

**2. [Rule 1 - Bug] Fixed DraggableAttributes type mismatch in MediaThumbnail**
- **Found during:** Task 1 build verification
- **Issue:** DraggableAttributes from @dnd-kit/core is not assignable to Record<string, unknown> due to missing index signature.
- **Fix:** Imported DraggableAttributes and DraggableSyntheticListeners types from @dnd-kit/core and used them for dragAttributes/dragListeners props.
- **Files modified:** packages/web/src/components/posts/MediaThumbnail.tsx

**3. [Rule 1 - Bug] Fixed XHR mock in upload tests**
- **Found during:** Task 1 test verification
- **Issue:** vi.fn(() => mockXHR) is not a valid constructor for `new XMLHttpRequest()`. Vitest requires a class for constructor mocking.
- **Fix:** Used anonymous class with getter/setter proxies to mockXHR object.
- **Files modified:** packages/web/src/hooks/__tests__/use-media-upload.test.ts

**4. [Rule 1 - Bug] Fixed shadcn progress component path**
- **Found during:** Task 1
- **Issue:** shadcn CLI created progress.tsx at packages/web/@/components/ui/ instead of packages/web/src/components/ui/ due to alias resolution.
- **Fix:** Manually created the file at the correct path.
- **Files modified:** packages/web/src/components/ui/progress.tsx

## Self-Check: PASSED

- All 8 created files verified on disk
- All 7 modified files verified on disk
- Both commits verified in git log (943ae48, 56f7f2a)
- Test suite: 39/39 passing (6 test files)
- Build: web and shared packages both compile clean
- All acceptance criteria verified via automated grep checks
- No stubs found in created/modified files
