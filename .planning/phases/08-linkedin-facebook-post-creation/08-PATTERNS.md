# Phase 8: LinkedIn & Facebook Post Creation - Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 23 (new + extended)
**Analogs found:** 23 / 23 (100%)

This phase is exceptionally well-supported by existing code: every new file has a same-role + same-data-flow analog already shipping in the repo. The Twitter publish pipeline (Phase 4) and the OAuth 2.0 services (Phase 7) are the architectural template — Phase 8 plugs into the same lifecycle, the same `RateLimitBanner` shape, the same `TweetPreview` two-column layout, and the same Drizzle migration conventions.

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `packages/shared/src/schemas/posts.ts` | shared zod schema | request-response | (extends self) | self-extension |
| `packages/shared/src/schemas/rate-limit.ts` | shared zod schema | request-response | (extends self) | self-extension |
| `packages/shared/src/lib/platform-text-limits.ts` | shared utility | pure-data | `packages/shared/src/lib/error-classifier.ts` | role-match |
| `packages/shared/src/rate-limit/check-budget.ts` | shared pure calculator | pure-data | (extends self — adds `checkLinkedInBudget`, `checkFacebookBudget`) | self-extension |
| `packages/db/src/schema/social-profiles.ts` | drizzle schema | DDL | (extends self) | self-extension |
| `packages/db/drizzle/0006_phase-08-rate-limit-windows.sql` | drizzle migration | DDL | `packages/db/drizzle/0005_phase-07-oauth-token-lifecycle.sql` | exact |
| `packages/api/src/services/rate-limit.service.ts` | API service | CRUD | (extends self — `loadLinkedInUsage`, `loadFacebookUsage`) | self-extension |
| `packages/api/src/routes/posts.ts` | express route | request-response | (extends self — pre-flight branches) | self-extension |
| `packages/worker/src/linkedin-publish.service.ts` | worker platform-call service | external HTTP | `packages/worker/src/twitter-publish.service.ts` | exact |
| `packages/worker/src/facebook-publish.service.ts` | worker platform-call service | external HTTP | `packages/worker/src/twitter-publish.service.ts` | exact |
| `packages/worker/src/post-lifecycle.service.ts` | worker orchestrator | transactional | (extends self — adds `rate_limit_exhausted` abort + per-platform counter increment) | self-extension |
| `packages/worker/src/publish-worker.ts` | BullMQ worker handler | event-driven | (extends self — platform dispatch) | self-extension |
| `packages/worker/src/rate-limit.ts` | worker rate-limit wrapper | CRUD | (extends self — adds LI/FB checkers) | self-extension |
| `packages/web/src/pages/posts/NewPostPage.tsx` | React page | form | (extends self — platform branching, `ProfilePicker`) | self-extension |
| `packages/web/src/pages/posts/EditPostPage.tsx` | React page | form | (mirrors `NewPostPage.tsx`) | exact |
| `packages/web/src/pages/dashboard/DashboardPage.tsx` | React page | server-state read | `packages/web/src/pages/posts/PostsPage.tsx` | role-match |
| `packages/web/src/components/posts/LinkedInPreview.tsx` | React component | pure-render | `packages/web/src/components/posts/TweetPreview.tsx` | exact |
| `packages/web/src/components/posts/FacebookPreview.tsx` | React component | pure-render | `packages/web/src/components/posts/TweetPreview.tsx` | exact |
| `packages/web/src/components/posts/LinkedInPostFields.tsx` | React form fragment | form | `packages/web/src/components/posts/ThreadEditor.tsx` | role-match |
| `packages/web/src/components/posts/FacebookPostFields.tsx` | React form fragment | form | `packages/web/src/components/posts/ThreadEditor.tsx` | role-match |
| `packages/web/src/components/posts/TwitterPostFields.tsx` (extracted) | React form fragment | form | extracted from current `NewPostPage.tsx` | self-extension |
| `packages/web/src/components/posts/VisibilitySelector.tsx` | React form input | form | `packages/web/src/components/profiles/ProfileNetworkFilter.tsx` (radio-like control) | role-match |
| `packages/web/src/components/posts/ProfilePicker.tsx` | React form input | server-state read | shadcn `Select` + `useProfiles()` | composition |
| `packages/web/src/components/posts/RateLimitBanner.tsx` | React component | server-state read | (extends self — add `platform` prop) | self-extension |
| `packages/web/src/components/posts/RateLimitBlockError.tsx` | React component | pure-render | (extends self — add `platform` prop) | self-extension |
| `packages/web/src/components/profiles/RateLimitChip.tsx` | React component | server-state read | `packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx` | exact |
| `packages/web/src/components/dashboard/RateLimitsCard.tsx` | React component | server-state read | `packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx` + shadcn `Table` | composition |
| `packages/web/src/components/profiles/ProfileCard.tsx` | React component | composition | (extends self — slot `RateLimitChip`) | self-extension |
| `packages/web/src/components/layout/Sidebar.tsx` | React component | static nav | (extends self — `Dashboard` already in `navItems`, route now exists) | self-extension |
| `packages/web/src/App.tsx` | React router config | static config | (extends self — replace `DashboardPlaceholder` with `DashboardPage`) | self-extension |
| `packages/web/src/hooks/use-rate-limit.ts` | TanStack Query hook | server-state read | (extends self — add platform-aware variant or new `useProfileRateLimit`) | self-extension |
| `packages/web/src/components/ui/radio-group.tsx` | shadcn primitive | install | shadcn registry | install-only |

