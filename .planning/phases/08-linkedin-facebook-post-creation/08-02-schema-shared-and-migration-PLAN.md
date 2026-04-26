---
phase: 08-linkedin-facebook-post-creation
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - packages/db/src/schema/social-profiles.ts
  - packages/db/src/schema/posts.ts
  - packages/db/drizzle/0006_phase-08-rate-limit-windows.sql
  - packages/db/drizzle/meta/_journal.json
  - packages/db/drizzle/meta/0006_snapshot.json
  - packages/shared/src/lib/platform-text-limits.ts
  - packages/shared/src/lib/index.ts
  - packages/shared/src/schemas/posts.ts
  - packages/shared/src/schemas/rate-limit.ts
  - packages/shared/src/rate-limit/check-budget.ts
  - packages/shared/src/index.ts
autonomous: true
requirements:
  - POST-LI-01
  - POST-LI-02
  - POST-LI-03
  - POST-LI-04
  - POST-FB-01
  - POST-FB-02
  - POST-FB-03
  - POST-FB-04
  - POST-FB-05
  - LIMIT-06
  - LIMIT-07
threats:
  - T-API-01
  - T-API-03
  - T-DATA-01
  - T-LIMITS-01
must_haves:
  truths:
    - "Drizzle schema declares 7 new social_profiles columns (6 rate-limit + linkedin_account_type) and 3 new posts columns (platform, visibility, link_url)"
    - "Migration 0006 applied to live DB; new columns visible in information_schema"
    - "posts.visibility (varchar(16) nullable) and posts.link_url (text nullable) land alongside posts.platform"
    - "social_profiles.linkedin_account_type defaults to 'person' NOT NULL — covers Pitfall 9 person/organization URN dispatch"
    - "createPostSchema is a strict discriminatedUnion('platform', [...]) rejecting cross-platform fields"
    - "PLATFORM_TEXT_LIMITS exported with twitter=25000, linkedin=3000, facebook=63206"
    - "checkLinkedInBudget and checkFacebookBudget pure calculators exported from @sms/shared"
    - "rateLimitStateSchema becomes a discriminated union over platform"
  artifacts:
    - path: packages/db/drizzle/0006_phase-08-rate-limit-windows.sql
      provides: "Migration adding linkedin_daily_count + window + facebook_hourly + linkedin_account_type + posts.platform/visibility/link_url columns"
      contains: "ALTER TABLE \"social_profiles\" ADD COLUMN \"linkedin_daily_count\""
    - path: packages/db/src/schema/social-profiles.ts
      provides: "Drizzle table definition with 6 new rate-limit columns + linkedin_account_type column"
    - path: packages/db/src/schema/posts.ts
      provides: "platform column (default 'twitter' NOT NULL), visibility column (varchar(16) nullable), link_url column (text nullable)"
    - path: packages/shared/src/lib/platform-text-limits.ts
      provides: "countCodePoints + PLATFORM_TEXT_LIMITS"
    - path: packages/shared/src/schemas/posts.ts
      provides: "createPostSchema as discriminatedUnion of twitter/linkedin/facebook variants"
    - path: packages/shared/src/schemas/rate-limit.ts
      provides: "rateLimitStateSchema as platform-discriminated union"
    - path: packages/shared/src/rate-limit/check-budget.ts
      provides: "checkLinkedInBudget + checkFacebookBudget pure calculators"
  key_links:
    - from: "packages/shared/src/index.ts"
      to: "packages/shared/src/lib/platform-text-limits.ts"
      via: "barrel export"
      pattern: "export .* platform-text-limits"
    - from: "packages/db/drizzle/meta/_journal.json"
      to: "0006_phase-08-rate-limit-windows.sql"
      via: "drizzle-kit generate journal entry"
      pattern: "0006_phase-08-rate-limit-windows"
---

<objective>
Land the data + type foundations for Phase 8: extend the Drizzle schema with platform-discriminated rate-limit columns AND the platform-specific posts columns (visibility, link_url, linkedin_account_type), generate and APPLY the migration, refactor the shared posts schema into a strict discriminated union, and ship the pure platform-text-limit and per-platform budget calculator helpers. After this plan, the test stubs from Plan 01 covering shared-package and schema concerns flip from RED to GREEN, and Plans 03/04 can persist `visibility` / `linkUrl` without `as` casts.

