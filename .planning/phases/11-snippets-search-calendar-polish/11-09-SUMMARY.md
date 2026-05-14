## Phase 11-09 Summary

Implemented the frontend snippets surface: hooks, picker, CRUD dialog/page, post-form integration, route wiring, and focused component tests.

### Implemented

- Added `packages/web/src/hooks/use-snippets.ts`
  - `useSnippets`
  - `useCreateSnippet`
  - `useUpdateSnippet`
  - `useDeleteSnippet`
- Added `packages/web/src/components/snippets/SnippetPicker.tsx`
  - captures textarea selection in `onPointerDown`
  - inserts snippet bodies at the caret / over the selected range
  - links to `/settings/snippets`
- Added `packages/web/src/components/snippets/SnippetFormDialog.tsx`
- Added `packages/web/src/components/snippets/__tests__/SnippetPicker.test.tsx`
- Added `packages/web/src/pages/settings/SnippetsPage.tsx`
- Added `packages/web/src/components/posts/__tests__/SharedPostFields.test.tsx`
- Updated:
  - `packages/web/src/components/posts/SharedPostFields.tsx`
  - `packages/web/src/components/posts/TwitterPostFields.tsx`
  - `packages/web/src/pages/posts/NewPostPage.tsx`
  - `packages/web/src/pages/posts/EditPostPage.tsx`
  - `packages/web/src/pages/settings/SettingsPage.tsx`
  - `packages/web/src/App.tsx`
  - `packages/web/src/lib/api-client.ts`

### Behavior Changes

- Every post form now renders an `Insert snippet` trigger through `SharedPostFields`
- Snippet insertion preserves text outside the cursor selection and restores the caret after insert
- `/settings/snippets` now supports:
  - list
  - local search
  - create
  - edit
  - delete with destructive confirmation
- The Settings area now links to the snippets page
- `apiClient` now safely handles `204 No Content` mutation responses, which the snippets delete route returns

### Verification

- `pnpm --filter @sms/web exec vitest run src/components/snippets/__tests__/SnippetPicker.test.tsx src/components/posts/__tests__/SharedPostFields.test.tsx`
- `pnpm --filter @sms/web exec tsc --noEmit`

### Test Coverage

The focused web tests cover:

- insertion at caret
- replacing a selected range
- no-snippets empty state
- picker filtering
- Escape-to-close focus return
- SharedPostFields integration with the picker callback