---

## Pattern Assignments

### `packages/worker/src/linkedin-publish.service.ts` (worker, external HTTP)

**Analog:** `packages/worker/src/twitter-publish.service.ts` — same `(args) => Promise<{ platformPostId }>` shape; only the API client and credential columns differ.

**Module header pattern** (lines 1–18 of analog):

```typescript
// LinkedIn publish service. Given a social_profiles row (with encrypted OAuth 2.0
// access token) plus the post text and optional media, calls the LinkedIn
// /rest/posts endpoint and returns the LinkedIn-assigned URN for persistence
// into `posts.platform_post_id`.
//
// CREDENTIAL DISCIPLINE: same as twitter-publish.service.ts — plaintext token
// stays in function scope, no caching, no logging of token-shaped values.
```

**Imports + factory shape** (analog lines 19–49):

```typescript
import { decrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { createLogger } from '@sms/shared/logger';
import type { socialProfiles } from '@sms/db';

export interface CallLinkedInArgs {
  profile: typeof socialProfiles.$inferSelect;
  postText: string;
  visibility: 'PUBLIC' | 'CONNECTIONS';
  imageUrn?: string; // pre-uploaded via 3-step flow
  correlationId: string;
}

export interface CallLinkedInResult {
  platformPostId: string;
}

export class LinkedInPublishCredentialError extends Error { /* same shape as TwitterPublishCredentialError */ }

const logger = createLogger('linkedin-publish');

export async function callLinkedIn(args: CallLinkedInArgs): Promise<CallLinkedInResult> { /* ... */ }
```

**Env-read-inside-function + decrypt pattern** (analog lines 61–112): read `ENCRYPTION_KEY` inside the function (NEVER at module scope per CLAUDE.md), validate, then `decrypt(profile.oauth2AccessTokenCiphertext, profile.oauth2AccessTokenIv, profile.oauth2AccessTokenAuthTag, encryptionKey)`. For LinkedIn the column triple is `oauth2AccessToken*` (not the Twitter `consumerKey*`/`accessToken*`/`accessTokenSecret*` quartet).

**API call pattern** (analog lines 114–132): build a fresh client per call, log only `{ profileId, correlationId, textLength }`, throw if response is missing the platform id.

**LinkedIn-specific delta:** use `node:fetch` with three required headers (`Authorization: Bearer <token>`, `LinkedIn-Version: 202604`, `X-Restli-Protocol-Version: 2.0.0`) — no SDK. Existing `linkedin.service.ts` (Phase 7) shows the header conventions: see `DEFAULT_API_VERSION = '202604'` (line 33) and the `LinkedInApiError` class (lines 47–60) — reuse the same error type via re-export from `@sms/api/services/linkedin.service` or duplicate the class shape in worker if cross-package imports are forbidden.

**3-step image upload:** if `imageUrn` is required, perform `POST /rest/images?action=initializeUpload` → `PUT` binary to returned `uploadUrl` → reference URN in `content.media.id` of the `/rest/posts` payload. This is its own helper inside `callLinkedIn`, ideally split into `linkedin-image-upload.ts` for testability.

---

### `packages/worker/src/facebook-publish.service.ts` (worker, external HTTP)

**Analog:** `packages/worker/src/twitter-publish.service.ts` — same factory shape.

**Same pattern as LinkedIn above** with these Facebook-specific deltas:

- Credential column: single OAuth 2.0 long-lived page access token in `oauth2AccessToken*` triple (Phase 7 stores the page-level token here per CONTEXT.md).
- API base: `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}` (env var). The existing `facebook.service.ts` (Phase 7) lines 5–7, 41–48 show the pattern:

```typescript
const DEFAULT_GRAPH_VERSION = 'v25.0';

function resolveGraphVersion(): string {
  const fromEnv = process.env.FACEBOOK_GRAPH_VERSION;
  if (!fromEnv) {
    logger.warn({ missingEnv: 'FACEBOOK_GRAPH_VERSION' }, 'using default Facebook Graph version');
    return DEFAULT_GRAPH_VERSION;
  }
  return fromEnv;
}
```

