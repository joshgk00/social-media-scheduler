---
phase: 05-queue-engine
plan: 05
subsystem: web
tags: [react, tanstack-query, queue-posts, spinnable-text, optimistic-ui, queue-mode-form]

requires:
  - phase: 05-queue-engine
    plan: 02
    provides: "Queue CRUD API, queue posts management API endpoints"
  - phase: 05-queue-engine
    plan: 01
    provides: "Spinnable text functions (resolveSpinnableText, countTotalVariants)"
provides:
  - "Queue posts list page with reorder controls, cursor indicator, and per-post actions"
  - "Spinnable variants dialog with 5 random resolutions and regenerate"
  - "Queue post creation flow via adapted NewPostPage with 'Save to Queue' button"
  - "Extended PostStatusBadge for auto_destructing and destroyed states"
  - "useQueuePosts hooks with optimistic reorder mutations"
  - "useQueues/useQueue hooks for queue data fetching"
  - "Sidebar navigation with Queues item"
affects: []

tech-stack:
  added: []
  patterns: [optimistic query cache update for reorder, queue mode via URL search params, client-side spinnable text resolution for preview]

key-files:
  created:
    - packages/web/src/hooks/use-queue-posts.ts
    - packages/web/src/hooks/use-queues.ts
    - packages/web/src/pages/queues/QueuePostsPage.tsx
    - packages/web/src/components/queues/SpinnableVariantsDialog.tsx
    - packages/web/src/components/queues/QueuePostActionsMenu.tsx
    - packages/web/src/components/queues/QueueStatusBadge.tsx
  modified:
    - packages/web/src/components/posts/PostStatusBadge.tsx
    - packages/web/src/pages/posts/NewPostPage.tsx
    - packages/web/src/App.tsx
    - packages/web/src/components/layout/Sidebar.tsx

key-decisions:
  - "Used Dialog component for delete confirmation instead of AlertDialog (AlertDialog not installed despite UI-SPEC listing it; Dialog achieves same UX)"
  - "Created use-queues.ts hook alongside use-queue-posts.ts since it was missing from the codebase (likely created in parallel plan 03/04 worktree)"
  - "Created QueueStatusBadge component as dependency for QueuePostsPage header (normally from plan 03/04)"
  - "Queue mode in NewPostPage uses URL search params (?queueId=xxx) rather than route params for clean separation"

patterns-established:
  - "Optimistic reorder: cancel queries, swap positions in cache, revert on error with toast"
  - "Queue mode form: conditional UI via URL search params, two-step create (POST /posts then POST /queues/:id/posts)"
  - "Spinnable variants preview: client-side resolution via shared lib functions"

requirements-completed: [QUEUE-04, QUEUE-05, WORKER-09]

duration: 5min
completed: 2026-04-13
---

# Phase 5 Plan 05: Queue Posts UI, Spinnable Variants, and Queue Post Creation Summary

**Queue posts page with optimistic reorder, cursor indicator, spinnable variants dialog, and adapted post creation form with "Save to Queue" flow**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-13T10:31:17Z
- **Completed:** 2026-04-13T10:36:31Z
- **Tasks:** 1 auto + 1 checkpoint (human-verify)
- **Files modified:** 10

## Accomplishments

- Built useQueuePosts hook with 10s polling (pauses when hidden), optimistic reorder mutations (useMovePostUp/useMovePostDown swap positions in cache, revert on error with toast), useRemoveFromQueue, and useAddToQueue
- Built QueuePostsPage with full table: position column with "Next" cursor indicator (border-l-2 border-primary + aria-label), inline reorder buttons (disabled at boundaries and for non-queued posts), text preview, PostStatusBadge, spin indicator badge, auto-destruct duration, and per-post kebab actions menu
- Built SpinnableVariantsDialog showing total variant count, 5 randomly resolved examples in Card components, regenerate button, and fallback for posts without spin syntax
- Built QueuePostActionsMenu with Edit Post, View Full Text, View Variants (conditional on hasSpinnableText), View History, Move Up/Down (with aria-labels), and Delete Post (with confirmation dialog)
- Extended PostStatusBadge: auto_destructing now uses destructive tint with "Auto-destructing" label, destroyed uses success/muted tint with "Destroyed" label (green because destruction is the intended outcome)
- Adapted NewPostPage for queue mode: reads queueId from URL search params, hides profile selector (pre-fills from queue), hides schedule picker, hides SplitButton, shows single "Save to Queue" button, two-step submit (create post then add to queue), navigates to queue posts page on success
- Added "Queues" nav item to Sidebar between Posts and New Post with ListOrdered icon
- Added /queues/:id/posts route to App.tsx router

## Task Commits

