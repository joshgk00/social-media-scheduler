---
phase: 02-authentication-user-account
plan: 02
subsystem: web-frontend-shell
tags: [react-router, tanstack-query, shadcn-ui, tailwind-v4, auth-state, csrf, zustand]
dependency_graph:
  requires: []
  provides: [react-router-config, api-client, auth-hooks, protected-routes, setup-guard, shadcn-ui-components]
  affects: [packages/web]
tech_stack:
  added: [react-router@7.14.0, "@tanstack/react-query@5.96.2", zustand@5.0.12, react-hook-form@7.72.1, "@hookform/resolvers@5.2.2", lucide-react@1.7.0, sonner@2.0.7, qrcode.react@4.2.0, tailwindcss@4.2.2, "@tailwindcss/vite@4.2.2", clsx@2.1.1, tailwind-merge@3.3.1, class-variance-authority@0.7.1, zod@3.25.76]
  patterns: [lazy-loaded-routes, csrf-token-retry, tanstack-query-auth-state, zustand-redirect-store, setup-guard-inverse-redirect]
key_files:
  created:
    - packages/web/src/lib/api-client.ts
    - packages/web/src/lib/query-client.ts
    - packages/web/src/lib/utils.ts
    - packages/web/src/hooks/use-auth.ts
    - packages/web/src/store/auth-store.ts
    - packages/web/src/components/ProtectedRoute.tsx
    - packages/web/src/components/SetupGuard.tsx
    - packages/web/src/components/PageSkeleton.tsx
    - packages/web/src/index.css
    - packages/web/components.json
    - packages/web/src/components/ui/button.tsx
    - packages/web/src/components/ui/input.tsx
    - packages/web/src/components/ui/label.tsx
    - packages/web/src/components/ui/card.tsx
    - packages/web/src/components/ui/dialog.tsx
    - packages/web/src/components/ui/select.tsx
    - packages/web/src/components/ui/separator.tsx
    - packages/web/src/components/ui/badge.tsx
    - packages/web/src/components/ui/avatar.tsx
    - packages/web/src/components/ui/alert.tsx
    - packages/web/src/components/ui/form.tsx
    - packages/web/src/components/ui/skeleton.tsx
    - packages/web/src/components/ui/sonner.tsx
    - packages/web/src/pages/login/LoginPage.tsx
    - packages/web/src/pages/setup/SetupPage.tsx
    - packages/web/src/pages/recover/RecoverPage.tsx
    - packages/web/src/pages/settings/SettingsPage.tsx
  modified:
    - packages/web/package.json
    - packages/web/index.html
    - packages/web/vite.config.ts
    - packages/web/tsconfig.app.json
    - packages/web/src/App.tsx
    - packages/web/src/main.tsx
    - pnpm-lock.yaml
decisions:
  - Removed next-themes dependency installed by shadcn -- dark-only app needs no theme switching
  - Fixed sonner component to hardcode dark theme instead of using next-themes useTheme hook
  - Extracted shared mutation logic in api-client into mutationRequest helper to reduce duplication
  - DashboardPlaceholder component serves as the root route until dashboard is built in a later phase
metrics:
  duration: 5 minutes
  completed: "2026-04-08T04:15:40Z"
---

# Phase 02 Plan 02: Frontend Shell & Auth Infrastructure Summary

React Router 7, TanStack Query, shadcn/ui dark zinc theme with 13 components, API client with CSRF token retry, and route guards (protected + setup with inverse redirect).

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Install frontend dependencies and initialize shadcn/ui with dark theme | d0d4caf | Done |
| 2 | Create API client, auth hooks, auth store, route guards, and App router | e8e8e2e | Done |

## What Was Built

### Task 1: Dependencies and shadcn/ui initialization
- Installed 14 runtime dependencies and 2 dev dependencies for the frontend
- Configured Tailwind CSS v4 with the @tailwindcss/vite plugin (CSS-based config, no tailwind.config.js)
- Initialized shadcn/ui with components.json pointing to src/ via @/ alias
- Created dark zinc theme in index.css with oklch color variables including custom --color-success
- Installed all 13 shadcn components required by UI-SPEC: button, input, label, card, dialog, select, separator, badge, avatar, alert, form, skeleton, sonner
- Added Inter font (weights 400, 600) via Google Fonts
- Set dark class on html element for dark-only mode
- Configured Vite with path alias (@/ -> src/) and /api proxy to localhost:3000