- Error class: reuse `FacebookApiError` from Phase 7 (`facebook.service.ts` lines 22–35) including the `code?: number` field for the Graph API error envelope.
- Sanitize-error-body discipline: copy the `TOKEN_SHAPED_SEQUENCE_RE` and `sanitizeErrorBody` helpers (Phase 7 facebook.service.ts lines 13–20).
- Multi-photo album: `POST /{page-id}/photos?published=false&source=...` per image, collect `id`s, then `POST /{page-id}/feed` with `attached_media[]=[{media_fbid: id}]`. Single video: `POST /{page-id}/videos`. Plain text: `POST /{page-id}/feed` with `message`. URL: pass `link` parameter on `/feed`.

---

### `packages/worker/src/post-lifecycle.service.ts` (worker orchestrator, transactional) — EXTEND

**Analog:** self.

**Add new abort reason** to `LifecycleAbortReason` union (current lines 41–48):

```typescript
export type LifecycleAbortReason =
  | 'version_mismatch'
  | 'already_published'
  | 'not_scheduled'
  | 'budget_exhausted'
  | 'thread_unsupported'
  | 'media_pending'
  | 'token_unhealthy'
  | 'rate_limit_exhausted'; // NEW Phase 8
```

**Generalize `callTwitter` into `callPlatform`** in `PublishContext` (current lines 67–82). The existing budget pre-flight pattern (lines 175–181) is the template for the new per-platform rate-limit pre-flight:

```typescript
// Existing pattern — copy this for the new rate_limit_exhausted check.
const budget = await ctx.checkBudget(post.profile_id);
if (budget.wouldExceed) {
  lifecycleLogger.warn('Budget exhausted at runtime — leaving post scheduled');
  throw new PostLifecycleAbort('budget_exhausted');
}
```

**Token-health pre-flight pattern** (current lines 221–236) is the template for logging a `post_attempts` row with the `errorCode` before throwing the abort:

```typescript
// EXACT template for rate_limit_exhausted abort path.
if (profile.tokenStatus !== 'active') {
  await tx.insert(postAttempts).values({
    postId: ctx.postId,
    attemptNum: ctx.currentAttemptNum,
    startedAt: attemptStart,
    finishedAt: new Date(),
    outcome: 'cancelled',
    errorCode: 'token_unhealthy',  // ← becomes 'rate_limit_exhausted' in new branch
    errorMessage: `Profile token status: ${profile.tokenStatus}`,
  });
  throw new PostLifecycleAbort('token_unhealthy');
}
```

**Phase 3 success path** (current lines 297–318) is where the per-platform window counter increment lives. Add an atomic conditional UPDATE in the same Phase-3 transaction that already inserts the success `post_attempts` row and transitions to `published`:

```typescript
// Atomic CAS-style increment with window-expiry reset.
// Mirrors Phase 7's pattern from recordFailureAttempt lines 381–390:
//   conditional UPDATE ... WHERE ... RETURNING id  (no rows = no change)
await tx
  .update(socialProfiles)
  .set({
    linkedinDailyCount: sql`
      CASE
        WHEN ${socialProfiles.linkedinWindowStartUtc} < ${windowStart}
          THEN 1
        ELSE ${socialProfiles.linkedinDailyCount} + 1
      END`,
    linkedinWindowStartUtc: sql`
      CASE
        WHEN ${socialProfiles.linkedinWindowStartUtc} < ${windowStart}
          THEN ${windowStart}
        ELSE ${socialProfiles.linkedinWindowStartUtc}
      END`,
    updatedAt: new Date(),
  })
  .where(eq(socialProfiles.id, lockedProfile.id));
```

---

### `packages/worker/src/publish-worker.ts` (BullMQ handler, event-driven) — EXTEND

**Analog:** self.

**Add platform dispatch** in `createPublishHandler` (current lines 71–110). The existing factory accepts `callTwitterImpl` (line 53) — add `callLinkedInImpl` and `callFacebookImpl`. Inside the handler, dispatch on the post row's `platform`:

```typescript
// Replace the bare `callTwitter` callback with a platform dispatcher.
callPlatform: async (profile, postText, isThread) => {
  if (profile.platform === 'linkedin') {
    return runCallLinkedIn({ profile, postText, /* ... */ });
  }
  if (profile.platform === 'facebook') {
    return runCallFacebook({ profile, postText, /* ... */ });
  }
  return runCallTwitter({ profile, postText, isThread, correlationId: job.data.correlationId });
}
```

**Add new abort reason to graceful list** (current lines 126–143):

```typescript
if (
  err.reason === 'version_mismatch' ||
  err.reason === 'budget_exhausted' ||
  err.reason === 'not_scheduled' ||
  err.reason === 'thread_unsupported' ||
  err.reason === 'media_pending' ||
  err.reason === 'token_unhealthy' ||
  err.reason === 'rate_limit_exhausted'  // NEW Phase 8 — same graceful semantics
) {
  return { skipped: true, skipReason: err.reason };
}
```