Purpose: Every downstream wave (API, worker, web) imports from @sms/shared and reads from the new social_profiles + posts columns. Without this foundation, nothing in waves 2-3 can compile and Plan 03 Task 2 cannot insert platform-specific fields.

Output: 7 new columns on social_profiles (6 rate-limit + linkedin_account_type) + 3 new columns on posts (platform, visibility, link_url) (live DB); discriminated-union createPostSchema; code-point-aware platform-text-limits utility; per-platform budget calculators in @sms/shared.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-linkedin-facebook-post-creation/08-CONTEXT.md
@.planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md
@.planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md
@packages/db/drizzle/0005_phase-07-oauth-token-lifecycle.sql
@packages/db/src/schema/social-profiles.ts
@packages/shared/src/schemas/posts.ts
@packages/shared/src/schemas/rate-limit.ts

<interfaces>
<!-- Existing types and exports the executor must extend. -->

From packages/db/src/schema/social-profiles.ts (current shape, append new columns after warnThresholdPercent):
- existing: monthlyTweetBudget integer, warnThresholdPercent integer, oauth2AccessTokenCiphertext bytea, tokenStatus enum, platformAccountId text, etc.

From packages/shared/src/schemas/posts.ts (current single-shape):
- createPostSchema: z.object({...twitter shape...}) — refactored to discriminatedUnion in this plan

From packages/shared/src/rate-limit/check-budget.ts (existing pure calculator):
- checkTwitterBudget(snapshot, additional) → BudgetCheckResult
- New exports: checkLinkedInBudget(snapshot, additional), checkFacebookBudget(snapshot, additional)

From packages/shared/src/schemas/rate-limit.ts (existing twitter shape):
- rateLimitStateSchema: z.object({platform: 'twitter', monthStartUtc, ...}).strict()
- New variants: linkedin (windowStartUtc, windowResetAt, daily limit), facebook (windowStartUtc, windowResetAt, hourly limit)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add platform-text-limits helper + extend shared schemas (discriminated union, rate-limit)</name>
  <files>
    packages/shared/src/lib/platform-text-limits.ts,
    packages/shared/src/lib/index.ts,
    packages/shared/src/schemas/posts.ts,
    packages/shared/src/schemas/rate-limit.ts,
    packages/shared/src/rate-limit/check-budget.ts,
    packages/shared/src/index.ts
  </files>
  <read_first>
    - packages/shared/src/schemas/posts.ts (current single-shape schema being upgraded)
    - packages/shared/src/schemas/rate-limit.ts (current Twitter shape)
    - packages/shared/src/rate-limit/check-budget.ts (existing checkTwitterBudget — pure calculator pattern)
    - packages/shared/src/index.ts (barrel exports)
    - packages/shared/src/__tests__/platform-text-limits.test.ts (Plan 01 RED test driving Test 1)
    - packages/shared/src/__tests__/posts-discriminated-union.test.ts (Plan 01 RED test)
    - .planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md (Pattern 1, Pitfall 4)
    - .planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md (lines 317-407 for discriminated union shape)
  </read_first>
  <action>
1. Create `packages/shared/src/lib/platform-text-limits.ts`:
```typescript
/**
 * Platform-specific text length limits and code-point-aware counter.
 *
 * NOTE: LinkedIn and Facebook count by Unicode code points, not by JavaScript
 * UTF-16 code units (which would split astral-plane emoji incorrectly).
 * Twitter uses weighted counting via the twitter-text library — that is NOT
 * handled here; consumers route Twitter through twitter-text.parseTweet directly.
 */

export const PLATFORM_TEXT_LIMITS = {
  twitter: 25_000,   // thread-aware combined max; per-tweet 280 enforced via twitter-text
  linkedin: 3_000,   // POST-LI-04
  facebook: 63_206,  // POST-FB-05
} as const;

export type PlatformTextLimitKey = keyof typeof PLATFORM_TEXT_LIMITS;

/**
 * Counts Unicode code points using the spread iterator (handles astral-plane
 * emoji correctly: `[...'👨‍👩‍👧'].length === 5` (3 people + 2 ZWJ)).
 *
 * Use for LinkedIn and Facebook char counts. Do NOT use for Twitter — Twitter
 * counts URLs as 23 chars regardless of length and applies grapheme-cluster
 * weighting; route Twitter through `twitter-text` instead.
 */
export function countCodePoints(text: string): number {
  return [...text].length;
}

export function isWithinPlatformLimit(text: string, platform: PlatformTextLimitKey): boolean {
  return countCodePoints(text) <= PLATFORM_TEXT_LIMITS[platform];
}
```