1. **Task 1: Queue posts page, spinnable variants, queue post form, status badges** - `4851794` (feat)
2. **Task 2: Human verification checkpoint** - Not committed (checkpoint awaiting human verification)

## Files Created/Modified

- `packages/web/src/hooks/use-queue-posts.ts` - useQueuePosts, useMovePostUp, useMovePostDown, useRemoveFromQueue, useAddToQueue with optimistic updates
- `packages/web/src/hooks/use-queues.ts` - useQueues (list) and useQueue (detail) hooks for queue data
- `packages/web/src/pages/queues/QueuePostsPage.tsx` - Queue posts list with reorder, cursor indicator, empty/loading/error states
- `packages/web/src/components/queues/SpinnableVariantsDialog.tsx` - Dialog with 5 random resolutions, regenerate, no-spin fallback
- `packages/web/src/components/queues/QueuePostActionsMenu.tsx` - Per-post kebab with edit, view, reorder, delete actions
- `packages/web/src/components/queues/QueueStatusBadge.tsx` - Active/Paused/Seasonal/Empty badge component
- `packages/web/src/components/posts/PostStatusBadge.tsx` - Updated auto_destructing and destroyed badge styles
- `packages/web/src/pages/posts/NewPostPage.tsx` - Queue mode: hidden scheduling, "Save to Queue" button
- `packages/web/src/App.tsx` - Added QueuePostsPage route
- `packages/web/src/components/layout/Sidebar.tsx` - Added Queues nav item with ListOrdered icon

## Decisions Made

- Used Dialog for delete confirmation instead of AlertDialog (not installed; Dialog achieves same UX pattern as PostsPage)
- Created use-queues.ts as a dependency (missing from this worktree, likely created in parallel plan 03/04)
- Created QueueStatusBadge as needed dependency for page header
- Queue mode uses URL search params (?queueId=xxx) for clean separation from standard post creation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created use-queues.ts hook**
- **Found during:** Task 1
- **Issue:** Plan references useQueue(id) but the hook file didn't exist in this worktree (likely created in parallel plan 03/04)
- **Fix:** Created minimal use-queues.ts with useQueues and useQueue hooks
- **Files created:** packages/web/src/hooks/use-queues.ts
- **Commit:** 4851794

**2. [Rule 3 - Blocking] Created QueueStatusBadge component**
- **Found during:** Task 1
- **Issue:** QueuePostsPage header requires QueueStatusBadge which doesn't exist yet (plan 03/04 dependency)
- **Fix:** Created QueueStatusBadge with Active/Paused/Seasonal/Empty states matching UI-SPEC
- **Files created:** packages/web/src/components/queues/QueueStatusBadge.tsx
- **Commit:** 4851794

**3. [Rule 3 - Blocking] Used Dialog instead of AlertDialog for delete confirmation**
- **Found during:** Task 1
- **Issue:** AlertDialog component not installed despite UI-SPEC listing it as available
- **Fix:** Used existing Dialog component (same pattern as PostsPage delete confirmation)
- **Files modified:** packages/web/src/components/queues/QueuePostActionsMenu.tsx
- **Commit:** 4851794

## Checkpoint: Human Verification

**Task 2** is a `checkpoint:human-verify` gate. All automated implementation is complete. The checkpoint requires human verification of the complete queue engine UI flow:

1. Navigate to the app in the browser
2. Verify "Queues" appears in the sidebar between "Posts" and "New Post" with the ListOrdered icon
3. Navigate to a queue's posts page -- verify empty state with "Add Post" button
4. Click "Add Post" -- verify the post form hides scheduling fields and shows "Save to Queue"
5. Verify reorder buttons (up/down) appear and are properly disabled at boundaries
6. If any post has spinnable text, verify "View Variants" dialog shows resolved variants
7. Verify PostStatusBadge renders auto_destructing and destroyed states correctly

## Self-Check: PASSED

- packages/web/src/hooks/use-queue-posts.ts: FOUND
- packages/web/src/hooks/use-queues.ts: FOUND
- packages/web/src/pages/queues/QueuePostsPage.tsx: FOUND
- packages/web/src/components/queues/SpinnableVariantsDialog.tsx: FOUND
- packages/web/src/components/queues/QueuePostActionsMenu.tsx: FOUND
- packages/web/src/components/queues/QueueStatusBadge.tsx: FOUND
- packages/web/src/components/posts/PostStatusBadge.tsx: FOUND (modified)
- packages/web/src/pages/posts/NewPostPage.tsx: FOUND (modified)
- packages/web/src/App.tsx: FOUND (modified)
- packages/web/src/components/layout/Sidebar.tsx: FOUND (modified)
- Commit 4851794 (Task 1): FOUND

---
*Phase: 05-queue-engine*
*Completed: 2026-04-13*