**Error classifier dispatch:** the current `classifyTwitterError(err)` call (line 146) needs to branch on platform — add `classifyLinkedInError` / `classifyFacebookError` to `@sms/shared` (extension of existing `error-classifier.ts`).

---

### `packages/worker/src/rate-limit.ts` (worker, CRUD) — EXTEND

**Analog:** self.

**Existing pattern** (lines 31–69): `loadWorkerUsage(db, profileId)` reads `monthlyTweetBudget` + counts published posts → returns snapshot → `checkTwitterBudget` projects.

**New functions follow identical shape:**

```typescript
// Mirror loadWorkerUsage exactly, but read the per-platform window columns
// and use `currentTime - windowStart` to decide if the snapshot is stale.
export async function loadLinkedInWindowUsage(
  db: WorkerDb,
  profileId: string,
): Promise<LinkedInWindowSnapshot> {
  const [profileRow] = await db
    .select({
      linkedinDailyLimit: socialProfiles.linkedinDailyLimit,
      linkedinDailyCount: socialProfiles.linkedinDailyCount,
      linkedinWindowStartUtc: socialProfiles.linkedinWindowStartUtc,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));

  if (!profileRow) throw new Error(`Profile ${profileId} not found`);

  // Window expiry check: if currentTime > windowStart + 24h, treat counter as 0.
  const dayStart = DateTime.utc().startOf('day').toJSDate();
  const isExpired = profileRow.linkedinWindowStartUtc < dayStart;
  const effectiveCount = isExpired ? 0 : profileRow.linkedinDailyCount;
  return { /* ... */ };
}

export async function checkLinkedInBudgetForWorker(db, args) { /* parallels checkBudgetForWorker line 71 */ }
export async function checkFacebookBudgetForWorker(db, args) { /* hour window instead of day */ }
```

---

### `packages/api/src/services/rate-limit.service.ts` (API CRUD) — EXTEND

**Analog:** self. New functions `loadLinkedInUsage`, `loadFacebookUsage`, `checkLinkedInBudgetWithDb`, `checkFacebookBudgetWithDb` mirror the worker variants exactly. The two files (api + worker) keep duplicated read logic on purpose — see the comment at `rate-limit.service.ts` lines 11–20 explaining the no-cross-package-import rule.

---

### `packages/api/src/routes/posts.ts` (express, request-response) — EXTEND

**Analog:** self.

**Existing pre-flight** (lines 111–157): branches on `ownedProfile.platform === 'twitter'` and runs `checkTwitterBudgetWithDb`. Phase 8 adds the LI/FB branches inside the same `if (isScheduledTweet)` block. Same 409 shape with new `code` discriminators:

```typescript
// New 409 body shapes (extend BudgetExceededBody union)
interface LinkedInRateLimitExceededBody {
  code: 'linkedin_rate_limit_exceeded';
  limit: number;
  currentCount: number;
  windowResetAt: string; // ISO
}
interface FacebookRateLimitExceededBody {
  code: 'facebook_rate_limit_exceeded';
  limit: number;
  currentCount: number;
  windowResetAt: string;
}
```

**Discriminated-union body parsing** (current line 98 uses `createPostSchema.safeParse(req.body)` which becomes the union schema in Phase 8). Type narrowing on `parsed.data.platform` after `.safeParse` flows the platform-specific fields (visibility for LI, linkUrl/video for FB) into the route logic.

---

### `packages/shared/src/schemas/posts.ts` (zod schemas) — EXTEND

**Analog:** self.

**Existing single-shape schema** (current lines 3–22) becomes the `twitterPostSchema` variant of a discriminated union:

```typescript
const baseFields = {
  profileId: z.string().uuid('Invalid profile ID'),
  status: z.enum(['draft', 'scheduled']).default('draft'),
  scheduledAt: z.string().datetime().nullable().optional(),
  hasSpinnableText: z.boolean().default(false),
  autoDestructAfter: z.string().regex(/^\d+\s+(minutes?|hours?|days?|weeks?)$/, '…').nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).default([]),
  mediaIds: z.array(z.string().uuid()).default([]),
};

export const twitterPostSchema = z.object({
  platform: z.literal('twitter'),
  text: z.string().min(1).max(25000),
  isThread: z.boolean().default(false),
  ...baseFields,
});

export const linkedinPostSchema = z.object({
  platform: z.literal('linkedin'),
  text: z.string().min(1).max(3000),
  visibility: z.enum(['PUBLIC', 'CONNECTIONS']).default('PUBLIC'),
  ...baseFields,
});

export const facebookPostSchema = z.object({
  platform: z.literal('facebook'),
  text: z.string().min(1).max(63206),
  linkUrl: z.string().url().nullable().optional(),
  ...baseFields,
});

export const createPostSchema = z.discriminatedUnion('platform', [
  twitterPostSchema,
  linkedinPostSchema,
  facebookPostSchema,
]);
```