2. Create `packages/shared/src/lib/index.ts` (or extend if exists):
```typescript
export * from './platform-text-limits.js';
// (re-export any existing lib exports)
```

3. Refactor `packages/shared/src/schemas/posts.ts` to a discriminated union. The existing single-shape schema becomes the `twitterPostSchema` variant. Each variant uses `.strict()` so cross-platform extras are rejected (T-API-03):
```typescript
import { z } from 'zod';
import { PLATFORM_TEXT_LIMITS } from '../lib/platform-text-limits.js';

const baseFields = {
  profileId: z.string().uuid('Invalid profile ID'),
  status: z.enum(['draft', 'scheduled']).default('draft'),
  scheduledAt: z.string().datetime().nullable().optional(),
  hasSpinnableText: z.boolean().default(false),
  autoDestructAfter: z.string()
    .regex(/^\d+\s+(minutes?|hours?|days?|weeks?|months?|years?)$/, 'Must be a duration like "30 minutes", "24 hours", or "7 days"')
    .max(50)
    .nullable()
    .optional(),
  notes: z.string().max(10_000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).default([]),
  mediaIds: z.array(z.string().uuid()).default([]),
};

const twitterPostSchema = z.object({
  platform: z.literal('twitter'),
  text: z.string().min(1).max(PLATFORM_TEXT_LIMITS.twitter),
  isThread: z.boolean().default(false),
  ...baseFields,
}).strict();

const linkedinPostSchema = z.object({
  platform: z.literal('linkedin'),
  text: z.string().max(PLATFORM_TEXT_LIMITS.linkedin)
    .refine((t) => [...t].length <= PLATFORM_TEXT_LIMITS.linkedin, { message: 'LinkedIn share text exceeds 3000 code points' }),
  visibility: z.enum(['PUBLIC', 'CONNECTIONS']).default('PUBLIC'),
  ...baseFields,
}).strict()
  .refine((d) => d.text.length > 0 || d.mediaIds.length > 0, {
    message: 'LinkedIn share requires text or an image',
    path: ['text'],
  });

const facebookPostSchema = z.object({
  platform: z.literal('facebook'),
  text: z.string().max(PLATFORM_TEXT_LIMITS.facebook)
    .refine((t) => [...t].length <= PLATFORM_TEXT_LIMITS.facebook, { message: 'Facebook post text exceeds 63206 code points' }),
  linkUrl: z.string().url().nullable().optional(),
  ...baseFields,
}).strict()
  .refine((d) => d.text.length > 0 || d.mediaIds.length > 0 || !!d.linkUrl, {
    message: 'Facebook post requires text, media, or a link',
    path: ['text'],
  });

export const createPostSchema = z.discriminatedUnion('platform', [
  twitterPostSchema,
  linkedinPostSchema,
  facebookPostSchema,
]).superRefine((data, ctx) => {
  if (data.status === 'scheduled' && !data.scheduledAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'scheduledAt is required when status is scheduled',
      path: ['scheduledAt'],
    });
  }
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.discriminatedUnion('platform', [
  twitterPostSchema.extend({ postVersion: z.number().int().min(1) }),
  linkedinPostSchema.innerType().extend({ postVersion: z.number().int().min(1) }).strict(),
  facebookPostSchema.innerType().extend({ postVersion: z.number().int().min(1) }).strict(),
]);
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
```

NOTE: `.refine(...).innerType()` may need adjustment depending on Zod 3.25 surface; if `innerType()` is unavailable, store the un-refined object schemas in named consts and apply refines in two places. Goal: every variant remains strict.

