## Phase 11-10 Summary

Implemented the client-side search surface for scheduled posts and queue posts, including safe `ts_headline` rendering, queue-page search UI, and queue-route search plumbing needed to serve highlighted results.

### Implemented

- Added `packages/web/src/lib/headline-to-mark.tsx`
- Added `packages/web/src/lib/__tests__/headline-to-mark.test.tsx`
- Added `packages/web/src/pages/queues/__tests__/QueuePostsPage.test.tsx`
- Updated:
  - `packages/web/src/hooks/use-posts.ts`
  - `packages/web/src/hooks/use-queue-posts.ts`
  - `packages/web/src/pages/posts/PostsPage.tsx`
  - `packages/web/src/pages/queues/QueuePostsPage.tsx`
  - `packages/api/src/services/queue.service.ts`
  - `packages/api/src/routes/queues.ts`
  - `packages/api/src/__tests__/routes/queues.test.ts`

### Behavior Changes

- `renderHeadline()` now parses server `ts_headline` output without `dangerouslySetInnerHTML`
  - `<b>...</b>` markers map to styled `<mark>` elements
  - HTML entities decode back to readable text
  - non-allowlisted HTML stays plain escaped text
- `PostsPage` now always sends `searchScope=posts`
- `PostsPage` renders highlighted `headline` output when the backend returns it
- `QueuePostsPage` now has a `Search posts...` input with 250ms debounce and URL updates via `setSearchParams(..., { replace: true })`
- `QueuePostsPage` renders highlighted `headline` output when search is active
- `GET /api/queues/:id/posts` now accepts `search` plus `searchScope=queue` and returns ranked highlight fields for queue-post search results

### Verification

- `pnpm --filter @sms/web exec vitest run src/lib/__tests__/headline-to-mark.test.tsx src/pages/queues/__tests__/QueuePostsPage.test.tsx src/pages/calendar/__tests__/CalendarPage.test.tsx src/components/snippets/__tests__/SnippetPicker.test.tsx src/components/posts/__tests__/SharedPostFields.test.tsx`
- `pnpm --filter @sms/web exec tsc --noEmit`
- `pnpm --filter @sms/api exec vitest run src/__tests__/routes/queues.test.ts`
- `pnpm --filter @sms/api exec tsc --noEmit`
- `rg -n "react-big-calendar/lib/css|dangerouslySetInnerHTML" packages/web/src -S`

### Test Coverage

The focused tests cover:

- empty, plain-text, multi-match, malformed, and XSS-safe headline parsing
- queue search input presence
- debounced queue search URL updates
- clearing queue search back to the unfiltered state