**Refine pattern** carries forward (lines 14–22). `discriminatedUnion` does not allow `.refine()` directly — use `z.discriminatedUnion(...).superRefine(...)` or add the `scheduledAt`-when-scheduled refine inside each variant.

`updatePostSchema` follows the same union shape but each variant adds `postVersion: z.number().int().min(1)` (per existing pattern line 34).

---

### `packages/shared/src/schemas/rate-limit.ts` (zod schemas) — EXTEND

**Analog:** self.

**Existing Twitter shape** (lines 11–28): single `RateLimitState` with `monthStartUtc`. Phase 8 adds platform discriminator + per-platform reset fields:

```typescript
export const rateLimitStateSchema = z.discriminatedUnion('platform', [
  z.object({
    platform: z.literal('twitter'),
    profileId: z.string().uuid(),
    currentCount: z.number().int().nonnegative(),
    budget: z.number().int().positive(),
    warnThresholdPercent: z.number().int().min(1).max(99),
    warnThresholdHit: z.boolean(),
    blockThresholdHit: z.boolean(),
    monthStartUtc: z.string(),
  }),
  z.object({
    platform: z.literal('linkedin'),
    profileId: z.string().uuid(),
    currentCount: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    warnThresholdPercent: z.number().int().min(1).max(99),
    warnThresholdHit: z.boolean(),
    blockThresholdHit: z.boolean(),
    windowStartUtc: z.string(),
    windowResetAt: z.string(),
  }),
  z.object({
    platform: z.literal('facebook'),
    /* same shape with hourly window */
    windowStartUtc: z.string(),
    windowResetAt: z.string(),
  }),
]);
```

`.strict()` (line 16) discipline carries forward to each new variant.

---

### `packages/db/src/schema/social-profiles.ts` (drizzle schema) — EXTEND

**Analog:** self.

**Add 4 new columns** following existing snake_case convention. Insert after line 31 (`warnThresholdPercent`):

```typescript
linkedinDailyLimit: integer('linkedin_daily_limit').notNull().default(100),
linkedinDailyCount: integer('linkedin_daily_count').notNull().default(0),
linkedinWindowStartUtc: timestamp('linkedin_window_start_utc', { withTimezone: true }),
facebookHourlyLimit: integer('facebook_hourly_limit').notNull().default(200),
facebookHourlyCount: integer('facebook_hourly_count').notNull().default(0),
facebookWindowStartUtc: timestamp('facebook_window_start_utc', { withTimezone: true }),
```

(CONTEXT.md "Claude's Discretion" leaves exact names to the planner; recommended names above match the existing `monthly_tweet_budget` / `warn_threshold_percent` style.)

---

### `packages/db/drizzle/0006_phase-08-rate-limit-windows.sql` (migration) — NEW

**Analog:** `packages/db/drizzle/0005_phase-07-oauth-token-lifecycle.sql` — full file is 13 lines, every statement is `ALTER TABLE ... ADD COLUMN ... --> statement-breakpoint`.

**Exact pattern to copy:**

```sql
ALTER TABLE "social_profiles" ADD COLUMN "linkedin_daily_limit" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "linkedin_daily_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "linkedin_window_start_utc" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "facebook_hourly_limit" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "facebook_hourly_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "facebook_window_start_utc" timestamp with time zone;
```

Generate via `pnpm --filter @sms/db drizzle-kit generate` after editing the schema file — never hand-write a `meta/_journal.json` entry.

---

### `packages/web/src/components/posts/LinkedInPreview.tsx` (React, pure-render) — NEW

**Analog:** `packages/web/src/components/posts/TweetPreview.tsx` — exact pattern.

**Component shape to copy** (analog lines 1–10):

```typescript
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Card } from '../ui/card';

interface LinkedInPreviewProps {
  text: string;
  profile: { displayName: string; handle: string; avatarUrl: string } | null;
  visibility: 'PUBLIC' | 'CONNECTIONS';
  imageUrl?: string;
  scheduledAt?: string;
}
```

**Sticky pane wrapper** (analog lines 76–80):

```typescript
return (
  <div className="sticky top-6">
    <h3 className="text-sm font-semibold mb-4">Preview</h3>
    {/* Card content */}
  </div>
);
```

**Card layout** (analog lines 24–63): `<Card className="bg-card border-border rounded-xl p-4">` → flex avatar/header → `<p className="text-sm whitespace-pre-wrap break-words mt-1">` for body → conditional grid for media. The `Avatar` + `AvatarFallback` (initials uppercase, first 2 chars) is reusable as-is.

**Empty placeholder** (analog line 40): `<span className="text-muted-foreground italic">Type to see your post here…</span>`.

