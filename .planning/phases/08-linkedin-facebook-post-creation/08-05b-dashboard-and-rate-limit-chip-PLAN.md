---
phase: 08-linkedin-facebook-post-creation
plan: 05b
type: execute
wave: 3
depends_on: [02, 03, 05a]
files_modified:
  - packages/web/src/hooks/use-rate-limit.ts
  - packages/web/src/components/profiles/RateLimitChip.tsx
  - packages/web/src/components/profiles/ProfileCard.tsx
  - packages/web/src/components/dashboard/RateLimitsCard.tsx
  - packages/web/src/pages/dashboard/DashboardPage.tsx
  - packages/web/src/components/posts/RateLimitBanner.tsx
  - packages/web/src/components/posts/RateLimitBlockError.tsx
  - packages/web/src/App.tsx
  - packages/web/src/components/layout/Sidebar.tsx
autonomous: true
requirements:
  - LIMIT-08
threats: []
must_haves:
  truths:
    - "useAllProfilesRateLimits hook exists and consumes Plan 03's GET /api/rate-limit collection endpoint"
    - "RateLimitChip on ProfileCard shows colored dot + numeric + reset-time per platform window cadence"
    - "Dashboard route /dashboard exists with RateLimitsCard listing every connected profile"
    - "RateLimitsCard color-bands every row at green/yellow/red thresholds (LIMIT-08)"
    - "RateLimitBanner and RateLimitBlockError accept a platform prop and render platform-specific copy for twitter/linkedin/facebook"
    - "Sidebar nav has a Dashboard entry routing to /dashboard"
  artifacts:
    - path: packages/web/src/hooks/use-rate-limit.ts
      provides: "useAllProfilesRateLimits + extended useRateLimit (platform-aware)"
    - path: packages/web/src/components/dashboard/RateLimitsCard.tsx
      provides: "LIMIT-08 dashboard table widget"
    - path: packages/web/src/components/profiles/RateLimitChip.tsx
      provides: "LIMIT-08 compact chip on ProfileCard"
    - path: packages/web/src/pages/dashboard/DashboardPage.tsx
      provides: "/dashboard route"
  key_links:
    - from: "packages/web/src/components/dashboard/RateLimitsCard.tsx"
      to: "GET /api/rate-limit (collection endpoint from Plan 03 Task 3)"
      via: "TanStack Query useAllProfilesRateLimits hook"
      pattern: "rate-limit"
    - from: "packages/web/src/components/profiles/ProfileCard.tsx"
      to: "RateLimitChip"
      via: "slot below TokenHealthBadge"
      pattern: "RateLimitChip"
---

<objective>
Land the LIMIT-08 dashboard widget and per-profile RateLimitChip, plus extend the existing RateLimitBanner / RateLimitBlockError components with platform-aware copy. Adds the /dashboard route and Sidebar nav entry. Depends on Plan 05a's `format-reset-time.ts` helper (already shipped) and Plan 03's `GET /api/rate-limit` collection endpoint.

Purpose: Splitting the original Plan 05 into 05a (forms + previews) + 05b (dashboard + chip) keeps each plan within ~10-15 files / 3 tasks budget per checker B-05. Plan 05b is a small, focused delivery covering only LIMIT-08 and the platform-aware extension of two existing rate-limit components.

Output: Dashboard table widget, profile chip, App.tsx route wiring, RateLimitBanner / RateLimitBlockError platform-prop extension.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-linkedin-facebook-post-creation/08-CONTEXT.md
@.planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md
@.planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md
@.planning/phases/08-linkedin-facebook-post-creation/08-UI-SPEC.md
@packages/web/src/components/profiles/ProfileCard.tsx
@packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx
@packages/web/src/components/posts/RateLimitBanner.tsx
@packages/web/src/components/posts/RateLimitBlockError.tsx
@packages/web/src/App.tsx
@packages/web/src/components/layout/Sidebar.tsx

<interfaces>
<!-- Existing types and contracts the executor must consume. -->

From Plan 02 (@sms/shared):
- rateLimitStateSchema: discriminated union — type RateLimitState
- type PlatformBudgetSnapshot

