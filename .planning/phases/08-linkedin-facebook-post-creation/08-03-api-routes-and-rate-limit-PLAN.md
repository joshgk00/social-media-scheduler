---
phase: 08-linkedin-facebook-post-creation
plan: 03
type: execute
wave: 2
depends_on: [02]
files_modified:
  - packages/api/src/services/rate-limit.service.ts
  - packages/api/src/services/post.service.ts
  - packages/api/src/routes/posts.ts
  - packages/api/src/routes/rate-limit.ts
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
  - LIMIT-08
threats:
  - T-API-01
  - T-API-02
  - T-API-03
  - T-DATA-01
  - T-LIMITS-01
must_haves:
  truths:
    - "POST /api/posts accepts and persists linkedin and facebook payloads"
    - "POST /api/posts rejects oversize text per platform with 400 (server-side enforcement, not just client)"
    - "POST /api/posts rejects cross-platform fields with 400 (strict discriminated union)"
    - "POST /api/posts pre-flight returns 409 + platform-specific code when at limit"
    - "Concurrent publish pre-flights cannot both pass when one would push over limit (atomic CAS)"
    - "GET /api/rate-limit/:profileId returns the platform-discriminated state"
    - "GET /api/rate-limit (collection) returns ProfileRateLimitState[] for the dashboard widget (LIMIT-08)"
    - "post.service.ts denormalizes social_profiles.platform onto posts.platform at insert and persists visibility (LinkedIn) and linkUrl (Facebook) into the new posts columns"
    - "post.service.ts rejects updates that change platform (T-DATA-01) with PLATFORM_IMMUTABLE"
  artifacts:
    - path: packages/api/src/services/rate-limit.service.ts
      provides: "loadLinkedInUsage, loadFacebookUsage, checkLinkedInBudgetWithDb, checkFacebookBudgetWithDb, checkPlatformBudgetWithDb dispatcher, atomic resetOrIncrementWindow"
      contains: "checkPlatformBudgetWithDb"
    - path: packages/api/src/routes/posts.ts
      provides: "Platform-aware POST/PATCH with pre-flight 409 branches and platform-specific 409 codes"
    - path: packages/api/src/services/post.service.ts
      provides: "createPost / updatePost typed against CreatePostInput | UpdatePostInput discriminated unions; sets posts.platform / posts.visibility / posts.linkUrl from typed union narrowing; rejects platform changes on update"
    - path: packages/api/src/routes/rate-limit.ts
      provides: "GET /api/rate-limit/:profileId (single) AND GET /api/rate-limit (collection) returning platform-discriminated rateLimitStateSchema bodies"
  key_links:
    - from: "packages/api/src/routes/posts.ts"
      to: "packages/api/src/services/rate-limit.service.ts"
      via: "checkPlatformBudgetWithDb dispatch"
      pattern: "checkPlatformBudgetWithDb"
    - from: "packages/api/src/services/rate-limit.service.ts"
      to: "social_profiles linkedin_daily_count / facebook_hourly_count columns"
      via: "Drizzle UPDATE with sql`CASE WHEN ... THEN ... ELSE ... END`"
      pattern: "CASE.*WHEN.*window_start"
---

<objective>
Land the server-side platform branching: API routes accept the discriminated-union payload, run a per-platform rate-limit pre-flight (with atomic CAS window reset), reject oversize/mixed payloads with 400, and return platform-specific 409 codes when at limit. Read-side endpoint extends to return the platform-discriminated rateLimitStateSchema for the dashboard widget — both single (`/api/rate-limit/:profileId`) and collection (`/api/rate-limit`) shapes.

Purpose: This is where T-API-01 (server-side limit enforcement), T-API-02 (race-free pre-flight), T-API-03 (strict discriminated union), and T-DATA-01 (denormalized platform invariant) all converge. The worker wave (Plan 04) and the UI wave (Plan 05) both depend on the contract this plan ships.

Output: posts route handles three platforms uniformly with platform-aware pre-flight; rate-limit service exposes platform-aware loaders and an atomic increment helper; rate-limit route returns the discriminated-union body via both single and collection endpoints; Plan 01's API tests flip RED→GREEN.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-linkedin-facebook-post-creation/08-CONTEXT.md
@.planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md
@.planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md
@packages/api/src/routes/posts.ts
@packages/api/src/services/rate-limit.service.ts
@packages/api/src/services/post.service.ts
@packages/api/src/routes/rate-limit.ts
@packages/db/src/schema/social-profiles.ts
@packages/db/src/schema/posts.ts

<interfaces>
<!-- Existing types/exports the executor must extend. -->