**LinkedIn-specific delta:** add a visibility line under the name using `text-xs text-muted-foreground` per UI-SPEC §Preview cards. Single image uses `aspect-video object-cover` (no grid).

---

### `packages/web/src/components/posts/FacebookPreview.tsx` (React, pure-render) — NEW

**Analog:** `packages/web/src/components/posts/TweetPreview.tsx` for the avatar/card scaffolding.

**Image grid logic delta:** UI-SPEC §FacebookPreview specifies a switch on image count (1, 2, 3, 4, 5–10). Current `TweetPreview` lines 42–60 shows the simple two-grid pattern; FB adds a 3-image asymmetric grid (`row-span-2` left column) and a `+N` overlay for >6 images:

```typescript
const overflowCount = images.length - 6;
{overflowCount > 0 && (
  <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm text-lg font-semibold"
       aria-label={`${overflowCount} more images not shown in preview`}>
    +{overflowCount}
  </div>
)}
```

Video placeholder uses `Play` icon from lucide-react in a `bg-secondary aspect-video` rectangle.

---

### `packages/web/src/components/profiles/RateLimitChip.tsx` (React, server-state read) — NEW

**Analog:** `packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx` — the existing Twitter chip is the exact precursor. CONTEXT.md D-13 explicitly says "the new component renders the same logic with different layout props."

**Color band logic to copy** (analog lines 7–25):

```typescript
type IndicatorState = 'ok' | 'warn' | 'block';

function resolveState(percent: number, warnThreshold: number): IndicatorState {
  if (percent >= 100) return 'block';
  if (percent >= warnThreshold) return 'warn';
  return 'ok';
}

const DOT_CLASS: Record<IndicatorState, string> = {
  ok: 'bg-[--color-success]',
  warn: 'bg-[--color-warning]',
  block: 'bg-destructive',
};

const TEXT_CLASS: Record<IndicatorState, string> = {
  ok: 'text-[--color-success]',
  warn: 'text-[--color-warning]',
  block: 'text-destructive',
};
```

**Render shape** (analog lines 43–57): inline-flex dot + text. Phase 8 chip differs only in the trailing copy: `[dot] {used}/{limit} · Resets in {relative}` per UI-SPEC §Rate-limit chip.

**Loading / error states** (analog lines 30–36): same `text-xs text-muted-foreground` skeleton lines.

UI-SPEC mandates the chip is platform-aware (Twitter monthly format, LI daily, FB hourly) — branch on platform in the trailing copy block.

---

### `packages/web/src/components/dashboard/RateLimitsCard.tsx` (React, server-state read) — NEW

**Analog:** Composition of two existing patterns:

1. Color band logic from `ProfileRateLimitIndicator.tsx` lines 7–25 (copy verbatim).
2. shadcn `Table` from existing usage (e.g. wherever profiles list is tabulated). Wrap in `<Card><CardHeader><CardTitle>Rate Limits</CardTitle></CardHeader><CardContent>...</CardContent></Card>`.

**Bar fill pattern** (UI-SPEC §Dashboard table): `<div role="progressbar" aria-valuenow={percent} aria-valuemax={100} aria-label="${platform} rate limit usage">` with a child `<div style={{ width: '${percent}%' }} className="h-2 bg-${bandColor}">`.

**Empty / loading / error states**: copy the `text-xs text-muted-foreground` style from `ProfileRateLimitIndicator.tsx` line 31.

---

### `packages/web/src/pages/dashboard/DashboardPage.tsx` (React page, server-state read) — NEW

**Analog:** `packages/web/src/pages/posts/PostsPage.tsx` for the page-shell convention.

**Page-shell pattern** (per `packages/web/CLAUDE.md`):

```typescript
export default function DashboardPage() {
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <RateLimitsCard />
    </main>
  );
}
```

The current `App.tsx` line 22–26 has a `DashboardPlaceholder` that already wraps content in `<main>` — Phase 8 replaces the placeholder import with the new page module.

---

### `packages/web/src/pages/posts/NewPostPage.tsx` (React page, form) — REFACTOR

**Analog:** self (591 lines). Existing layout pattern:

- Sticky right-pane preview (UI-SPEC D-11): `grid grid-cols-[1fr_minmax(360px,480px)] gap-8` on `lg:` breakpoints, single column below.
- React Hook Form + Zod resolver: all form state via `register` / `setValue` / `watch`.
- Save vs schedule submit: existing `SplitButton` component handles draft/schedule branching.

**Refactor approach:**

1. Add `<ProfilePicker />` at top — drives the `platform` field via `setValue('platform', selected.platform)`.
2. Extract current Twitter-only fields into `<TwitterPostFields />` (new, role-match analog: `ThreadEditor.tsx`).
3. Mount one of `<TwitterPostFields />`, `<LinkedInPostFields />`, `<FacebookPostFields />` based on `watch('platform')`.
4. Cross-platform switch handler — pure helper (`crossPlatformSwitch.ts`) returns `{ cleanedFormState, toastCopy }` and is unit-tested per UI-SPEC §Cross-Platform Switch Flow.

