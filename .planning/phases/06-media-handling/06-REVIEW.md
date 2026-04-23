---
phase: 06-media-handling
reviewed: 2026-04-15T20:10:29Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - packages/shared/src/storage/storage-backend.ts
  - packages/shared/src/storage/local-storage.ts
  - packages/shared/src/storage/s3-storage.ts
  - packages/shared/src/storage/index.ts
  - packages/shared/src/constants/media-limits.ts
  - packages/shared/src/constants/queues.ts
  - packages/shared/src/schemas/media.ts
  - packages/shared/src/index.ts
  - packages/db/src/schema/post-media.ts
  - packages/db/src/schema/index.ts
  - packages/api/src/middleware/media-upload.ts
  - packages/api/src/routes/media.ts
  - packages/api/src/routes/settings.ts
  - packages/api/src/services/media.service.ts
  - packages/api/src/services/post.service.ts
  - packages/api/src/app.ts
  - packages/worker/src/transcode.service.ts
  - packages/worker/src/transcode-worker.ts
  - packages/worker/src/media-cleanup-worker.ts
  - packages/worker/src/post-lifecycle.service.ts
  - packages/worker/src/publish-worker.ts
  - packages/worker/src/index.ts
  - packages/web/src/components/posts/MediaDropZone.tsx
  - packages/web/src/components/posts/MediaThumbnail.tsx
  - packages/web/src/components/posts/MediaThumbnailGrid.tsx
  - packages/web/src/hooks/use-media-upload.ts
  - packages/web/src/hooks/use-media.ts
  - packages/web/src/pages/posts/NewPostPage.tsx
  - packages/web/src/pages/posts/EditPostPage.tsx
  - packages/web/src/pages/posts/PostsPage.tsx
  - packages/web/src/pages/settings/components/StorageUsageCard.tsx
  - packages/web/src/lib/api-client.ts
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-15T20:10:29Z
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

Phase 6 adds media upload, image processing, video transcoding, storage backends (local + S3), and a media cleanup pipeline. The storage abstraction is well-designed with path traversal protection on the local backend. The transcode worker handles timeouts and temp file cleanup correctly. The media cleanup scheduler is solid with proper error isolation per file.

However, there is one critical integration gap: uploaded media is never associated with posts because `associateMediaToPost` is defined but never wired into the post creation/update routes. The frontend sends `mediaIds` but the API ignores them. There is also a runtime error path where the frontend `apiClient.delete` tries to parse JSON from a 204 No Content response.

## Critical Issues

### CR-01: Uploaded media is never associated with posts

**File:** `packages/api/src/routes/posts.ts:160` / `packages/api/src/services/post.service.ts:57`
**Issue:** The frontend sends `mediaIds` in both create and update post payloads (`NewPostPage.tsx:285`, `EditPostPage.tsx:437`). The shared Zod schema (`packages/shared/src/schemas/posts.ts:13,33`) declares `mediaIds: z.array(z.string().uuid()).optional()`. However, the `createPost` and `updatePost` functions in `post.service.ts` do not accept `mediaIds` in their input interfaces and never call `associateMediaToPost`. The function `associateMediaToPost` (line 284 of `media.service.ts`) exists and is tested, but is dead code in production -- it's never imported or called from any route handler. This means:

1. All uploaded media remains orphaned (postId stays null).
2. The media cleanup worker will delete these orphans after 24 hours.
3. Published posts will never include their attached media.
4. The publish lifecycle's `media_pending` guard (`post-lifecycle.service.ts:173-189`) will never find media for any post because no media rows have a matching postId.

**Fix:** Wire `associateMediaToPost` into both `createPost` and `updatePost` flows. In `post.service.ts`, add `mediaIds` to the `CreatePostInput` and `UpdatePostInput` interfaces, and call `associateMediaToPost` inside the transaction after the post insert/update:

```typescript
// In createPost, inside the transaction, after the insert:
if (tagIds.length > 0) { /* existing tag logic */ }

const mediaIds = input.mediaIds ?? [];
if (mediaIds.length > 0) {
  const { associateMediaToPost } = await import('./media.service.js');
  await associateMediaToPost(tx, insertedPost.id, mediaIds);
}
```

Apply the same pattern to `updatePost`. The update path should also soft-delete media that was removed (media in the DB but not in the new `mediaIds` array).

## Warnings

### WR-01: apiClient.delete fails on 204 No Content responses

**File:** `packages/web/src/lib/api-client.ts:69`
**Issue:** The `mutationRequest` function unconditionally calls `return res.json()` on successful responses (line 69). The media delete endpoint (`packages/api/src/routes/media.ts:150`) returns `res.status(204).send()` with no body. Calling `.json()` on a 204 response throws a `SyntaxError: Unexpected end of JSON input`, causing the `useDeleteMedia` mutation to fire its `onError` callback even though the server-side delete succeeded.
**Fix:** Handle 204 responses before attempting JSON parse:

```typescript
if (!res.ok) {
  const body = await parseErrorBody(res);
  throw createError((body.error as string) || res.statusText, res.status, body);
}
if (res.status === 204) return undefined as T;
return res.json();
```