From Plan 03 (@sms/api routes):
- GET /api/rate-limit/:profileId returns RateLimitState (single)
- GET /api/rate-limit (collection — Plan 03 Task 3 W-01) returns `{ profiles: RateLimitState[] }`
- 409 codes: 'twitter_budget_exceeded' | 'linkedin_rate_limit_exceeded' | 'facebook_rate_limit_exceeded'

From Plan 05a (sibling, same wave):
- packages/web/src/lib/format-reset-time.ts — formatResetTime(iso, platform, tz, dateFormat)

Existing in packages/web (do NOT change shape, only consume):
- ProfileRateLimitIndicator color band logic + tokens (--color-success, --color-warning, --color-destructive)
- TokenHealthBadge mounted on ProfileCard
- App.tsx routes Dashboard to a placeholder component (replace with new DashboardPage)
- Sidebar already has a Dashboard placeholder nav entry (verify and ensure it points at /dashboard)
- useRateLimit hook (Twitter-only currently)
- Skeleton, Card, CardHeader, CardTitle, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow ui primitives
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend use-rate-limit hooks + create RateLimitChip + slot onto ProfileCard</name>
  <files>
    packages/web/src/hooks/use-rate-limit.ts,
    packages/web/src/components/profiles/RateLimitChip.tsx,
    packages/web/src/components/profiles/ProfileCard.tsx
  </files>
  <read_first>
    - packages/web/src/hooks/use-rate-limit.ts (existing Twitter-only hook)
    - packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx (lines 7-57 — color band logic to mirror)
    - packages/web/src/components/profiles/TokenHealthBadge.tsx (analog visual style)
    - packages/web/src/components/profiles/ProfileCard.tsx (slot location below TokenHealthBadge)
    - packages/web/src/lib/format-reset-time.ts (Plan 05a output — consume here)
  </read_first>
  <action>
1. Extend `packages/web/src/hooks/use-rate-limit.ts` to add the collection hook AND ensure the per-profile hook accepts the discriminated-union response shape:
```typescript
import { useQuery } from '@tanstack/react-query';
import type { RateLimitState } from '@sms/shared';
import { apiClient } from '../lib/api-client';

export function useRateLimit(profileId: string | null) {
  return useQuery({
    queryKey: ['rate-limit', profileId],
    queryFn: () => apiClient.get<RateLimitState>(`/api/rate-limit/${profileId}`),
    enabled: !!profileId,
    staleTime: 30_000,
  });
}

export function useAllProfilesRateLimits() {
  return useQuery({
    queryKey: ['rate-limit', 'all'],
    queryFn: () => apiClient.get<{ profiles: RateLimitState[] }>('/api/rate-limit'),
    staleTime: 30_000,
  });
}
```