**Preview branch** in the right pane: `platform === 'twitter' ? <TweetPreview /> : platform === 'linkedin' ? <LinkedInPreview /> : <FacebookPreview />`.

---

### `packages/web/src/components/posts/RateLimitBanner.tsx` (React) — EXTEND

**Analog:** self. Current shape (file is only 38 lines):

```typescript
interface RateLimitBannerProps {
  profileId: string | null;
  onEditBudget: () => void;
}
```

**Extension:** add `platform` prop and branch the title/body copy (UI-SPEC §Rate-limit banner). The Twitter copy stays unchanged; LI/FB variants follow the exact wording table:

- LI warn: `LinkedIn: {used} / {limit} API calls today ({percent}%).`
- LI block: `LinkedIn daily limit reached. Posts will queue until {resetAt}.`
- FB warn: `Facebook: {used} / {limit} API calls this hour ({percent}%).`
- FB block: `Facebook hourly limit reached. Posts will queue until {resetAt}.`

`useRateLimit(profileId)` hook (line 11) returns the discriminated-union state — type-narrow on `data.platform` for the copy switch.

---

### `packages/web/src/components/profiles/ProfileCard.tsx` (React) — EXTEND

**Analog:** self.

**Slot location** (current line 141): the existing `{rateLimitIndicator && <div className="mb-4">...}` slot is exactly where the new `RateLimitChip` goes — for non-Twitter profiles, swap the legacy `ProfileRateLimitIndicator` for the platform-aware `RateLimitChip`. The line below `TokenHealthBadge` (lines 79–86) is also a valid mounting point per UI-SPEC, but the existing prop pattern is cleaner.

---

### `packages/web/src/components/layout/Sidebar.tsx` (React) — EXTEND

**Analog:** self.

`navItems` array (lines 21–29) already contains a `Dashboard` entry pointing at `/`. Phase 8 only needs the `App.tsx` route to start rendering the real `DashboardPage` (currently `DashboardPlaceholder`). No sidebar changes strictly required — the entry exists.

---

### `packages/web/src/App.tsx` (router config) — EXTEND

**Analog:** self.

**Replace `DashboardPlaceholder`** (current lines 22–26) with a lazy import:

```typescript
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
// route: <Route index element={<DashboardPage />} />
```

The `index` route at line 47 already targets `/`. Replace `<DashboardPlaceholder />` with `<DashboardPage />`.

---

### `packages/web/src/components/posts/VisibilitySelector.tsx` (React, form input) — NEW

**Analog:** Composition — wrap the new shadcn `radio-group` primitive with two card-like rows. Reference for shadcn-component composition: `packages/web/src/components/profiles/ProfileNetworkFilter.tsx`.

**Pattern:**

```typescript
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';

export function VisibilitySelector({ value, onValueChange }: { value: 'PUBLIC' | 'CONNECTIONS'; onValueChange: (v: 'PUBLIC' | 'CONNECTIONS') => void }) {
  return (
    <RadioGroup value={value} onValueChange={onValueChange} aria-labelledby="visibility-heading" className="gap-2">
      <div className="flex items-start gap-3 rounded-md border p-3 hover:bg-secondary/50">
        <RadioGroupItem value="PUBLIC" id="vis-public" />
        <div>
          <Label htmlFor="vis-public" className="text-sm font-semibold">Anyone on LinkedIn</Label>
          <p className="text-xs text-muted-foreground">Visible to anyone, including non-members.</p>
        </div>
      </div>
      {/* second option mirrors */}
    </RadioGroup>
  );
}
```

---

## Shared Patterns

### Encryption / decryption

**Source:** `@sms/shared/encryption` (re-exported `decrypt`, `validateEncryptionKey`)
**Apply to:** `linkedin-publish.service.ts`, `facebook-publish.service.ts`

```typescript
const rawKey = process.env.ENCRYPTION_KEY;
if (!rawKey) throw new <Platform>PublishCredentialError('ENCRYPTION_KEY env var is not set');
const encryptionKey = validateEncryptionKey(rawKey);

if (!profile.oauth2AccessTokenCiphertext || !profile.oauth2AccessTokenIv || !profile.oauth2AccessTokenAuthTag) {
  throw new <Platform>PublishCredentialError(
    `Profile ${profile.id} is missing one or more encrypted OAuth 2.0 token fields`,
  );
}

const accessToken = decrypt(
  profile.oauth2AccessTokenCiphertext,
  profile.oauth2AccessTokenIv,
  profile.oauth2AccessTokenAuthTag,
  encryptionKey,
);
```

Source pattern: `twitter-publish.service.ts` lines 61–112.

### Logger child + correlation ID