From Plan 02 (@sms/shared):
- createPostSchema: ZodDiscriminatedUnion<'platform', [twitter, linkedin, facebook]>
- type CreatePostInput = z.infer<typeof createPostSchema>
- updatePostSchema: ZodDiscriminatedUnion (same shape + postVersion)
- rateLimitStateSchema: ZodDiscriminatedUnion<'platform', [twitter, linkedin, facebook]>
- checkLinkedInBudget(snapshot, additionalCount): BudgetCheckResult
- checkFacebookBudget(snapshot, additionalCount): BudgetCheckResult
- PlatformBudgetSnapshot { currentCount, limit, warnThresholdPercent, windowStartUtc, windowResetAt }

From Plan 02 (@sms/db schema — these columns NOW EXIST in the live DB):
- socialProfiles columns added: linkedinDailyLimit, linkedinDailyCount, linkedinWindowStartUtc, facebookHourlyLimit, facebookHourlyCount, facebookWindowStartUtc, linkedinAccountType
- posts columns added: platform varchar(16) default 'twitter' NOT NULL, visibility varchar(16) NULL, linkUrl text NULL

From existing rate-limit.service.ts (Twitter):
- checkTwitterBudgetWithDb(db, { profileId, additionalPostCount }) → { blockThresholdHit, warnThresholdHit, currentCount, budget, percent }
- BudgetExceededBody { code: 'twitter_budget_exceeded', budget, currentCount }

From existing routes/posts.ts (lines 47-51 and 111-157 — the pattern to extend):
- 409 response shape with `code` discriminator
- Pre-flight before insert; if blockThresholdHit, return 409
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend rate-limit.service.ts with per-platform loaders, atomic reset+increment, and platform dispatcher</name>
  <files>
    packages/api/src/services/rate-limit.service.ts
  </files>
  <read_first>
    - packages/api/src/services/rate-limit.service.ts (full file — extending self)
    - packages/api/src/__tests__/rate-limit-platform.test.ts (Plan 01 stubs driving this implementation)
    - packages/db/src/schema/social-profiles.ts (column names confirmed in Plan 02)
    - .planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md (Pattern 4 for the SQL CAS template, Pitfall 6 + 7 for window semantics)
    - .planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md (lines 246-289 for analog shape)
  </read_first>
  <behavior>
    - loadLinkedInUsage(db, profileId): returns { currentCount, limit, warnThresholdPercent, windowStartUtc, windowResetAt }; treats count as 0 if windowStartUtc < date_trunc('day', now() AT TIME ZONE 'UTC') (Pitfall 7)
    - loadFacebookUsage(db, profileId): same shape; window is rolling 1-hour, threshold = now - INTERVAL '1 hour' (Pitfall 6)
    - checkLinkedInBudgetWithDb(db, { profileId, additionalCount }): loads usage and delegates to checkLinkedInBudget pure calculator
    - checkFacebookBudgetWithDb(db, { profileId, additionalCount }): same; CRITICAL — caller must pass `mediaIds.length + 1` for multi-photo posts (Pitfall 2)
    - checkPlatformBudgetWithDb(db, { profileId, platform, additionalCount }): switch dispatcher
    - resetOrIncrementLinkedinWindow(db, profileId): atomic SQL UPDATE with CASE-WHEN to either reset count→1 + bump windowStartUtc, or increment count by 1 — single statement, RETURNING the new count
    - resetOrIncrementFacebookWindow(db, profileId): same shape, hourly threshold
    - 409 body shape constants: LinkedInRateLimitExceededBody { code: 'linkedin_rate_limit_exceeded', limit, currentCount, windowResetAt }; same for facebook; plus a discriminated union RateLimitExceededBody
  </behavior>
  <action>
Append (do NOT replace) to `packages/api/src/services/rate-limit.service.ts`. The file currently exports Twitter-only helpers (checkTwitterBudgetWithDb, etc.). Add Phase 8 exports beneath the Twitter section.