4. Refactor `packages/shared/src/schemas/rate-limit.ts` to a discriminated union:
```typescript
import { z } from 'zod';

const sharedThresholds = {
  warnThresholdPercent: z.number().int().min(1).max(99),
  warnThresholdHit: z.boolean(),
  blockThresholdHit: z.boolean(),
};

const twitterRateLimitState = z.object({
  platform: z.literal('twitter'),
  profileId: z.string().uuid(),
  currentCount: z.number().int().nonnegative(),
  budget: z.number().int().positive(),
  monthStartUtc: z.string().datetime(),
  ...sharedThresholds,
}).strict();

const linkedinRateLimitState = z.object({
  platform: z.literal('linkedin'),
  profileId: z.string().uuid(),
  currentCount: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  windowStartUtc: z.string().datetime(),
  windowResetAt: z.string().datetime(),
  ...sharedThresholds,
}).strict();

const facebookRateLimitState = z.object({
  platform: z.literal('facebook'),
  profileId: z.string().uuid(),
  currentCount: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  windowStartUtc: z.string().datetime(),
  windowResetAt: z.string().datetime(),
  ...sharedThresholds,
}).strict();

export const rateLimitStateSchema = z.discriminatedUnion('platform', [
  twitterRateLimitState,
  linkedinRateLimitState,
  facebookRateLimitState,
]);
export type RateLimitState = z.infer<typeof rateLimitStateSchema>;

// rateLimitUpdateSchema (existing Twitter-only) — kept Twitter-shaped (the only platform with editable budget); LI/FB limits live on social_profiles defaults.
```

5. Extend `packages/shared/src/rate-limit/check-budget.ts` with `checkLinkedInBudget` and `checkFacebookBudget`. Pure calculators — no DB:
```typescript
export interface PlatformBudgetSnapshot {
  currentCount: number;
  limit: number;
  warnThresholdPercent: number;
  windowStartUtc: Date;
  windowResetAt: Date;
}

export interface BudgetCheckResult {
  willExceed: boolean;
  blockThresholdHit: boolean;
  warnThresholdHit: boolean;
  projectedCount: number;
  percent: number;
}

export function checkLinkedInBudget(
  snapshot: PlatformBudgetSnapshot,
  additionalCallCount: number,
): BudgetCheckResult {
  return computeBudget(snapshot, additionalCallCount);
}

export function checkFacebookBudget(
  snapshot: PlatformBudgetSnapshot,
  additionalCallCount: number, // CRITICAL: caller must pass mediaIds.length + 1 for multi-photo posts (Pitfall 2)
): BudgetCheckResult {
  return computeBudget(snapshot, additionalCallCount);
}

function computeBudget(
  snapshot: PlatformBudgetSnapshot,
  additionalCallCount: number,
): BudgetCheckResult {
  const projectedCount = snapshot.currentCount + additionalCallCount;
  const percent = snapshot.limit > 0 ? Math.round((projectedCount / snapshot.limit) * 100) : 0;
  return {
    willExceed: projectedCount > snapshot.limit,
    blockThresholdHit: projectedCount >= snapshot.limit,
    warnThresholdHit: percent >= snapshot.warnThresholdPercent,
    projectedCount,
    percent,
  };
}
```
(If `checkTwitterBudget` already lives here, keep it; this task only ADDS new exports.)

6. Update `packages/shared/src/index.ts` barrel to export new modules:
```typescript
export * from './lib/index.js';
export * from './schemas/posts.js';
export * from './schemas/rate-limit.js';
export * from './rate-limit/check-budget.js';
// (preserve existing exports)
```