**Source:** `@sms/shared/logger` `createLogger(name).child({ correlationId, postId, ... })`
**Apply to:** all worker services and route handlers

```typescript
const lifecycleLogger = logger.child({
  postId: ctx.postId,
  correlationId: ctx.correlationId,
  attempt: ctx.currentAttemptNum,
});
```

Source pattern: `post-lifecycle.service.ts` lines 105–109.

### `post_attempts` row on graceful abort

**Source:** `post-lifecycle.service.ts` lines 222–230 (token-health abort)
**Apply to:** new `rate_limit_exhausted` abort branch

Always insert the row INSIDE the same transaction that sees the violation, BEFORE throwing the `PostLifecycleAbort`. The row's `outcome: 'cancelled'` plus `errorCode` is what the SCHED-04 history modal renders.

### Conditional UPDATE with `RETURNING` for idempotency

**Source:** `post-lifecycle.service.ts` lines 381–390 (the 401 → `needs_reauth` flip)
**Apply to:** per-platform window-counter atomic increment in Phase 3 success path

```typescript
const profileUpdate = await tx
  .update(socialProfiles)
  .set({ /* counter increment with CASE-WHEN window-expiry reset */ })
  .where(eq(socialProfiles.id, args.profileId))
  .returning({ id: socialProfiles.id });
```

The `.returning({ id })` is what makes the UPDATE detectable as a no-op — if `length === 0`, the row didn't change (race lost), and the caller can decide whether to retry or accept.

### 409 response shape with `code` discriminator

**Source:** `routes/posts.ts` lines 47–51
**Apply to:** new LI/FB rate-limit-exceeded responses

```typescript
interface BudgetExceededBody {
  code: 'twitter_budget_exceeded';   // ← new discriminators: 'linkedin_rate_limit_exceeded', 'facebook_rate_limit_exceeded'
  budget: number;                    // ← becomes 'limit' for LI/FB
  currentCount: number;
}
```

The frontend's `RateLimitBlockError` component branches on `code` to render the platform-specific copy.

### TanStack Query hook shape

**Source:** `packages/web/src/hooks/use-rate-limit.ts` lines 5–12
**Apply to:** any new hook (e.g. `useAllProfilesRateLimits` for the dashboard card)

```typescript
return useQuery({
  queryKey: ['rate-limit', profileId],
  queryFn: () => apiClient.getRateLimit<RateLimitState>(profileId!),
  enabled: !!profileId,
  staleTime: 30_000,
});
```

### Drizzle migration filename + statement-breakpoint convention

**Source:** `packages/db/drizzle/0005_phase-07-oauth-token-lifecycle.sql`
**Apply to:** `0006_phase-08-rate-limit-windows.sql`

- Filename: `{4-digit-zero-padded}_phase-{phase-padded}-{kebab-summary}.sql`.
- Every statement (including the last) suffixed with `--> statement-breakpoint`.
- Generated via `drizzle-kit generate` — DO NOT hand-edit `meta/_journal.json`.
- `NULLS NOT DISTINCT` on multi-column unique constraints (Phase 7 §0005 line 14) — N/A for Phase 8 (no new uniques) but the convention applies if any are added.

### Worker test mock pattern

**Source:** `packages/worker/src/__tests__/twitter-401-detection.test.ts` lines 22–69
**Apply to:** new `linkedin-publish.test.ts`, `facebook-publish.test.ts`, lifecycle tests for `rate_limit_exhausted`

- `createMockWorkerDb()` from `__tests__/helpers/mock-db.ts`
- `seedLockedPost(...)`, `seedSocialProfile(...)` from `__tests__/helpers/seed-post.ts`
- `vi.fn().mockResolvedValue(...)` on `callTwitter` / `checkBudget` for ctx-injection
- UUID literals (lines 47–49) — required for any payload that round-trips a Zod `.uuid()` schema.

---

## No Analog Found

None. Every Phase 8 file maps onto a same-role + same-data-flow analog already in the repo. The strongest matches:

- Twitter publish service → LinkedIn/Facebook publish services (line-for-line mappable)
- Migration 0005 → Migration 0006 (identical SQL pattern)
- TweetPreview → LinkedIn/Facebook previews (Card + Avatar + sticky-pane unchanged)
- ProfileRateLimitIndicator → RateLimitChip (color-band logic copied verbatim)

The only "new" component is the LinkedIn 3-step image upload flow — but that lives inside `linkedin-publish.service.ts` as a private helper, not as its own file.

---

## Metadata

**Analog search scope:**
- `packages/api/src/{routes,services}/`
- `packages/worker/src/`
- `packages/shared/src/{schemas,lib,rate-limit}/`
- `packages/db/{src/schema/,drizzle/}`
- `packages/web/src/{pages,components,hooks}/`

**Files scanned:** ~80 source files across 5 packages
**Pattern extraction date:** 2026-04-26