```typescript
import { sql, eq } from 'drizzle-orm';
import { socialProfiles } from '@sms/db';
import {
  checkLinkedInBudget,
  checkFacebookBudget,
  type PlatformBudgetSnapshot,
  type BudgetCheckResult,
} from '@sms/shared';

// ============================================================================
// Phase 8 — per-platform rate-limit loaders + atomic CAS increment
// ============================================================================

export interface LinkedInRateLimitExceededBody {
  code: 'linkedin_rate_limit_exceeded';
  limit: number;
  currentCount: number;
  windowResetAt: string;  // ISO
}

export interface FacebookRateLimitExceededBody {
  code: 'facebook_rate_limit_exceeded';
  limit: number;
  currentCount: number;
  windowResetAt: string;
}

export type RateLimitExceededBody =
  | { code: 'twitter_budget_exceeded'; budget: number; currentCount: number }
  | LinkedInRateLimitExceededBody
  | FacebookRateLimitExceededBody;

const DEFAULT_WARN_THRESHOLD_PERCENT = 90;

function utcDayStart(d: Date = new Date()): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function utcNextDayStart(d: Date = new Date()): Date {
  const copy = utcDayStart(d);
  copy.setUTCDate(copy.getUTCDate() + 1);
  return copy;
}

function rollingHourThreshold(d: Date = new Date()): Date {
  return new Date(d.getTime() - 60 * 60 * 1000);
}

function nextHourTop(d: Date = new Date()): Date {
  const copy = new Date(d);
  copy.setUTCMinutes(0, 0, 0);
  copy.setUTCHours(copy.getUTCHours() + 1);
  return copy;
}

export async function loadLinkedInUsage(
  db: ApiDb,
  profileId: string,
): Promise<PlatformBudgetSnapshot> {
  const rows = await db
    .select({
      limit: socialProfiles.linkedinDailyLimit,
      count: socialProfiles.linkedinDailyCount,
      windowStart: socialProfiles.linkedinWindowStartUtc,
      warnThresholdPercent: socialProfiles.warnThresholdPercent,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));
  if (rows.length === 0) {
    throw new Error(`Profile ${profileId} not found`);
  }
  const row = rows[0];
  const dayStart = utcDayStart();
  const isExpired = !row.windowStart || row.windowStart < dayStart;
  const effectiveCount = isExpired ? 0 : row.count;
  const effectiveStart = isExpired ? dayStart : row.windowStart;
  return {
    currentCount: effectiveCount,
    limit: row.limit,
    warnThresholdPercent: row.warnThresholdPercent ?? DEFAULT_WARN_THRESHOLD_PERCENT,
    windowStartUtc: effectiveStart,
    windowResetAt: utcNextDayStart(),
  };
}

export async function loadFacebookUsage(
  db: ApiDb,
  profileId: string,
): Promise<PlatformBudgetSnapshot> {
  const rows = await db
    .select({
      limit: socialProfiles.facebookHourlyLimit,
      count: socialProfiles.facebookHourlyCount,
      windowStart: socialProfiles.facebookWindowStartUtc,
      warnThresholdPercent: socialProfiles.warnThresholdPercent,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));
  if (rows.length === 0) {
    throw new Error(`Profile ${profileId} not found`);
  }
  const row = rows[0];
  const hourThreshold = rollingHourThreshold();
  const isExpired = !row.windowStart || row.windowStart < hourThreshold;
  const effectiveCount = isExpired ? 0 : row.count;
  const effectiveStart = isExpired ? new Date() : row.windowStart;
  return {
    currentCount: effectiveCount,
    limit: row.limit,
    warnThresholdPercent: row.warnThresholdPercent ?? DEFAULT_WARN_THRESHOLD_PERCENT,
    windowStartUtc: effectiveStart,
    windowResetAt: nextHourTop(),
  };
}

export async function checkLinkedInBudgetWithDb(
  db: ApiDb,
  args: { profileId: string; additionalCount: number },
): Promise<BudgetCheckResult & { snapshot: PlatformBudgetSnapshot }> {
  const snapshot = await loadLinkedInUsage(db, args.profileId);
  return { ...checkLinkedInBudget(snapshot, args.additionalCount), snapshot };
}

export async function checkFacebookBudgetWithDb(
  db: ApiDb,
  args: { profileId: string; additionalCount: number },
): Promise<BudgetCheckResult & { snapshot: PlatformBudgetSnapshot }> {
  const snapshot = await loadFacebookUsage(db, args.profileId);
  return { ...checkFacebookBudget(snapshot, args.additionalCount), snapshot };
}

export async function checkPlatformBudgetWithDb(
  db: ApiDb,
  args: {
    profileId: string;
    platform: 'twitter' | 'linkedin' | 'facebook';
    additionalCount: number;
  },
): Promise<BudgetCheckResult & { snapshot?: PlatformBudgetSnapshot; budget?: number; currentCount?: number }> {
  if (args.platform === 'twitter') {
    return checkTwitterBudgetWithDb(db, {
      profileId: args.profileId,
      additionalPostCount: args.additionalCount,
    });
  }
  if (args.platform === 'linkedin') {
    return checkLinkedInBudgetWithDb(db, { profileId: args.profileId, additionalCount: args.additionalCount });
  }
  return checkFacebookBudgetWithDb(db, { profileId: args.profileId, additionalCount: args.additionalCount });
}

/**
 * Atomic CAS-style reset-or-increment for the LinkedIn daily window. Single SQL
 * statement so two concurrent callers cannot both pass a pre-flight (T-API-02).
 *
 * On expired window (windowStart < UTC midnight today): resets count to 1 and
 * sets windowStart to today's UTC midnight.
 * Otherwise: increments count by 1.
 *
 * Returns the new count + windowStart from RETURNING.
 */
export async function resetOrIncrementLinkedinWindow(
  db: ApiDb,
  profileId: string,
): Promise<{ count: number; windowStartUtc: Date }> {
  const dayStart = utcDayStart();
  const result = await db.execute(sql`
    UPDATE social_profiles SET
      linkedin_daily_count = CASE
        WHEN linkedin_window_start_utc IS NULL OR linkedin_window_start_utc < ${dayStart}
          THEN 1
        ELSE linkedin_daily_count + 1
      END,
      linkedin_window_start_utc = CASE
        WHEN linkedin_window_start_utc IS NULL OR linkedin_window_start_utc < ${dayStart}
          THEN ${dayStart}
        ELSE linkedin_window_start_utc
      END,
      updated_at = NOW()
    WHERE id = ${profileId}
    RETURNING linkedin_daily_count AS count, linkedin_window_start_utc AS window_start_utc
  `);
  const row = (result as unknown as Array<{ count: number; window_start_utc: Date }>)[0];
  if (!row) throw new Error(`Profile ${profileId} not found during LinkedIn window increment`);
  return { count: row.count, windowStartUtc: row.window_start_utc };
}

/**
 * Atomic CAS-style reset-or-increment for the Facebook hourly window. Same
 * pattern as LinkedIn but with rolling-hour expiry.
 */
export async function resetOrIncrementFacebookWindow(
  db: ApiDb,
  profileId: string,
  callCount: number,  // FB multi-photo posts consume mediaIds.length + 1 calls (Pitfall 2)
): Promise<{ count: number; windowStartUtc: Date }> {
  const hourThreshold = rollingHourThreshold();
  const now = new Date();
  const result = await db.execute(sql`
    UPDATE social_profiles SET
      facebook_hourly_count = CASE
        WHEN facebook_window_start_utc IS NULL OR facebook_window_start_utc < ${hourThreshold}
          THEN ${callCount}
        ELSE facebook_hourly_count + ${callCount}
      END,
      facebook_window_start_utc = CASE
        WHEN facebook_window_start_utc IS NULL OR facebook_window_start_utc < ${hourThreshold}
          THEN ${now}
        ELSE facebook_window_start_utc
      END,
      updated_at = NOW()
    WHERE id = ${profileId}
    RETURNING facebook_hourly_count AS count, facebook_window_start_utc AS window_start_utc
  `);
  const row = (result as unknown as Array<{ count: number; window_start_utc: Date }>)[0];
  if (!row) throw new Error(`Profile ${profileId} not found during Facebook window increment`);
  return { count: row.count, windowStartUtc: row.window_start_utc };
}
```