Run `pnpm --filter @sms/shared build` after edits to populate dist for downstream packages (CLAUDE.md: tilde version, dist must be current).
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/shared build &amp;&amp; pnpm --filter @sms/shared test platform-text-limits posts-discriminated-union -- --run</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/shared/src/lib/platform-text-limits.ts` exists and exports `countCodePoints` and `PLATFORM_TEXT_LIMITS`
    - `rg "countCodePoints" packages/shared/src/lib/platform-text-limits.ts` returns >= 1 match
    - `rg "discriminatedUnion" packages/shared/src/schemas/posts.ts` returns >= 1 match
    - `rg "discriminatedUnion" packages/shared/src/schemas/rate-limit.ts` returns >= 1 match
    - `rg "checkLinkedInBudget|checkFacebookBudget" packages/shared/src/rate-limit/check-budget.ts` returns >= 2 matches
    - `pnpm --filter @sms/shared test platform-text-limits posts-discriminated-union -- --run` exits 0 (Plan 01 stubs flip GREEN)
    - `pnpm --filter @sms/shared build` exits 0 (dist regenerated)
  </acceptance_criteria>
  <done>Shared package exports countCodePoints, PLATFORM_TEXT_LIMITS, discriminated-union createPostSchema/updatePostSchema, discriminated-union rateLimitStateSchema, and platform budget calculators. Plan 01's two shared-package tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend Drizzle schema (social_profiles + linkedin_account_type, posts.platform/visibility/link_url) and authorize migration generation</name>
  <files>
    packages/db/src/schema/social-profiles.ts,
    packages/db/src/schema/posts.ts
  </files>
  <read_first>
    - packages/db/src/schema/social-profiles.ts (the file being extended)
    - packages/db/src/schema/posts.ts (the file gaining the platform / visibility / link_url columns)
    - packages/db/drizzle/0005_phase-07-oauth-token-lifecycle.sql (analog migration shape)
    - .planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md (lines 414-447 for exact column names + types)
    - .planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md (Pitfall 9 — person vs organization URN; Pitfall 1 escape hatch — Phase 8 absorbs the linkedin_account_type column gap left by Phase 7)
  </read_first>
  <action>
1. Extend `packages/db/src/schema/social-profiles.ts`. Insert these columns AFTER the existing `warnThresholdPercent` column. Use snake_case in the SQL name and camelCase in the JS field name to match the existing convention in this file:
```typescript
// Phase 8 — per-platform rate-limit windows.
// LIMIT-06 (Facebook 200/hour rolling), LIMIT-07 (LinkedIn ~100/day, UTC midnight reset).
linkedinDailyLimit: integer('linkedin_daily_limit').notNull().default(100),
linkedinDailyCount: integer('linkedin_daily_count').notNull().default(0),
linkedinWindowStartUtc: timestamp('linkedin_window_start_utc', { withTimezone: true }),
facebookHourlyLimit: integer('facebook_hourly_limit').notNull().default(200),
facebookHourlyCount: integer('facebook_hourly_count').notNull().default(0),
facebookWindowStartUtc: timestamp('facebook_window_start_utc', { withTimezone: true }),
// Phase 8 — disambiguate person vs organization URN at LinkedIn publish (Pitfall 9).
// Phase 7 did not add this column; Phase 8 absorbs the gap (Pitfall 1 escape hatch).
linkedinAccountType: varchar('linkedin_account_type', { length: 16 }).notNull().default('person'),
```

Do NOT modify any existing column. Do NOT add indexes (none required at this volume). The rate-limit timestamps are NULLable because they're populated lazily on first publish; counts default to 0. `linkedin_account_type` is NOT NULL with `'person'` default — backfills existing rows safely (the only Phase 7 LinkedIn flow connected personal profiles, so 'person' is the correct default; organization profiles connected later set this explicitly).

If `varchar` is not already imported at the top of this file, add it to the existing `drizzle-orm/pg-core` import.

2. Extend `packages/db/src/schema/posts.ts`. Add THREE new columns:

   a. `platform` — denormalized from the joined `social_profiles.platform` (Pattern 1 / Pitfall A5). Insert after the existing `profileId` column.
   b. `visibility` — LinkedIn-only field (POST-LI-03). Nullable because non-LinkedIn posts do not carry this value.
   c. `linkUrl` — Facebook-only field (POST-FB-04). Nullable because non-Facebook posts (and Facebook posts without a link) do not carry this value.

```typescript
// Phase 8 — denormalized for hot-path worker dispatch (avoid JOIN on every publish).
// Application layer (post.service.ts) MUST set this from social_profiles.platform at insert time
// and reject updates that change it (T-DATA-01).
platform: varchar('platform', { length: 16 }).notNull().default('twitter'),
// Phase 8 — LinkedIn-only visibility setting (POST-LI-03). NULL for twitter/facebook posts.
visibility: varchar('visibility', { length: 16 }),
// Phase 8 — Facebook-only optional link URL (POST-FB-04). NULL for twitter/linkedin posts.
linkUrl: text('link_url'),
```

The `default('twitter')` on `platform` is what makes the migration safe for existing rows. `visibility` and `link_url` are nullable — no default needed because existing twitter rows correctly have NULL for both.

If `varchar` or `text` are not already imported in this file, add them to the existing `drizzle-orm/pg-core` import.

3. Build the package so downstream packages get type updates:
```bash
pnpm --filter @sms/db build
```
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/db build &amp;&amp; rg "linkedinDailyLimit|facebookHourlyLimit|linkedinWindowStartUtc|facebookWindowStartUtc|linkedinAccountType" packages/db/src/schema/social-profiles.ts &amp;&amp; rg "platform: varchar\\('platform'|visibility: varchar\\('visibility'|linkUrl: text\\('link_url'" packages/db/src/schema/posts.ts</automated>
  </verify>
  <acceptance_criteria>
    - `rg "linkedinDailyLimit" packages/db/src/schema/social-profiles.ts` returns >= 1 match
    - `rg "linkedinDailyCount" packages/db/src/schema/social-profiles.ts` returns >= 1 match
    - `rg "linkedinWindowStartUtc" packages/db/src/schema/social-profiles.ts` returns >= 1 match
    - `rg "facebookHourlyLimit" packages/db/src/schema/social-profiles.ts` returns >= 1 match
    - `rg "facebookHourlyCount" packages/db/src/schema/social-profiles.ts` returns >= 1 match
    - `rg "facebookWindowStartUtc" packages/db/src/schema/social-profiles.ts` returns >= 1 match
    - `rg "linkedinAccountType" packages/db/src/schema/social-profiles.ts` returns >= 1 match
    - `rg "platform: varchar\('platform'" packages/db/src/schema/posts.ts` returns >= 1 match
    - `rg "visibility: varchar\('visibility'" packages/db/src/schema/posts.ts` returns >= 1 match
    - `rg "linkUrl: text\('link_url'" packages/db/src/schema/posts.ts` returns >= 1 match
    - `pnpm --filter @sms/db build` exits 0
  </acceptance_criteria>
  <done>Drizzle schema updated with 7 new social_profiles columns (6 rate-limit + linkedin_account_type) + 3 new posts columns (platform, visibility, link_url); package builds; no migration generated yet (next task).</done>
</task>

<task type="auto">
  <name>Task 3: Generate the Drizzle migration via drizzle-kit</name>
  <files>
    packages/db/drizzle/0006_phase-08-rate-limit-windows.sql,
    packages/db/drizzle/meta/_journal.json,
    packages/db/drizzle/meta/0006_snapshot.json
  </files>
  <read_first>
    - packages/db/drizzle/0005_phase-07-oauth-token-lifecycle.sql (analog migration to validate generated SQL against)
    - packages/db/drizzle/meta/_journal.json (to confirm next idx and tag)
    - packages/db/drizzle.config.ts (to confirm out path is ./drizzle)
  </read_first>
  <action>
1. From the repo root, run drizzle-kit generate. The schema changes from Task 2 produce a new migration file. The generator picks the next sequential number (`0006`) and a default tag — rename the tag for readability.

```bash
cd /Users/slaughterassistant/social-media-scheduler
pnpm --filter @sms/db exec drizzle-kit generate --name phase-08-rate-limit-windows
```

2. Verify the generated SQL matches the expected shape (this is the line-for-line analog of `0005_phase-07-oauth-token-lifecycle.sql`):
```bash
cat packages/db/drizzle/0006_phase-08-rate-limit-windows.sql
```

The expected content (drizzle-kit output, trailing `--> statement-breakpoint` on each non-final statement):
```sql
ALTER TABLE "social_profiles" ADD COLUMN "linkedin_daily_limit" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "linkedin_daily_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "linkedin_window_start_utc" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "facebook_hourly_limit" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "facebook_hourly_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "facebook_window_start_utc" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "linkedin_account_type" varchar(16) DEFAULT 'person' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "platform" varchar(16) DEFAULT 'twitter' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "visibility" varchar(16);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "link_url" text;
```

(Drizzle-kit may emit the columns in a different order based on schema-file declaration order; the exact ordering is not critical as long as all 10 ALTER TABLE statements appear.)

3. Confirm `packages/db/drizzle/meta/_journal.json` got a new entry for `0006_phase-08-rate-limit-windows` and that `meta/0006_snapshot.json` was created. DO NOT hand-edit these files; they must be authored by drizzle-kit.

4. If the generator emits surprising statements (e.g., recreates an existing column or alters an unrelated table), STOP — that signals schema drift in `0005`. Investigate before proceeding to Task 4.
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; ls packages/db/drizzle/0006_phase-08-rate-limit-windows.sql &amp;&amp; ls packages/db/drizzle/meta/0006_snapshot.json &amp;&amp; rg "0006_phase-08-rate-limit-windows" packages/db/drizzle/meta/_journal.json &amp;&amp; rg "ADD COLUMN \"linkedin_daily_count\"" packages/db/drizzle/0006_phase-08-rate-limit-windows.sql &amp;&amp; rg "ADD COLUMN \"linkedin_account_type\"" packages/db/drizzle/0006_phase-08-rate-limit-windows.sql &amp;&amp; rg "ADD COLUMN \"platform\"" packages/db/drizzle/0006_phase-08-rate-limit-windows.sql &amp;&amp; rg "ADD COLUMN \"visibility\"" packages/db/drizzle/0006_phase-08-rate-limit-windows.sql &amp;&amp; rg "ADD COLUMN \"link_url\"" packages/db/drizzle/0006_phase-08-rate-limit-windows.sql</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/db/drizzle/0006_phase-08-rate-limit-windows.sql` exists
    - File `packages/db/drizzle/meta/0006_snapshot.json` exists
    - `packages/db/drizzle/meta/_journal.json` contains string `0006_phase-08-rate-limit-windows`
    - Migration SQL contains `ADD COLUMN "linkedin_daily_count"` AND `ADD COLUMN "facebook_hourly_count"` AND `ADD COLUMN "linkedin_account_type"` AND `ADD COLUMN "platform"` AND `ADD COLUMN "visibility"` AND `ADD COLUMN "link_url"` AND `--> statement-breakpoint` separators between non-final statements
    - Migration touches ONLY `social_profiles` and `posts` tables (rg confirms no unrelated `ALTER TABLE` lines)
  </acceptance_criteria>
  <done>Migration file 0006 + snapshot + journal entry are generated by drizzle-kit; ready for Task 4 application.</done>