### Task 2: API client, auth hooks, route guards, and router
- Created api-client.ts with fetch wrapper handling CSRF tokens (fetched from /api/auth/csrf-token, sent as x-csrf-token header), credentials: include on all requests, and automatic retry with fresh token on 403
- Created query-client.ts with retry: false and refetchOnWindowFocus: false defaults
- Created use-auth.ts with 6 hooks: useAuth (5-min staleTime), useSetupStatus (Infinity staleTime), useLogin, useVerify2FA, useLogout, useSetup
- Created auth-store.ts with Zustand for redirectAfterLogin transient state only
- Created ProtectedRoute component that redirects unauthenticated users to /login?redirect={path}
- Created SetupGuard with inverse guard: redirects to /setup when needsSetup is true AND redirects away from /setup to /login when setup is complete
- Created PageSkeleton full-page loading spinner
- Configured React Router with lazy-loaded routes: /login, /setup, /recover, /settings, / (dashboard placeholder)
- Wired QueryClientProvider and Toaster (bottom-right, richColors, closeButton, 5s duration) in main.tsx

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed shadcn component placement**
- **Found during:** Task 1
- **Issue:** shadcn CLI created components in a literal `packages/web/@/components/ui/` directory instead of resolving the @ alias to `src/`
- **Fix:** Moved all component files from `@/components/ui/` to `src/components/ui/`
- **Commit:** d0d4caf

**2. [Rule 1 - Bug] Fixed sonner component next-themes dependency**
- **Found during:** Task 1
- **Issue:** shadcn generated sonner.tsx importing from `next-themes` and self-referencing `@/components/ui/sonner`. App is dark-only, no theme switching needed.
- **Fix:** Rewrote sonner.tsx to import directly from "sonner" package and hardcode theme="dark". Removed next-themes dependency.
- **Commit:** d0d4caf

**3. [Rule 1 - Bug] Fixed TypeScript error in api-client CSRF token return**
- **Found during:** Task 2
- **Issue:** `csrfToken` typed as `string | null` caused TS2322 when returned from `fetchCsrfToken()` which returns `Promise<string>`
- **Fix:** Assigned `data.token` to a typed local variable before assigning to module-level csrfToken
- **Commit:** e8e8e2e

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| DashboardPlaceholder | packages/web/src/App.tsx:12 | Temporary root route component; replaced when dashboard is built in a later phase |
| LoginPage stub | packages/web/src/pages/login/LoginPage.tsx | Stub for lazy import; replaced in plan 02-03 (Login Page) |
| SetupPage stub | packages/web/src/pages/setup/SetupPage.tsx | Stub for lazy import; replaced in plan 02-04 (Setup Page) |
| RecoverPage stub | packages/web/src/pages/recover/RecoverPage.tsx | Stub for lazy import; replaced in plan 02-05 (Recovery Page) |
| SettingsPage stub | packages/web/src/pages/settings/SettingsPage.tsx | Stub for lazy import; replaced in plan 02-06 (Settings Page) |

These stubs are intentional scaffolding -- each is replaced by its corresponding plan in this phase. They do not prevent this plan's goal (frontend shell infrastructure) from being achieved.

## Verification

- `pnpm --filter @sms/web build` exits 0 with clean TypeScript compilation
- All 13 shadcn components present in packages/web/src/components/ui/
- App.tsx has routes for /login, /setup, /recover, /settings, /
- API client sends x-csrf-token header on POST/PUT requests with retry on 403
- useAuth hook queries /api/auth/me with 5-minute staleTime
- SetupGuard redirects to /setup when needed and away from /setup when complete
- Toaster configured at bottom-right with 5-second duration
- Lazy-loaded routes produce separate code-split chunks in build output

## Self-Check: PASSED

- All 28 created files verified present on disk
- Both task commits (d0d4caf, e8e8e2e) verified in git history