2. Create `packages/web/src/components/profiles/RateLimitChip.tsx`:
```typescript
import { useRateLimit } from '../../hooks/use-rate-limit';
import { Skeleton } from '../ui/skeleton';
import { formatResetTime, type Platform } from '../../lib/format-reset-time';

interface RateLimitChipProps {
  profileId: string;
  platform: Platform;
  userTimezone?: string;
}

export function RateLimitChip({ profileId, platform, userTimezone = 'UTC' }: RateLimitChipProps) {
  const { data, isLoading, error } = useRateLimit(profileId);
  if (isLoading) return <Skeleton className="h-5 w-32 rounded-full" />;
  if (error || !data) return <span className="text-xs text-muted-foreground">Limit unavailable</span>;

  const used = data.currentCount;
  const limit = data.platform === 'twitter' ? data.budget : data.limit;
  const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
  const state = percent > 80 ? 'block' : percent >= 50 ? 'warn' : 'ok';
  const dotClass = state === 'block' ? 'bg-destructive' : state === 'warn' ? 'bg-[--color-warning]' : 'bg-[--color-success]';
  const textClass = state === 'block' ? 'text-destructive' : state === 'warn' ? 'text-[--color-warning]' : '';

  let resetCopy = '';
  if (data.platform === 'twitter') {
    resetCopy = `Resets ${new Date(data.monthStartUtc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  } else {
    const { relative } = formatResetTime(data.windowResetAt, platform, userTimezone);
    resetCopy = `Resets in ${relative}`;
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-xs mt-1"
      aria-label={`${platform}: ${used} of ${limit} used, ${resetCopy.toLowerCase()}`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${dotClass}`} />
      <span className={textClass}>{used}/{limit}</span>
      <span className="text-muted-foreground"> · {resetCopy}</span>
    </span>
  );
}
```

3. Update `packages/web/src/components/profiles/ProfileCard.tsx` — add RateLimitChip below TokenHealthBadge. Find the slot at the existing `{rateLimitIndicator && <div className="mb-4">...}` block (or directly under the TokenHealthBadge line) and insert:
```tsx
{profile.platform !== 'twitter' ? (
  <RateLimitChip profileId={profile.id} platform={profile.platform} userTimezone={user?.timezone} />
) : (
  // existing ProfileRateLimitIndicator stays for Twitter
  <ProfileRateLimitIndicator profileId={profile.id} />
)}
```
This is the smallest possible change to slot in the new component while leaving Twitter visuals untouched.
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/web build</automated>
  </verify>
  <acceptance_criteria>
    - `rg "useAllProfilesRateLimits" packages/web/src/hooks/use-rate-limit.ts` returns >= 1 match
    - `rg "RateLimitChip" packages/web/src/components/profiles/RateLimitChip.tsx` returns >= 1 match
    - `rg "RateLimitChip" packages/web/src/components/profiles/ProfileCard.tsx` returns >= 1 match
    - `pnpm --filter @sms/web build` exits 0
  </acceptance_criteria>
  <done>useAllProfilesRateLimits + RateLimitChip exist; ProfileCard slots the chip in for non-Twitter profiles below TokenHealthBadge.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build RateLimitsCard + DashboardPage; wire App.tsx route + Sidebar nav</name>
  <files>
    packages/web/src/components/dashboard/RateLimitsCard.tsx,
    packages/web/src/pages/dashboard/DashboardPage.tsx,
    packages/web/src/App.tsx,
    packages/web/src/components/layout/Sidebar.tsx
  </files>
  <read_first>
    - packages/web/src/__tests__/RateLimitsCard.test.tsx (Plan 01 stub)
    - packages/web/src/App.tsx (lines around DashboardPlaceholder)
    - packages/web/src/components/layout/Sidebar.tsx (confirm Dashboard nav entry exists or add it)
    - .planning/phases/08-linkedin-facebook-post-creation/08-UI-SPEC.md (lines 363-411 for dashboard layout)
  </read_first>
  <action>
1. Create `packages/web/src/components/dashboard/RateLimitsCard.tsx`:
```typescript
import { useAllProfilesRateLimits } from '../../hooks/use-rate-limit';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { Linkedin, Facebook, Twitter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatResetTime } from '../../lib/format-reset-time';
import type { RateLimitState } from '@sms/shared';

export function RateLimitsCard() {
  const { data, isLoading, error } = useAllProfilesRateLimits();
  const profiles = data?.profiles;

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Rate Limits</CardTitle></CardHeader>
        <CardContent>
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 mb-2" />)}
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle>Rate Limits</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Couldn't load rate limits.</p>
        </CardContent>
      </Card>
    );
  }
  if (!profiles || profiles.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Rate Limits</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-center text-muted-foreground">No connected profiles yet.</p>
          <p className="text-sm text-center mt-1">
            <Link to="/profiles" className="text-primary underline-offset-4 hover:underline">Connect a profile</Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Rate Limits</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Profile</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Resets</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((row: RateLimitState) => {
              const limit = row.platform === 'twitter' ? row.budget : row.limit;
              const percent = limit > 0 ? Math.round((row.currentCount / limit) * 100) : 0;
              const band = percent > 80 ? 'destructive' : percent >= 50 ? 'warning' : 'success';
              const barClass = band === 'destructive' ? 'bg-destructive' : band === 'warning' ? 'bg-[--color-warning]' : 'bg-[--color-success]';
              const Icon = row.platform === 'linkedin' ? Linkedin : row.platform === 'facebook' ? Facebook : Twitter;
              const reset = row.platform === 'twitter'
                ? { relative: '', absolute: new Date(row.monthStartUtc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
                : formatResetTime(row.windowResetAt, row.platform);
              return (
                <TableRow key={row.profileId}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <Icon size={14} aria-hidden="true" />
                      <span className="text-sm font-semibold">Profile {row.profileId.slice(0, 8)}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <div
                      role="progressbar"
                      aria-valuenow={percent}
                      aria-valuemax={100}
                      aria-label={`${row.platform} rate limit usage`}
                      className="h-2 rounded-full bg-secondary w-full max-w-[200px]"
                    >
                      <div className={`h-2 rounded-full ${barClass}`} style={{ width: `${Math.min(100, percent)}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground ml-2">{row.currentCount}/{limit} ({percent}%)</span>
                  </TableCell>
                  <TableCell>
                    {reset.relative && <span>{`Resets in ${reset.relative}`}</span>}
                    <span className="text-xs text-muted-foreground"> {reset.relative ? `(${reset.absolute})` : `Resets ${reset.absolute}`}</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

2. Create `packages/web/src/pages/dashboard/DashboardPage.tsx`:
```typescript
import { RateLimitsCard } from '../../components/dashboard/RateLimitsCard';

export default function DashboardPage() {
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <RateLimitsCard />
    </main>
  );
}
```

3. Update `packages/web/src/App.tsx`. Replace the existing `DashboardPlaceholder` import with a lazy import of DashboardPage:
```typescript
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
// In the route table:
<Route index element={<DashboardPage />} />  {/* or whichever path /dashboard maps to */}
```

4. Verify `packages/web/src/components/layout/Sidebar.tsx` already has a Dashboard nav entry pointing at `/dashboard`. If it does not, add one above the existing Profiles entry. If it does, leave it alone.
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/web build &amp;&amp; pnpm --filter @sms/web test RateLimitsCard -- --run</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/web/src/pages/dashboard/DashboardPage.tsx` exists and renders `<RateLimitsCard />`
    - `rg "RateLimitsCard" packages/web/src/components/dashboard/RateLimitsCard.tsx` returns >= 1 match
    - `rg "role=\"progressbar\"" packages/web/src/components/dashboard/RateLimitsCard.tsx` returns >= 1 match (LIMIT-08 a11y)
    - `rg "DashboardPage" packages/web/src/App.tsx` returns >= 1 match (route wired)
    - `rg "/dashboard" packages/web/src/components/layout/Sidebar.tsx` returns >= 1 match (nav entry exists)
    - `pnpm --filter @sms/web test RateLimitsCard -- --run` exits 0 (Plan 01 stub flips GREEN)
    - `pnpm --filter @sms/web build` exits 0
  </acceptance_criteria>
  <done>DashboardPage exists at /dashboard with RateLimitsCard; App.tsx wires the new route; Sidebar nav points to /dashboard; Plan 01 RateLimitsCard stub flips GREEN.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend RateLimitBanner + RateLimitBlockError with platform prop and platform-specific copy</name>
  <files>
    packages/web/src/components/posts/RateLimitBanner.tsx,
    packages/web/src/components/posts/RateLimitBlockError.tsx
  </files>
  <read_first>
    - packages/web/src/components/posts/RateLimitBanner.tsx (full file — Twitter-only currently)
    - packages/web/src/components/posts/RateLimitBlockError.tsx (full file — Twitter-only currently)
    - .planning/phases/08-linkedin-facebook-post-creation/08-UI-SPEC.md (lines 196-205 — platform-specific copy table)
  </read_first>
  <behavior>
    RateLimitBanner.tsx:
      - Already accepts profileId; new: also reads platform from useRateLimit data (which now returns the discriminated union)
      - Renders platform-specific banner copy at >= 90% (warn) or 100% (block):
        - twitter: "Twitter: {used} / {budget} tweets this month ({pct}%)."
        - linkedin: "LinkedIn: {used} / {limit} API calls today ({pct}%)."
        - facebook: "Facebook: {used} / {limit} API calls this hour ({pct}%)."

    RateLimitBlockError.tsx:
      - Existing prop: `error: { code: 'twitter_budget_exceeded', budget, currentCount }`
      - Extend `error` prop type to discriminated union covering all three platforms' 409 bodies (matches Plan 03 response types)
      - Switch on `error.code` to render correct copy:
        - twitter_budget_exceeded → "Twitter monthly budget reached. Posts will queue until {monthEnd}."
        - linkedin_rate_limit_exceeded → "LinkedIn daily limit reached. Posts will queue until {windowResetAt}."
        - facebook_rate_limit_exceeded → "Facebook hourly limit reached. Posts will queue until {windowResetAt}."
  </behavior>
  <action>
1. In `packages/web/src/components/posts/RateLimitBanner.tsx`, derive `platform` from the `useRateLimit` data and switch the banner copy:
```typescript
const { data } = useRateLimit(profileId);
if (!data) return null;
const limit = data.platform === 'twitter' ? data.budget : data.limit;
const used = data.currentCount;
const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
const titleByPlatform: Record<RateLimitState['platform'], string> = {
  twitter: `Twitter: ${used} / ${limit} tweets this month (${pct}%).`,
  linkedin: `LinkedIn: ${used} / ${limit} API calls today (${pct}%).`,
  facebook: `Facebook: ${used} / ${limit} API calls this hour (${pct}%).`,
};
const title = titleByPlatform[data.platform];
// existing render block uses `title` instead of the previous Twitter-only literal
```

2. In `packages/web/src/components/posts/RateLimitBlockError.tsx`, broaden the `error` prop union and switch:
```typescript
export type RateLimitBlockErrorDetail =
  | { code: 'twitter_budget_exceeded'; budget: number; currentCount: number }
  | { code: 'linkedin_rate_limit_exceeded'; limit: number; currentCount: number; windowResetAt: string }
  | { code: 'facebook_rate_limit_exceeded'; limit: number; currentCount: number; windowResetAt: string };

const blockTextByCode: Record<RateLimitBlockErrorDetail['code'], string> = {
  twitter_budget_exceeded: `Twitter monthly budget reached. Posts will queue until next month.`,
  linkedin_rate_limit_exceeded: `LinkedIn daily limit reached. Posts will queue until midnight UTC.`,
  facebook_rate_limit_exceeded: `Facebook hourly limit reached. Posts will queue until the next hour.`,
};
const message = blockTextByCode[error.code];
// (use message in the existing render shape)
```

The NewPostPage and EditPostPage refactored in Plan 05a already pass the 409 response body into the `<RateLimitBlockError>` slot — no page-side changes needed beyond what 05a already shipped.
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/web build</automated>
  </verify>
  <acceptance_criteria>
    - `rg "linkedin_rate_limit_exceeded|facebook_rate_limit_exceeded" packages/web/src/components/posts/RateLimitBlockError.tsx` returns >= 2 matches
    - `rg "Twitter:|LinkedIn:|Facebook:" packages/web/src/components/posts/RateLimitBanner.tsx` returns >= 3 matches (one per platform copy line)
    - `pnpm --filter @sms/web build` exits 0
  </acceptance_criteria>
  <done>RateLimitBanner + RateLimitBlockError accept platform-aware data and render the correct copy for all three platforms.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none Phase-8-novel for this plan) | This plan inherits from Plans 02/03; no new trust boundaries. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| (none Phase-8-novel for this plan) | — | — | — | All threats are mitigated server-side by Plans 02-04. The dashboard widget is a read-only render of authenticated data. |
</threat_model>

<verification>
This plan is complete when:
1. `pnpm --filter @sms/web test RateLimitsCard -- --run` is GREEN
2. `pnpm --filter @sms/web build` exits 0
3. Navigating to /dashboard shows the RateLimitsCard with rows per connected profile
4. ProfileCard for non-Twitter profiles renders RateLimitChip below TokenHealthBadge
5. RateLimitBanner and RateLimitBlockError both render platform-specific copy on the post pages
</verification>

<success_criteria>
- LIMIT-08 dashboard widget delivered and visually verified at green/yellow/red thresholds (manual check happens in Plan 07)
- RateLimitChip slotted onto ProfileCard for LinkedIn + Facebook
- RateLimitBanner / RateLimitBlockError extended with platform prop; all three platforms have distinct copy lines
- /dashboard route wired in App.tsx; Sidebar nav points at it
</success_criteria>

<output>
After completion, create `.planning/phases/08-linkedin-facebook-post-creation/08-05b-SUMMARY.md`
</output>
