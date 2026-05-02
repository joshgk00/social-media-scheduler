## Phase 11-11 Summary

Implemented the calendar UI surface with `react-big-calendar`, Luxon localizer wiring, filter controls, sidebar/route integration, and focused page tests. I also wired `/posts/new?scheduledAt=...` prefill support so empty-slot navigation lands with the chosen scheduled time populated.

### Implemented

- Added dependency pins in `packages/web/package.json`
  - `react-big-calendar@~1.19.4`
  - `@types/react-big-calendar@~1.16.3`
- Added:
  - `packages/web/src/lib/calendar-localizer.ts`
  - `packages/web/src/hooks/use-calendar-posts.ts`
  - `packages/web/src/pages/calendar/CalendarToolbar.tsx`
  - `packages/web/src/pages/calendar/CalendarFilterBar.tsx`
  - `packages/web/src/pages/calendar/CalendarPage.tsx`
  - `packages/web/src/pages/calendar/__tests__/CalendarPage.test.tsx`
- Updated:
  - `packages/web/src/components/layout/Sidebar.tsx`
  - `packages/web/src/App.tsx`
  - `packages/web/src/index.css`
  - `packages/web/src/pages/posts/NewPostPage.tsx`

### Behavior Changes

- New `/calendar` route is available from the sidebar between `Queues` and `New Post`
- Calendar renders month / week / day views through `react-big-calendar`
- Toolbar uses shadcn `Tabs` plus prev / today / next controls
- Filter bar now supports:
  - platform multi-select
  - profile multi-select
  - tag multi-select
  - scope tabs for `Scheduled`, `Queued`, and `Both`
  - search input with the same `Search posts...` pattern used elsewhere
- Calendar events are color-coded by platform through CSS theme tokens:
  - `--color-platform-twitter`
  - `--color-platform-linkedin`
  - `--color-platform-facebook`
- Conflict events get a destructive left border and tooltip copy aligned with the existing schedule-conflict wording
- Clicking an event navigates to `/posts/:id/edit`
- Clicking an empty slot navigates to `/posts/new?scheduledAt=...`
- `NewPostPage` now consumes `scheduledAt` from the query string when present and valid

### Verification

- `pnpm --filter @sms/web exec vitest run src/pages/queues/__tests__/QueuePostsPage.test.tsx src/pages/calendar/__tests__/CalendarPage.test.tsx src/lib/__tests__/headline-to-mark.test.tsx src/components/snippets/__tests__/SnippetPicker.test.tsx src/components/posts/__tests__/SharedPostFields.test.tsx`
- `pnpm --filter @sms/web exec tsc --noEmit`
- `rg -n "react-big-calendar/lib/css|dangerouslySetInnerHTML" packages/web/src -S`

### Test Coverage

The focused calendar tests cover:

- M/W/D toolbar switching and re-query behavior
- per-platform event classes
- destructive conflict styling
- click-to-edit navigation
- empty-slot navigation to new-post
- `normalizeRange()` handling month, week, and day payload shapes