`ApiDb` is the existing type alias used by this file; do not introduce a new type.

The `db.execute(sql\`...\`)` raw-SQL approach is used because Drizzle's typed `update().set()` does not cleanly express CASE-WHEN with column references on both sides. The existing rate-limit.service.ts may already use `db.execute` for similar operations; if not, mirror the helper from `post-lifecycle.service.ts` lines 381-390 (Phase 7's RETURNING pattern).
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/api build &amp;&amp; rg "checkPlatformBudgetWithDb|resetOrIncrementLinkedinWindow|resetOrIncrementFacebookWindow|loadLinkedInUsage|loadFacebookUsage" packages/api/src/services/rate-limit.service.ts | wc -l | tr -d ' ' | grep -E "^([5-9]|[1-9][0-9]+)$"</automated>
  </verify>
  <acceptance_criteria>
    - `rg "loadLinkedInUsage" packages/api/src/services/rate-limit.service.ts` returns >= 2 matches (signature + body)
    - `rg "loadFacebookUsage" packages/api/src/services/rate-limit.service.ts` returns >= 2 matches
    - `rg "checkPlatformBudgetWithDb" packages/api/src/services/rate-limit.service.ts` returns >= 1 match
    - `rg "resetOrIncrementLinkedinWindow" packages/api/src/services/rate-limit.service.ts` returns >= 1 match
    - `rg "resetOrIncrementFacebookWindow" packages/api/src/services/rate-limit.service.ts` returns >= 1 match
    - `rg "CASE.*WHEN.*window_start" packages/api/src/services/rate-limit.service.ts` returns >= 2 matches (LI + FB CAS branches)
    - `pnpm --filter @sms/api build` exits 0
  </acceptance_criteria>
  <done>rate-limit.service.ts exposes per-platform loaders, a platform dispatcher, and atomic CAS reset+increment helpers. The CASE-WHEN single-statement pattern is the T-API-02 + T-LIMITS-01 mitigation; same-statement guarantees concurrent callers cannot both pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Update post.service.ts to consume the discriminated union and enforce platform invariant</name>
  <files>
    packages/api/src/services/post.service.ts
  </files>
  <read_first>
    - packages/api/src/services/post.service.ts (full file — refactor target)
    - packages/db/src/schema/posts.ts (after Plan 02 the platform/visibility/linkUrl columns ALL exist)
    - packages/shared/src/schemas/posts.ts (after Plan 02 createPostSchema is the discriminated union)
    - packages/api/src/__tests__/post-service-platform.test.ts (Plan 01 Wave-0 stub driving T-DATA-01 invariants — see Plan 01 Task 2)
    - .planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md (Pitfall 10, Architectural Responsibility Map row "Discriminated-union post schema")
  </read_first>
  <behavior>
    - createPost(db, args: CreatePostInput): persists posts row; sets posts.platform from joined social_profiles.platform (T-DATA-01 — single source of truth at insert)
    - createPost rejects if profile.platform !== args.platform with PLATFORM_MISMATCH (defensive: caller may have stale data)
    - createPost persists args.visibility into posts.visibility for LinkedIn variant; persists args.linkUrl into posts.linkUrl for Facebook variant; both columns now exist on posts (Plan 02)
    - updatePost(db, args: UpdatePostInput): rejects with PLATFORM_IMMUTABLE if args.platform !== existingPost.platform (T-DATA-01: posts.platform is immutable post-insert)
    - All existing Twitter functionality preserved; refactor narrows on `args.platform` to access platform-only fields without `as` casts
  </behavior>
  <action>
