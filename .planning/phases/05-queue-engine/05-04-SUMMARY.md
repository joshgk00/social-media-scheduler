---
phase: 05-queue-engine
plan: 04
subsystem: web
tags: [react, tanstack-query, react-hook-form, zod, queue-ui, schedule-builder, sidebar]

requires:
  - phase: 05-queue-engine
    plan: 02
    provides: "Queue CRUD REST API endpoints at /api/queues"
provides:
  - "Queue list page with filters, table, per-queue actions"
  - "Queue create/edit form with full schedule builder"
  - "TanStack Query hooks for queue CRUD operations"
  - "HourWindowGrid (6am-11pm, 18 slots, 6-column grid)"
  - "DayOfWeekSelector (7 days with aria-labels)"
  - "QueueStatusBadge (Active/Paused/Seasonal pause/Empty)"
  - "Sidebar Queues nav item and React Router queue routes"
affects: [05-05]

tech-stack:
  added: []
  patterns: [RHF + Zod resolver for queue form, Controller for array fields (daysOfWeek/hourSlots), Dialog for delete confirmation]

key-files:
  created:
    - packages/web/src/hooks/use-queues.ts
    - packages/web/src/pages/queues/QueuesPage.tsx
    - packages/web/src/pages/queues/QueueDetailPage.tsx
    - packages/web/src/components/queues/ScheduleBuilder.tsx
    - packages/web/src/components/queues/HourWindowGrid.tsx
    - packages/web/src/components/queues/DayOfWeekSelector.tsx
    - packages/web/src/components/queues/QueueStatusBadge.tsx
    - packages/web/src/components/queues/QueueActionsMenu.tsx
  modified:
    - packages/web/src/components/layout/Sidebar.tsx
    - packages/web/src/App.tsx

key-decisions:
  - "Used Dialog instead of AlertDialog for delete confirmation -- AlertDialog component not installed in shadcn, Dialog matches existing PostsPage pattern"
  - "Client-side form schema duplicates server-side createQueueSchema with coerce for number fields -- RHF needs coerce for HTML input number strings"
  - "Copy config passes data via React Router location state rather than a second API call on the new page"

patterns-established:
  - "Controller wrapper for RHF array fields (daysOfWeek, hourSlots) with custom validation error display"
  - "Seasonal window collapsible section pattern for optional complex form sections"

requirements-completed: [QUEUE-01, QUEUE-02, QUEUE-03]

duration: 5min
completed: 2026-04-13
---

# Phase 5 Plan 04: Queue UI -- List Page & Create/Edit Form Summary

**Queue list page with filterable table and per-queue actions, plus create/edit form with full schedule builder (interval, days, hours, seasonal window, recycling)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-13T10:30:19Z
- **Completed:** 2026-04-13T10:35:20Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Built TanStack Query hooks for queue CRUD: useQueues (30s polling), useQueue, useCreateQueue, useUpdateQueue, useDeleteQueue, useCopyQueueConfig
- Queue list page with network/status filter dropdowns, client-side name search, skeleton loading (5 rows), empty states per UI-SPEC copy
- QueueStatusBadge with four states: Active (green dot), Paused (amber dot), Seasonal pause (amber dot + clock), Empty (muted)
- QueueActionsMenu kebab with View Posts, Edit Queue, Copy Configuration, View Notes (disabled if empty), Delete Queue (with Dialog confirmation)
- Queue create/edit page with RHF + Zod resolver, edit mode pre-population, copy config via location state
- ScheduleBuilder component: interval type (fixed/variable) with helper text, interval value + unit, days of week, hour windows, start date, seasonal window (collapsible), recycling toggle
- HourWindowGrid: 18 checkboxes (6am-11pm) in 6-column grid with fieldset/legend, Select All / Clear All
- DayOfWeekSelector: 7 checkboxes with 3-letter visible labels and full-name aria-labels in fieldset/legend
- Sidebar updated with Queues nav item (ListOrdered icon) between Posts and New Post
- React Router routes added: /queues, /queues/new, /queues/:id/edit

## Task Commits

Each task was committed atomically:

1. **Task 1: Queue list page, hooks, sidebar, routes** - `524153e` (feat)
2. **Task 2: Queue create/edit page with schedule builder** - `4cd911c` (feat)

## Files Created/Modified

- `packages/web/src/hooks/use-queues.ts` - TanStack Query hooks for all queue CRUD operations with 30s polling
- `packages/web/src/pages/queues/QueuesPage.tsx` - Queue list with filters, table, skeleton loading, empty states
- `packages/web/src/pages/queues/QueueDetailPage.tsx` - Queue create/edit form with RHF + Zod, edit pre-population, copy config
- `packages/web/src/components/queues/ScheduleBuilder.tsx` - Interval config, days, hours, start date, seasonal window, recycling
- `packages/web/src/components/queues/HourWindowGrid.tsx` - 6-column grid of 18 hour checkboxes with accessibility
- `packages/web/src/components/queues/DayOfWeekSelector.tsx` - 7 day checkboxes with full-name aria-labels
- `packages/web/src/components/queues/QueueStatusBadge.tsx` - Active/Paused/Seasonal pause/Empty badge
- `packages/web/src/components/queues/QueueActionsMenu.tsx` - Per-queue kebab dropdown with delete confirmation
- `packages/web/src/components/layout/Sidebar.tsx` - Added Queues nav item with ListOrdered icon
- `packages/web/src/App.tsx` - Added queue page routes with lazy loading

## Decisions Made

- Used Dialog (already installed) instead of AlertDialog for delete confirmation since AlertDialog component was not installed in the shadcn setup; Dialog matches the existing PostsPage delete pattern
- Client-side form schema uses z.coerce.number() for intervalValue since HTML number inputs produce strings that need coercion
- Copy config passes schedule data via React Router location state to avoid a redundant API call on the destination page

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AlertDialog component not installed**
- **Found during:** Task 1
- **Issue:** Plan specified AlertDialog for delete confirmation but `@radix-ui/react-alert-dialog` was not in dependencies and no `alert-dialog.tsx` existed in ui components
- **Fix:** Used existing Dialog component with Button variant="destructive", matching the PostsPage delete confirmation pattern
- **Files modified:** packages/web/src/components/queues/QueueActionsMenu.tsx
- **Commit:** 524153e

## Self-Check: PASSED

- packages/web/src/hooks/use-queues.ts: FOUND
- packages/web/src/pages/queues/QueuesPage.tsx: FOUND
- packages/web/src/pages/queues/QueueDetailPage.tsx: FOUND
- packages/web/src/components/queues/ScheduleBuilder.tsx: FOUND
- packages/web/src/components/queues/HourWindowGrid.tsx: FOUND
- packages/web/src/components/queues/DayOfWeekSelector.tsx: FOUND
- packages/web/src/components/queues/QueueStatusBadge.tsx: FOUND
- packages/web/src/components/queues/QueueActionsMenu.tsx: FOUND
- packages/web/src/components/layout/Sidebar.tsx: FOUND (modified)
- packages/web/src/App.tsx: FOUND (modified)
- Commit 524153e (Task 1): FOUND
- Commit 4cd911c (Task 2): FOUND

---
*Phase: 05-queue-engine*
*Completed: 2026-04-13*