### WR-02: MediaStatusPoller callback is a no-op, transcode status updates never reach parent

**File:** `packages/web/src/components/posts/MediaThumbnailGrid.tsx:120-126`
**Issue:** The `handleStatusUpdate` callback is an empty function that explicitly does nothing (the comment says "Status updates are received via TanStack Query cache"). However, `MediaStatusPoller` calls `onStatusUpdate` with the latest transcode status from the server (line 98-99), and the parent components (`NewPostPage`, `EditPostPage`) maintain `mediaItems` in local `useState`. TanStack Query cache updates from the poller do NOT automatically update the parent's `mediaItems` state. This means when a video finishes transcoding (status changes from `pending`/`processing` to `completed`), the parent's `mediaItems` array still shows the old `transcodeStatus`, so:

1. The "video is still transcoding" submit blocker remains active even after transcoding completes.
2. The transcode overlay stays visible indefinitely.

**Fix:** The `handleStatusUpdate` callback should propagate the status change up to the parent, or the parent should derive media transcode status from TanStack Query cache rather than local state. The simplest fix is to have the parent provide a real status update handler:

```typescript
// In NewPostPage/EditPostPage:
function handleMediaStatusUpdate(mediaId: string, status: string, error: string | null) {
  setMediaItems((prev) =>
    prev.map((m) =>
      m.id === mediaId
        ? { ...m, transcodeStatus: status as MediaItem['transcodeStatus'], transcodeError: error }
        : m,
    ),
  );
}
```

Then pass this handler to `MediaThumbnailGrid` and wire it through to `MediaStatusPoller`.

### WR-03: Temp file not cleaned up when multer upload succeeds but validation rejects

**File:** `packages/api/src/routes/media.ts:54-91`
**Issue:** When multer writes the uploaded file to disk (temp dir) and the subsequent per-platform validation fails (e.g., wrong MIME type for the specific platform at lines 72 or 89, or file too large at lines 65 or 80), the handler returns a 400 response without deleting the temp file. The `processImageUpload` and `processVideoUpload` functions handle cleanup in their `finally` blocks, but those functions are never reached when validation fails early. Over time, rejected uploads accumulate in the OS temp directory.
**Fix:** Clean up `req.file.path` before returning the 400 response in each early-return validation branch:

```typescript
import { unlink } from 'node:fs/promises';

// In each validation failure branch, before res.status(400):
try { await unlink(file.path); } catch { /* best-effort */ }
res.status(400).json({ error: `...` });
return;
```

## Info

### IN-01: writeFileSync blocks event loop for large video files in transcode worker

**File:** `packages/worker/src/transcode-worker.ts:63`
**Issue:** `writeFileSync(inputPath, inputBuffer)` blocks the Node.js event loop while writing the entire input video buffer to disk. For large videos (up to 200MB for LinkedIn), this could block for several seconds. The worker runs at `concurrency: 1`, so no other jobs are blocked, but the BullMQ heartbeat and stalled-check mechanisms run on the same event loop and could be delayed.
**Fix:** Use `await writeFile(inputPath, inputBuffer)` from `node:fs/promises` instead:

```typescript
import { writeFile, unlink, stat } from 'node:fs/promises';
// ...
await writeFile(inputPath, inputBuffer);
```

### IN-02: S3 storage backend has no path traversal guard

**File:** `packages/shared/src/storage/s3-storage.ts`
**Issue:** Unlike `LocalStorage` which has `resolveAndGuard()` to prevent path traversal, `S3Storage` accepts any key string without validation. While S3 key semantics differ from filesystem paths (S3 treats keys as opaque strings), a key like `../../sensitive-bucket-data` would not cause traversal in S3 itself, but the `getUrl` method (line 81) would produce a malformed URL. The risk is low because keys are server-generated via `buildStorageKey`, not user-supplied. Noting for awareness.
**Fix:** Add a basic key validation to reject keys with `..` segments if desired:

```typescript
private validateKey(key: string): void {
  if (key.includes('..') || key.startsWith('/')) {
    throw new Error(`Invalid storage key: "${key}"`);
  }
}
```

### IN-03: `as const` on PLATFORM_MEDIA_LIMITS makes .includes() calls type-unsafe

**File:** `packages/shared/src/constants/media-limits.ts:39` / `packages/api/src/routes/media.ts:72`
**Issue:** `PLATFORM_MEDIA_LIMITS` is declared `as const`, making `allowedImageTypes` a readonly tuple of literal string types. The `.includes(file.mimetype)` call at `media.ts:72` works at runtime, but TypeScript's strict mode flags `string` as not assignable to the narrow union type. This is a type-level friction that might cause TS errors depending on `tsconfig` strictness. The `PlatformMediaLimits` interface uses `readonly string[]` which mitigates this, but the `as const` assertion on the object narrows past the interface. No runtime impact.
**Fix:** No action needed -- the interface type `readonly string[]` is broad enough. If TS errors surface, the interface already provides the correct type boundary.

---

_Reviewed: 2026-04-15T20:10:29Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