</task>

<task type="auto">
  <name>Task 4 [BLOCKING]: Apply the migration to the live database</name>
  <files>
    .planning/phases/08-linkedin-facebook-post-creation/08-02-SUMMARY.md
  </files>
  <read_first>
    - packages/db/drizzle/0006_phase-08-rate-limit-windows.sql (generated in Task 3 — content must match Task 3 verify)
    - package.json (root — confirms `db:migrate` script alias)
  </read_first>
  <action>
This task is BLOCKING — Phase 8 cannot proceed without the migration applied. Build and type checks pass without the push (Drizzle types come from schema files, not the live DB), creating a false-positive verification state.

1. Confirm `DATABASE_URL` is set for the target environment:
```bash
cd /Users/slaughterassistant/social-media-scheduler
[ -n "$DATABASE_URL" ] && echo "DATABASE_URL is set" || (echo "ERROR: DATABASE_URL not set" && exit 1)
```

2. Apply the migration via the root script:
```bash
pnpm db:migrate
```
(Equivalent to `pnpm --filter @sms/db exec drizzle-kit migrate`. The repo's existing `runMigrations` runner from Phase 6.2 acquires the advisory lock and runs each migration in a transaction.)

3. Verify the columns landed in the live database:
```bash
psql "$DATABASE_URL" -c "\d social_profiles" | rg "linkedin_daily_count|linkedin_window_start_utc|facebook_hourly_count|facebook_window_start_utc|linkedin_account_type"
psql "$DATABASE_URL" -c "\d posts" | rg "^\s+(platform|visibility|link_url)\s"
```

If columns are missing, the migration runner did not actually apply 0006. STOP — do not proceed to Plan 03 / Plan 04. Investigate `__drizzle_migrations` table state and the runner logs.

4. Record the applied migration in this plan's SUMMARY.md (created at end of plan execution).
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; psql "$DATABASE_URL" -tAc "SELECT column_name FROM information_schema.columns WHERE table_name = 'social_profiles' AND column_name IN ('linkedin_daily_count','linkedin_window_start_utc','facebook_hourly_count','facebook_window_start_utc','linkedin_account_type') ORDER BY column_name" | tee /tmp/phase8-sp-cols.txt &amp;&amp; [ "$(wc -l &lt; /tmp/phase8-sp-cols.txt)" = "5" ] &amp;&amp; psql "$DATABASE_URL" -tAc "SELECT column_name FROM information_schema.columns WHERE table_name = 'posts' AND column_name IN ('platform','visibility','link_url') ORDER BY column_name" | tee /tmp/phase8-posts-cols.txt &amp;&amp; [ "$(wc -l &lt; /tmp/phase8-posts-cols.txt)" = "3" ]</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm db:migrate` exits 0
    - `information_schema.columns` returns rows for all 5 new social_profiles columns of interest (linkedin_daily_count, linkedin_window_start_utc, facebook_hourly_count, facebook_window_start_utc, linkedin_account_type) AND for posts.platform, posts.visibility, posts.link_url
    - `__drizzle_migrations` table contains a row whose hash corresponds to `0006_phase-08-rate-limit-windows`
    - `psql "$DATABASE_URL" -tAc "SELECT count(*) FROM social_profiles WHERE linkedin_daily_limit IS NULL"` returns 0 (NOT NULL default 100 backfilled)
    - `psql "$DATABASE_URL" -tAc "SELECT count(*) FROM social_profiles WHERE linkedin_account_type IS NULL"` returns 0 (NOT NULL default 'person' backfilled)
    - `psql "$DATABASE_URL" -tAc "SELECT count(*) FROM posts WHERE platform IS NULL"` returns 0 (NOT NULL default 'twitter' backfilled)
    - `psql "$DATABASE_URL" -tAc "SELECT count(*) FROM posts WHERE visibility IS NOT NULL"` returns 0 immediately after migration (column added nullable; no backfill expected)
  </acceptance_criteria>
  <done>Live database has all 7 new social_profiles columns and 3 new posts columns; existing rows backfilled with defaults where applicable (visibility/link_url remain NULL, intended); migration journal records 0006. Phase 8 unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Schema file → migration runner → live DB | DDL changes propagate via drizzle-kit; runner applies under advisory lock (Phase 6.2 hardening) |
| Validated request body → discriminated union | Untrusted client payload narrowed to a single platform variant before any handler executes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-API-01 | Tampering | createPostSchema char limit | mitigate | Each variant uses `.max(LIMIT)` plus `.refine` for code-point counting; oversize text rejected at parse time before any handler runs |
| T-API-03 | Tampering | discriminated union strictness | mitigate | Each variant `.strict()` rejects cross-platform fields (`linkedin` + `linkUrl` is a 400 at the schema layer) |
| T-DATA-01 | Tampering | denormalized posts.platform | mitigate | Schema documents that post.service.ts MUST set `platform` from social_profiles.platform at insert and reject updates that change it (enforced in Plan 03) |
| T-LIMITS-01 | Tampering | rate-limit window column atomicity | mitigate | Schema introduces the columns; the atomic CAS UPDATE that uses them ships in Plans 03/04 with `<read_first>` references back to this plan |
</threat_model>

<verification>
This plan is complete when:
1. `pnpm --filter @sms/shared test platform-text-limits posts-discriminated-union -- --run` is GREEN
2. Migration `0006_phase-08-rate-limit-windows.sql` exists, references both `social_profiles` and `posts` tables (10 columns total), and was generated by drizzle-kit (not hand-written)
3. `pnpm db:migrate` ran successfully against the live database; `information_schema.columns` confirms all 10 new columns are present
4. `pnpm --filter @sms/shared build` and `pnpm --filter @sms/db build` both exit 0
5. SUMMARY.md committed at `.planning/phases/08-linkedin-facebook-post-creation/08-02-SUMMARY.md`
</verification>

<success_criteria>
- All Plan 01 RED tests for shared-package concerns flip to GREEN
- Migration 0006 applied and visible in `__drizzle_migrations`
- Existing posts rows backfilled with `platform='twitter'` (default); `visibility` and `link_url` remain NULL until set by future LinkedIn/Facebook inserts
- social_profiles backfilled with `linkedin_daily_limit=100`, `facebook_hourly_limit=200`, `linkedin_account_type='person'`
- `@sms/shared` exports countCodePoints, PLATFORM_TEXT_LIMITS, discriminated-union createPostSchema, discriminated-union rateLimitStateSchema, checkLinkedInBudget, checkFacebookBudget
</success_criteria>

<output>
After completion, create `.planning/phases/08-linkedin-facebook-post-creation/08-02-SUMMARY.md`
</output>
