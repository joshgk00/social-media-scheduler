---
plan: 04-05
phase: 04-publish-worker-scheduled-posts
status: complete
started: 2026-04-10T01:45:00Z
completed: 2026-04-10T03:15:00Z
---

# Plan 04-05 Summary: Posts Page UI Extensions + Rate Limit Settings

## Objective

Build the Phase 4 frontend per `04-UI-SPEC.md`: extend Posts page with error column, kebab actions (Retry/History/Full Text), polling indicator, and rate-limit surfacing on compose forms; add Rate Limit Settings dialog on Profiles page.

## What Was Built

### Posts Page Extensions (Task 1)
- **PostErrorCell** — renders `failureReason` in the Error column for failed posts
- **PostActionsMenu** — kebab menu with Retry Post (failed-only), View History, View Full Text actions
- **PollingIndicator** — "Updated Ns ago" counter, top-right above table, ticks every second
- **PostHistoryDialog** — modal with collapsible attempt cycles, outcome icons (CheckCircle2/XCircle/Clock/MinusCircle), ISO timestamp tooltips
- **PostFullTextDialog** — scrollable full-text modal for posts
- **Polling** — `refetchInterval: 10_000` with `refetchIntervalInBackground: false` (pauses when tab hidden)
- **PostStatusBadge** — enhanced with Loader2 spinner for `publishing` state, success tokens for `published`, warning tokens for `auto_destructing`

### Rate Limit UI (Task 2)
- **RateLimitBanner** — amber warning banner: "Approaching Twitter monthly budget" with used/total/percent, "Edit budget" link
- **RateLimitBlockError** — destructive inline error: "Twitter monthly budget reached" with reset date in local tz, "Raise budget" link
- **RateLimitSettingsDialog** — dialog with "Used X of Y (Z%)" readout, budget + threshold fields, Zod validation (1-10000 / 1-99), success toast
- **ProfileRateLimitIndicator** — green/amber/red usage indicator on each Twitter profile card
- **Sidebar** — "Admin queues" link (plain `<a>`, full page nav to Bull-Board Express route)

### Infrastructure
- Installed `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` (dev)
- Created `packages/web/src/__tests__/setup.ts` and configured `vitest.config.ts` with jsdom + `@vitejs/plugin-react`
- Added `--color-warning: oklch(0.852 0.199 91.936)` to `@theme` block (Tailwind v4)

## Key Files

### Created
- `packages/web/src/components/posts/PostHistoryDialog.tsx`
- `packages/web/src/components/posts/PostFullTextDialog.tsx`
- `packages/web/src/components/posts/PostErrorCell.tsx`
- `packages/web/src/components/posts/PollingIndicator.tsx`
- `packages/web/src/components/posts/RateLimitBanner.tsx`
- `packages/web/src/components/posts/RateLimitBlockError.tsx`
- `packages/web/src/components/profiles/RateLimitSettingsDialog.tsx`
- `packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx`
- `packages/web/src/hooks/use-post-history.ts`
- `packages/web/src/hooks/use-rate-limit.ts`
- `packages/web/src/__tests__/components/PostHistoryDialog.test.tsx`
- `packages/web/src/__tests__/components/RateLimitSettingsDialog.test.tsx`

### Modified
- `packages/web/src/pages/posts/PostsPage.tsx`
- `packages/web/src/pages/posts/NewPostPage.tsx`
- `packages/web/src/pages/posts/EditPostPage.tsx`
- `packages/web/src/pages/profiles/ProfilesPage.tsx`
- `packages/web/src/components/posts/PostActionsMenu.tsx`
- `packages/web/src/components/posts/PostStatusBadge.tsx`
- `packages/web/src/components/profiles/ProfileCard.tsx`
- `packages/web/src/components/layout/Sidebar.tsx`
- `packages/web/src/hooks/use-posts.ts`
- `packages/web/src/lib/api-client.ts`
- `packages/web/src/index.css`

## Verification

- `pnpm --filter @sms/web vitest run` — 29 tests passing, 13 todos
- `pnpm --filter @sms/web tsc --noEmit` — clean
- Puppeteer visual verification: polling indicator ticks, sidebar link present, --color-warning token applied, all components imported and wired into pages
- Human checkpoint: approved via Puppeteer-assisted UI validation

## Deviations

1. Added `noValidate` on RateLimitSettingsDialog form — HTML5 `min/max` was blocking before Zod ran
2. Admin queues uses plain `<a>` instead of NavLink — Bull-Board is an Express route, not SPA
3. Installed React testing infrastructure (was not previously present)
4. `@sms/shared` requires pre-build (`pnpm --filter @sms/shared build`) for cold test runs

## Self-Check: PASSED