1. Update `CreatePostInput` and `UpdatePostInput` references to import the new discriminated unions from `@sms/shared` instead of the old single-shape schema.

2. In `createPost`, before inserting:
```typescript
import { socialProfiles, posts } from '@sms/db';

export async function createPost(db: ApiDb, args: CreatePostInput) {
  // Load profile to mirror its platform onto the new posts row (T-DATA-01).
  const [profile] = await db
    .select({ id: socialProfiles.id, platform: socialProfiles.platform })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, args.profileId));
  if (!profile) {
    throw new PostServiceError('PROFILE_NOT_FOUND', `Profile ${args.profileId} not found`);
  }
  if (profile.platform !== args.platform) {
    throw new PostServiceError('PLATFORM_MISMATCH',
      `Profile platform ${profile.platform} does not match payload platform ${args.platform}`);
  }

  // Build per-platform insert values. Platform-only fields are accessed inside
  // the type-narrowed branch — no `as` casts. visibility / linkUrl columns
  // were added in Plan 02; they exist on the posts schema and accept these values directly.
  const baseInsert = {
    profileId: args.profileId,
    platform: profile.platform,  // denormalized
    text: args.text,
    status: args.status,
    scheduledAt: args.scheduledAt ?? null,
    hasSpinnableText: args.hasSpinnableText,
    autoDestructAfter: args.autoDestructAfter ?? null,
    notes: args.notes ?? null,
  };

  let extraInsert: Record<string, unknown> = {};
  if (args.platform === 'twitter') {
    extraInsert = { isThread: args.isThread };
  } else if (args.platform === 'linkedin') {
    // Plan 02 added posts.visibility (varchar(16) nullable). Persist directly.
    extraInsert = { visibility: args.visibility };
  } else {
    // Plan 02 added posts.linkUrl (text nullable). Persist directly.
    extraInsert = { linkUrl: args.linkUrl ?? null };
  }

  const [row] = await db.insert(posts).values({ ...baseInsert, ...extraInsert }).returning();
  // Existing tag + media association logic continues here unchanged.
  return row;
}
```

3. In `updatePost`, before updating:
```typescript
export async function updatePost(db: ApiDb, postId: string, args: UpdatePostInput) {
  const [existing] = await db
    .select({ id: posts.id, platform: posts.platform, postVersion: posts.postVersion })
    .from(posts)
    .where(eq(posts.id, postId));
  if (!existing) throw new PostServiceError('POST_NOT_FOUND', `Post ${postId} not found`);
  if (existing.platform !== args.platform) {
    throw new PostServiceError('PLATFORM_IMMUTABLE',
      `Cannot change post platform from ${existing.platform} to ${args.platform} (T-DATA-01)`);
  }
  // existing version-check + update logic continues; for LinkedIn/Facebook variants,
  // also persist updated visibility / linkUrl values via the same union-narrowed branch
  // pattern used in createPost.
}
```

