# Phase 6: Media Handling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 06-media-handling
**Areas discussed:** Upload experience, Video transcoding, Storage backend, Media cleanup

---

## Upload Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Drag-and-drop zone | Dedicated drop zone below text field, clickable for file picker, shows upload progress | ✓ |
| Icon button + file picker | Camera/paperclip icon in toolbar, opens native file picker | |
| Both | Drop zone + icon button | |

**User's choice:** Drag-and-drop zone
**Notes:** Recommended as it matches modern social media tools (Buffer, Hootsuite)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Thumbnail grid | Thumbnails in grid, X to remove, drag handle to reorder, progress overlay | ✓ |
| File list | Simple list with filename, size, type, status | |
| You decide | Claude picks | |

**User's choice:** Thumbnail grid
**Notes:** Matches Twitter/Facebook compose UX

---

| Option | Description | Selected |
|--------|-------------|----------|
| Client + server | Client-side instant feedback on platform limits, server validates as authority | ✓ |
| Server only | Server rejects invalid uploads | |
| You decide | Claude picks | |

**User's choice:** Client + server
**Notes:** Prevents wasted uploads of oversized files

---

| Option | Description | Selected |
|--------|-------------|----------|
| Drag to reorder | Draggable thumbnails to change order | ✓ |
| No reorder | Images stay in upload order | |
| You decide | Claude picks | |

**User's choice:** Drag to reorder
**Notes:** Important because Twitter displays images in attachment order; sortOrder column already exists in post_media

---

## Video Transcoding

| Option | Description | Selected |
|--------|-------------|----------|
| Common web formats | MP4, MOV, AVI, WEBM, MKV | ✓ |
| Anything ffmpeg supports | Accept any video container | |
| MP4 and MOV only | Strictest, phone/recorder formats only | |

**User's choice:** Common web formats (MP4, MOV, AVI, WEBM, MKV)
**Notes:** Covers phones, screen recorders, and common editor exports

---

| Option | Description | Selected |
|--------|-------------|----------|
| H.264 MP4, 720p max | All platforms accept it, fast transcode, manageable files | ✓ |
| H.264 MP4, 1080p max | Higher quality, longer transcode, larger files | |
| Platform-specific targets | Different output per platform | |
| You decide | Claude picks | |

**User's choice:** H.264 MP4, 720p max
**Notes:** Good enough for social media viewed on phones; keeps transcoding fast on Proxmox

---

| Option | Description | Selected |
|--------|-------------|----------|
| Inline progress in form | Spinner on video thumbnail, Schedule button disabled until done | ✓ |
| Toast notification only | Upload returns with toast, user checks back later | |
| You decide | Claude picks | |

**User's choice:** Inline progress in form
**Notes:** Post can be saved as draft while transcoding; status persists across page navigation

---

| Option | Description | Selected |
|--------|-------------|----------|
| Show error + allow retry | Red error state on thumbnail, failure reason, retry or remove options | ✓ |
| Auto-remove + notify | Failed video auto-removed with error toast | |
| You decide | Claude picks | |

**User's choice:** Show error + allow retry
**Notes:** Post remains in draft-able state throughout failure

---

## Storage Backend

| Option | Description | Selected |
|--------|-------------|----------|
| Interface + two implementations | StorageBackend interface, LocalStorage + S3Storage, selected via env var | ✓ |
| Single implementation with conditionals | One module with if/else per method | |
| You decide | Claude picks | |

**User's choice:** Interface + two implementations
**Notes:** Clean swap without touching business logic; existing avatar code refactored to use the interface

---

| Option | Description | Selected |
|--------|-------------|----------|
| No migration tool | Switching is fresh start, old files stay on disk | ✓ |
| Include a migration CLI | One-time script to copy between backends | |
| You decide | Claude picks | |

**User's choice:** No migration tool
**Notes:** Pragmatic for single-user tool; migration script deferred to future if ever needed

---

## Media Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Post delete + media removal from post | Soft-delete on post deletion and media removal during editing; orphans cleaned after 24h | ✓ |
| Post delete only | Only soft-delete on parent post deletion | |
| You decide | Claude picks | |

**User's choice:** Post delete + media removal from post
**Notes:** Orphaned uploads (never attached to saved post) cleaned after 24 hours

---

| Option | Description | Selected |
|--------|-------------|----------|
| Simple total + breakdown | Card: total storage, breakdown by type, file count | ✓ |
| Detailed table | Per-profile breakdown, monthly trends, largest files | |
| You decide | Claude picks | |

**User's choice:** Simple total + breakdown
**Notes:** No per-profile breakdown needed for single-user tool

---

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed weekly, Sunday 3am UTC | BullMQ repeatable job, no user configuration | ✓ |
| Configurable via settings | User sets frequency and retention period | |
| You decide | Claude picks | |

**User's choice:** Fixed weekly, Sunday 3am UTC
**Notes:** Fire-and-forget infrastructure matching Phase 5 auto-destruct philosophy

---

## Claude's Discretion

- ffmpeg command flags and encoding presets
- fluent-ffmpeg vs child_process spawn
- Drag-and-drop library choice
- Upload progress implementation
- Multer configuration details
- Media upload API endpoint structure
- S3 client library choice
- Orphan cleanup job integration
- Publish worker media gate implementation
- Avatar upload refactoring scope

## Deferred Ideas

- Media library / browser page
- Image editing (crop, rotate, filter)
- Storage migration CLI
- Per-platform video transcoding profiles
- Video thumbnail extraction (poster frame)
- Resumable uploads for large files