NOTE: Plan 02 has been updated to add `posts.visibility` and `posts.link_url` columns. There is no longer a "STOP and flag" condition — the columns exist, and `db.insert(posts).values({ ... visibility, linkUrl })` will type-check and persist directly.
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/api build &amp;&amp; pnpm --filter @sms/api test post-service-platform posts-platform -- --run &amp;&amp; rg "PLATFORM_MISMATCH|PLATFORM_IMMUTABLE|denormalized" packages/api/src/services/post.service.ts</automated>
  </verify>
  <acceptance_criteria>
    - `rg "platform: profile.platform" packages/api/src/services/post.service.ts` returns >= 1 match (denormalization on insert)
    - `rg "PLATFORM_MISMATCH" packages/api/src/services/post.service.ts` returns >= 1 match
    - `rg "PLATFORM_IMMUTABLE" packages/api/src/services/post.service.ts` returns >= 1 match
    - `rg "args.platform === 'linkedin'|args.platform === 'facebook'" packages/api/src/services/post.service.ts` returns >= 2 matches (type-narrowed branches)
    - `rg "visibility: args.visibility" packages/api/src/services/post.service.ts` returns >= 1 match (LinkedIn branch persists visibility into posts.visibility)
    - `rg "linkUrl: args.linkUrl" packages/api/src/services/post.service.ts` returns >= 1 match (Facebook branch persists linkUrl into posts.link_url)
    - `pnpm --filter @sms/api build` exits 0 (no type errors from the union narrowing)
    - `pnpm --filter @sms/api test post-service-platform -- --run` exits 0 (Plan 01 Wave-0 stub flips GREEN; covers T-DATA-01 invariants 1 + 2)
    - No new `as any` or `as unknown` casts introduced (`rg "as any|as unknown" packages/api/src/services/post.service.ts | wc -l` does not exceed pre-Plan-03 count)
  </acceptance_criteria>
  <done>post.service.ts denormalizes platform on insert, persists visibility (LinkedIn) and linkUrl (Facebook) directly into the new Plan-02 columns, rejects mismatched platform on insert and update, and uses union narrowing (no `as` casts) for platform-only fields. Plan 01 Wave-0 post-service-platform test flips GREEN.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend POST /api/posts and PATCH /api/posts/:id with per-platform pre-flight + 409 codes; add GET /api/rate-limit collection endpoint</name>
  <files>
    packages/api/src/routes/posts.ts,
    packages/api/src/routes/rate-limit.ts
  </files>
  <read_first>
    - packages/api/src/routes/posts.ts (full file — refactor target)
    - packages/api/src/routes/rate-limit.ts (full file — extend GET handler + add collection endpoint)
    - packages/api/src/services/rate-limit.service.ts (Task 1 output — checkPlatformBudgetWithDb)
    - packages/api/src/__tests__/posts-platform.test.ts (Plan 01 stubs)
    - packages/api/src/__tests__/rate-limit-platform.test.ts (Plan 01 stubs)
    - .planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md (lines 291-313 for 409 body shape extension)
  </read_first>
  <behavior>
    POST /api/posts:
      - parse body via createPostSchema (now discriminated union); 400 with details on parse failure (T-API-01, T-API-03)
      - look up owned profile; 404 if not found, 403 if not owned
      - if status === 'scheduled' run pre-flight: additionalCount = 1 for twitter/linkedin, mediaIds.length + 1 for facebook (Pitfall 2)
      - on blockThresholdHit: return 409 with platform-specific code body
      - on warnThresholdHit (not block): proceed with insert; existing notification flow handles warn enqueue
      - call createPost(db, parsed.data) and return 201 + persisted row

    PATCH /api/posts/:id:
      - parse body via updatePostSchema; 400 on parse failure
      - call updatePost(db, postId, parsed.data); on PLATFORM_IMMUTABLE error → 409 + { code: 'platform_immutable' }
      - run pre-flight only if status changes draft→scheduled or scheduled-to-different-time

    GET /api/rate-limit/:profileId (existing — extended):
      - look up profile; 404 if not found, 403 if not owned
      - dispatch on profile.platform: load{Linkedin|Facebook|Twitter}Usage
      - return body conforming to rateLimitStateSchema (platform discriminator)

    GET /api/rate-limit (NEW collection endpoint — backs LIMIT-08 dashboard widget):
      - list every profile owned by the authenticated user
      - dispatch per profile on its platform: build single rateLimitStateSchema-conforming entry
      - return `{ profiles: ProfileRateLimitState[] }` (or just an array — pick one shape and align with web hook in Plan 05a)
  </behavior>
  <action>
1. In `packages/api/src/routes/posts.ts`, refactor the parse + pre-flight block:
```typescript
import {
  checkPlatformBudgetWithDb,
  type LinkedInRateLimitExceededBody,
  type FacebookRateLimitExceededBody,
} from '../services/rate-limit.service.js';
import { createPostSchema, updatePostSchema } from '@sms/shared';

router.post('/api/posts', requireAuth, async (req, res) => {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }
  const input = parsed.data;

  const ownedProfile = await loadOwnedProfile(req.db, req.session.userId, input.profileId);
  if (!ownedProfile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  if (ownedProfile.platform !== input.platform) {
    res.status(400).json({
      error: 'Profile platform mismatch',
      details: [{ path: ['platform'], message: 'Profile is not on the requested platform' }],
    });
    return;
  }

  if (input.status === 'scheduled') {
    const additionalCount = input.platform === 'facebook'
      ? input.mediaIds.length + 1
      : 1;
    const result = await checkPlatformBudgetWithDb(req.db, {
      profileId: input.profileId,
      platform: input.platform,
      additionalCount,
    });
    if (result.blockThresholdHit) {
      if (input.platform === 'twitter') {
        res.status(409).json({
          code: 'twitter_budget_exceeded',
          budget: result.budget,
          currentCount: result.currentCount,
        });
        return;
      }
      const body: LinkedInRateLimitExceededBody | FacebookRateLimitExceededBody = {
        code: input.platform === 'linkedin' ? 'linkedin_rate_limit_exceeded' : 'facebook_rate_limit_exceeded',
        limit: result.snapshot!.limit,
        currentCount: result.snapshot!.currentCount,
        windowResetAt: result.snapshot!.windowResetAt.toISOString(),
      };
      res.status(409).json(body);
      return;
    }
    // warnThresholdHit handled by existing warn-notification enqueue (unchanged).
  }

  const post = await createPost(req.db, input);
  res.status(201).json(post);
});
```

2. PATCH handler analogously — see existing handler shape:
```typescript
router.patch('/api/posts/:id', requireAuth, async (req, res) => {
  const parsed = updatePostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }
  try {
    const updated = await updatePost(req.db, req.params.id, parsed.data);
    res.status(200).json(updated);
  } catch (err) {
    if (err instanceof PostServiceError) {
      if (err.code === 'PLATFORM_IMMUTABLE') {
        res.status(409).json({ code: 'platform_immutable', message: err.message });
        return;
      }
      // ... existing error mapping
    }
    throw err;
  }
});
```

3. In `packages/api/src/routes/rate-limit.ts`, extend the GET handler AND add the new collection endpoint backing LIMIT-08:
```typescript
import { loadLinkedInUsage, loadFacebookUsage } from '../services/rate-limit.service.js';

router.get('/api/rate-limit/:profileId', requireAuth, async (req, res) => {
  const profile = await loadOwnedProfile(req.db, req.session.userId, req.params.profileId);
  if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }

  if (profile.platform === 'twitter') {
    // existing Twitter shape — unchanged
    const state = await buildTwitterRateLimitState(req.db, profile.id);
    res.status(200).json(state);
    return;
  }
  if (profile.platform === 'linkedin') {
    const snap = await loadLinkedInUsage(req.db, profile.id);
    res.status(200).json({
      platform: 'linkedin',
      profileId: profile.id,
      currentCount: snap.currentCount,
      limit: snap.limit,
      warnThresholdPercent: snap.warnThresholdPercent,
      warnThresholdHit: snap.currentCount >= Math.floor(snap.limit * snap.warnThresholdPercent / 100),
      blockThresholdHit: snap.currentCount >= snap.limit,
      windowStartUtc: snap.windowStartUtc.toISOString(),
      windowResetAt: snap.windowResetAt.toISOString(),
    });
    return;
  }
  // facebook
  const snap = await loadFacebookUsage(req.db, profile.id);
  res.status(200).json({
    platform: 'facebook',
    profileId: profile.id,
    currentCount: snap.currentCount,
    limit: snap.limit,
    warnThresholdPercent: snap.warnThresholdPercent,
    warnThresholdHit: snap.currentCount >= Math.floor(snap.limit * snap.warnThresholdPercent / 100),
    blockThresholdHit: snap.currentCount >= snap.limit,
    windowStartUtc: snap.windowStartUtc.toISOString(),
    windowResetAt: snap.windowResetAt.toISOString(),
  });
});

// LIMIT-08 — Collection endpoint backing the dashboard RateLimitsCard widget.
// Returns one entry per owned profile, each conforming to rateLimitStateSchema.
router.get('/api/rate-limit', requireAuth, async (req, res) => {
  const profiles = await listOwnedProfiles(req.db, req.session.userId);
  const results = await Promise.all(profiles.map(async (p) => {
    if (p.platform === 'twitter') return buildTwitterRateLimitState(req.db, p.id);
    if (p.platform === 'linkedin') {
      const snap = await loadLinkedInUsage(req.db, p.id);
      return {
        platform: 'linkedin',
        profileId: p.id,
        currentCount: snap.currentCount,
        limit: snap.limit,
        warnThresholdPercent: snap.warnThresholdPercent,
        warnThresholdHit: snap.currentCount >= Math.floor(snap.limit * snap.warnThresholdPercent / 100),
        blockThresholdHit: snap.currentCount >= snap.limit,
        windowStartUtc: snap.windowStartUtc.toISOString(),
        windowResetAt: snap.windowResetAt.toISOString(),
      };
    }
    const snap = await loadFacebookUsage(req.db, p.id);
    return {
      platform: 'facebook',
      profileId: p.id,
      currentCount: snap.currentCount,
      limit: snap.limit,
      warnThresholdPercent: snap.warnThresholdPercent,
      warnThresholdHit: snap.currentCount >= Math.floor(snap.limit * snap.warnThresholdPercent / 100),
      blockThresholdHit: snap.currentCount >= snap.limit,
      windowStartUtc: snap.windowStartUtc.toISOString(),
      windowResetAt: snap.windowResetAt.toISOString(),
    };
  }));
  res.status(200).json({ profiles: results });
});
```

The new GET /api/rate-limit (collection) endpoint backs the LIMIT-08 dashboard widget; the dashboard renders one row per item. Plan 05b's `useAllProfilesRateLimits` hook consumes this endpoint and expects `{ profiles: ProfileRateLimitState[] }` — keep the wrapper key consistent.
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/api build &amp;&amp; pnpm --filter @sms/api test posts-platform rate-limit-platform -- --run</automated>
  </verify>
  <acceptance_criteria>
    - `rg "linkedin_rate_limit_exceeded" packages/api/src/routes/posts.ts` returns >= 1 match
    - `rg "facebook_rate_limit_exceeded" packages/api/src/routes/posts.ts` returns >= 1 match
    - `rg "platform_immutable" packages/api/src/routes/posts.ts` returns >= 1 match
    - `rg "input.mediaIds.length \+ 1" packages/api/src/routes/posts.ts` returns >= 1 match (Pitfall 2 mitigation)
    - `rg "checkPlatformBudgetWithDb" packages/api/src/routes/posts.ts` returns >= 1 match
    - `rg "loadLinkedInUsage|loadFacebookUsage" packages/api/src/routes/rate-limit.ts` returns >= 2 matches
    - `rg "router.get\\('/api/rate-limit'" packages/api/src/routes/rate-limit.ts` returns >= 2 matches (one for `:profileId`, one for collection)
    - `pnpm --filter @sms/api test posts-platform rate-limit-platform -- --run` exits 0 (Plan 01 API tests flip GREEN)
  </acceptance_criteria>
  <done>POST /api/posts and PATCH /api/posts/:id branch on platform; pre-flight uses checkPlatformBudgetWithDb; 409 returns platform-specific codes. GET /api/rate-limit/:profileId returns single platform-discriminated body; GET /api/rate-limit returns `{ profiles: ProfileRateLimitState[] }` for the LIMIT-08 dashboard widget. Plan 01 API tests turn GREEN.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| HTTP request → API handler | Untrusted JSON body validated by discriminated union before handler logic |
| API handler → social_profiles row | profileId checked for ownership; platform mismatch rejected at insert/update |
| Concurrent requests → social_profiles counters | Single-statement CAS UPDATE prevents simultaneous pre-flights from both passing |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-API-01 | Tampering | server-side text limit | mitigate | Each variant in createPostSchema enforces `.max(LIMIT)` and `.refine` for code-point counting; route returns 400 before any DB write |
| T-API-02 | Tampering | rate-limit pre-flight race | mitigate | resetOrIncrementLinkedinWindow + resetOrIncrementFacebookWindow are single-statement CASE-WHEN UPDATEs with RETURNING; concurrent callers serialize on the row lock; the worker (Plan 04) calls these AFTER the API call succeeds, but the API pre-flight uses `checkPlatformBudgetWithDb` which compares against a snapshot — and the worker re-checks at runtime |
| T-API-03 | Tampering | strict discriminated union | mitigate | createPostSchema variants use `.strict()` (Plan 02); route uses `safeParse` and returns 400 on extra-key violations |
| T-DATA-01 | Tampering | denormalized posts.platform | mitigate | createPost reads social_profiles.platform and copies it to posts.platform; updatePost rejects platform changes with 409 platform_immutable |
| T-LIMITS-01 | Tampering | window reset atomicity | mitigate | Single SQL statement with CASE-WHEN for both reset and increment; no separate read-then-write loop. RETURNING confirms the row was found and the operation applied |
</threat_model>

<verification>
This plan is complete when:
1. `pnpm --filter @sms/api test posts-platform rate-limit-platform post-service-platform -- --run` is GREEN
2. POST /api/posts with platform=linkedin and oversize text returns 400 (T-API-01 verified end-to-end via supertest)
3. POST /api/posts with platform=linkedin and linkUrl extra field returns 400 (T-API-03)
4. POST /api/posts with platform at limit returns 409 + { code: 'linkedin_rate_limit_exceeded' | 'facebook_rate_limit_exceeded' }
5. GET /api/rate-limit/:profileId returns rateLimitStateSchema-conforming body for all three platforms
6. GET /api/rate-limit (collection) returns `{ profiles: [...] }` for the dashboard widget
7. PATCH /api/posts/:id with changed platform returns 409 + { code: 'platform_immutable' }
</verification>

<success_criteria>
- API package compiles cleanly (no `as` casts; union narrowing handles platform-only fields)
- Plan 01 API tests for posts-platform.test.ts, rate-limit-platform.test.ts, and post-service-platform.test.ts flip RED→GREEN
- Concurrent publish pre-flights cannot both pass (T-API-02 verified by integration test from Plan 01)
- post.service.ts denormalizes platform invariant; immutable on update (T-DATA-01); persists visibility/linkUrl directly into Plan-02 columns
- 409 response bodies conform exactly to LinkedInRateLimitExceededBody / FacebookRateLimitExceededBody types (no extra/missing fields)
- New GET /api/rate-limit collection endpoint exists and is consumed by Plan 05b's `useAllProfilesRateLimits` hook
</success_criteria>

<output>
After completion, create `.planning/phases/08-linkedin-facebook-post-creation/08-03-SUMMARY.md`
</output>
