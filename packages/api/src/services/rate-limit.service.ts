import { DateTime } from 'luxon';
import { sql, and, eq, gte, inArray } from 'drizzle-orm';
import type { Db } from '@sms/db';
import { posts, socialProfiles } from '@sms/db';
import {
  checkTwitterBudget,
  checkBulkBudget,
  checkLinkedInBudget,
  checkFacebookBudget,
  type BudgetCheckResult,
  type PlatformBudgetCheckResult,
} from '@sms/shared';

// Thin DB-backed wrapper around the pure calculators in
// `@sms/shared/rate-limit/check-budget.ts`. The math lives in @sms/shared so
// the worker can import the same calculator directly without depending on
// @sms/api (revision Blocker 4 / T-04-02-07). This file only loads usage
// from Postgres, then delegates.
//
// IMPORTANT: These primitives do NOT verify that the caller owns the profile.
// Route handlers (Plan 04) MUST assert ownership before calling them —
// otherwise one authenticated user can probe another user's budget. This is
// tracked as T-04-02-06 in the plan's threat model.

// D-21: the monthly tweet counter is the count of posts transitioned into
// any "has-been-published" state this UTC calendar month. Scheduled, draft,
// and failed posts do NOT count — they never consumed the Twitter quota.
const COUNTED_STATUSES = ['published', 'auto_destructing', 'destroyed'] as const;

export interface UsageSnapshot {
  currentUsage: number;
  monthlyBudget: number;
  warnThresholdPercent: number;
  monthStartUtc: Date;
  /**
   * Start of the NEXT UTC calendar month — the moment the Twitter monthly
   * budget resets. Always strictly in the future relative to `now`. The
   * dashboard's "Resets …" row reads this, NOT `monthStartUtc` (which is the
   * start of the current window and would always render in the past).
   */
  monthResetAtUtc: Date;
}

/**
 * Load the live monthly usage counter for a single profile. Uses the
 * `posts_profile_status` composite index added in Phase 3.
 *
 * Throws if the profile does not exist. Callers that already verified
 * ownership can let the error propagate to the 404 handler; other callers
 * should catch and map it.
 *
 * `now` is injectable for deterministic unit tests; when omitted we read
 * the clock via Luxon so existing tests that pin `Settings.now` keep
 * working (production reads the wall clock).
 */
export async function loadTwitterUsage(
  db: Db,
  profileId: string,
  now?: Date,
): Promise<UsageSnapshot> {
  const nowUtc =
    now === undefined
      ? DateTime.utc()
      : DateTime.fromJSDate(now, { zone: 'utc' });
  const monthStartUtc = nowUtc.startOf('month').toJSDate();
  const monthResetAtUtc = nowUtc.startOf('month').plus({ months: 1 }).toJSDate();

  const [profileRow] = await db
    .select({
      monthlyBudget: socialProfiles.monthlyTweetBudget,
      warnThresholdPercent: socialProfiles.warnThresholdPercent,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));

  if (!profileRow) {
    throw new Error(`Profile ${profileId} not found`);
  }

  const [countRow] = await db
    .select({ publishedCount: sql<number>`count(*)::int` })
    .from(posts)
    .where(
      and(
        eq(posts.profileId, profileId),
        gte(posts.publishedAt, monthStartUtc),
        inArray(posts.status, [...COUNTED_STATUSES]),
      ),
    );

  return {
    currentUsage: Number(countRow?.publishedCount ?? 0),
    monthlyBudget: profileRow.monthlyBudget,
    warnThresholdPercent: profileRow.warnThresholdPercent,
    monthStartUtc,
    monthResetAtUtc,
  };
}

/**
 * Single-post publish pre-flight check (LIMIT-01/02/03/04).
 * Loads the live usage snapshot and delegates to the shared pure calculator.
 */
export async function checkTwitterBudgetWithDb(
  db: Db,
  args: { profileId: string; additionalPostCount: number; now?: Date },
): Promise<BudgetCheckResult & { monthStartUtc: Date; monthResetAtUtc: Date }> {
  const snapshot = await loadTwitterUsage(db, args.profileId, args.now);
  const result = checkTwitterBudget({
    currentUsage: snapshot.currentUsage,
    monthlyBudget: snapshot.monthlyBudget,
    warnThresholdPercent: snapshot.warnThresholdPercent,
    additionalCount: args.additionalPostCount,
  });
  return {
    ...result,
    monthStartUtc: snapshot.monthStartUtc,
    monthResetAtUtc: snapshot.monthResetAtUtc,
  };
}

/**
 * CSV bulk upload pre-flight check (LIMIT-05). Phase 10's CSV importer will
 * call this with `additionalCount = parsedRowCount` BEFORE inserting any
 * rows so an oversized batch is rejected upstream with a single 409 response
 * rather than creating half the posts and then blocking.
 */
export async function checkBulkBudgetWithDb(
  db: Db,
  args: { profileId: string; additionalCount: number; now?: Date },
): Promise<BudgetCheckResult & { monthStartUtc: Date; monthResetAtUtc: Date }> {
  const snapshot = await loadTwitterUsage(db, args.profileId, args.now);
  const result = checkBulkBudget({
    currentUsage: snapshot.currentUsage,
    monthlyBudget: snapshot.monthlyBudget,
    warnThresholdPercent: snapshot.warnThresholdPercent,
    additionalCount: args.additionalCount,
  });
  return {
    ...result,
    monthStartUtc: snapshot.monthStartUtc,
    monthResetAtUtc: snapshot.monthResetAtUtc,
  };
}

// ============================================================================
// Phase 8 — per-platform rate-limit loaders + atomic CAS increment
// ============================================================================
//
// LinkedIn (LIMIT-07): rolling daily window keyed off UTC midnight.
// Facebook (LIMIT-06): rolling 1-hour window (now - INTERVAL '1 hour').
//
// Both use a single `db.update().set({ ... sql\`CASE WHEN ... END\` })` so two
// concurrent pre-flights cannot both pass without one observing the other's
// counter bump (T-API-02 / T-LIMITS-01). The CASE-WHEN handles window reset
// AND increment atomically — the row lock held during the UPDATE serializes
// concurrent callers without an explicit transaction or advisory lock.

export interface LinkedInRateLimitExceededBody {
  code: 'linkedin_rate_limit_exceeded';
  limit: number;
  currentCount: number;
  windowResetAt: string; // ISO
}

export interface FacebookRateLimitExceededBody {
  code: 'facebook_rate_limit_exceeded';
  limit: number;
  currentCount: number;
  windowResetAt: string;
}

export interface TwitterBudgetExceededBody {
  code: 'twitter_budget_exceeded';
  budget: number;
  currentCount: number;
}

export type RateLimitExceededBody =
  | TwitterBudgetExceededBody
  | LinkedInRateLimitExceededBody
  | FacebookRateLimitExceededBody;

const DEFAULT_WARN_THRESHOLD_PERCENT = 80;

function utcDayStart(now: Date): Date {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  return dayStart;
}

function utcNextDayStart(now: Date): Date {
  const next = utcDayStart(now);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function rollingHourThreshold(now: Date): Date {
  return new Date(now.getTime() - 60 * 60 * 1000);
}

function nextHourTop(now: Date): Date {
  const top = new Date(now);
  top.setUTCMinutes(0, 0, 0);
  top.setUTCHours(top.getUTCHours() + 1);
  return top;
}

export interface PlatformRateLimitSnapshot {
  currentCount: number;
  limit: number;
  warnThresholdPercent: number;
  windowStartUtc: Date;
  windowResetAt: Date;
}

/**
 * LinkedIn daily-window loader (LIMIT-07). Returns the effective snapshot
 * after applying the UTC-midnight reset rule (Pitfall 7): a window stamped
 * before today's UTC midnight is treated as count=0 starting at today's
 * midnight.
 *
 * No DB write — this is the read-side companion to
 * `checkLinkedInBudgetWithDb`, used by the rate-limit GET endpoint.
 */
export async function loadLinkedInUsage(
  db: Db,
  profileId: string,
  now: Date = new Date(),
): Promise<PlatformRateLimitSnapshot> {
  const rows = await db
    .select({
      limit: socialProfiles.linkedinDailyLimit,
      count: socialProfiles.linkedinDailyCount,
      windowStart: socialProfiles.linkedinWindowStartUtc,
      warnThresholdPercent: socialProfiles.warnThresholdPercent,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));

  if (!rows || rows.length === 0) {
    throw new Error(`Profile ${profileId} not found`);
  }
  const row = rows[0];

  const dayStart = utcDayStart(now);
  const windowStart = row.windowStart;
  const isExpired = !windowStart || windowStart < dayStart;
  return {
    currentCount: isExpired ? 0 : row.count,
    limit: row.limit,
    warnThresholdPercent: row.warnThresholdPercent ?? DEFAULT_WARN_THRESHOLD_PERCENT,
    windowStartUtc: !isExpired && windowStart ? windowStart : dayStart,
    windowResetAt: utcNextDayStart(now),
  };
}

/**
 * Facebook hourly-window loader (LIMIT-06). Returns the effective snapshot
 * after applying the rolling-hour reset rule (Pitfall 6): a window stamped
 * more than an hour before `now` is treated as count=0 starting at `now`.
 */
export async function loadFacebookUsage(
  db: Db,
  profileId: string,
  now: Date = new Date(),
): Promise<PlatformRateLimitSnapshot> {
  const rows = await db
    .select({
      limit: socialProfiles.facebookHourlyLimit,
      count: socialProfiles.facebookHourlyCount,
      windowStart: socialProfiles.facebookWindowStartUtc,
      warnThresholdPercent: socialProfiles.warnThresholdPercent,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));

  if (!rows || rows.length === 0) {
    throw new Error(`Profile ${profileId} not found`);
  }
  const row = rows[0];

  const hourThreshold = rollingHourThreshold(now);
  const windowStart = row.windowStart;
  const isExpired = !windowStart || windowStart < hourThreshold;
  return {
    currentCount: isExpired ? 0 : row.count,
    limit: row.limit,
    warnThresholdPercent: row.warnThresholdPercent ?? DEFAULT_WARN_THRESHOLD_PERCENT,
    windowStartUtc: !isExpired && windowStart ? windowStart : now,
    windowResetAt: nextHourTop(now),
  };
}

export interface PlatformBudgetCheckOutcome extends PlatformBudgetCheckResult {
  /** Projected current count (snapshot.currentCount + additionalCount); NOT mutated in DB. */
  currentCount: number;
  /** Effective snapshot after window reset rules — useful for 409 bodies. */
  snapshot: PlatformRateLimitSnapshot;
}

/**
 * LinkedIn pre-flight (LIMIT-07). Read-only: loads the live snapshot
 * (applying the UTC-midnight reset rule via `loadLinkedInUsage`) and runs
 * the pure budget projection.
 *
 * Single-writer rule: only the worker's post-publish success path
 * (`packages/worker/src/post-lifecycle.service.ts` Phase 3) mutates
 * `linkedin_daily_count` / `linkedin_window_start_utc`. If the API also
 * incremented at schedule time, every scheduled post would be counted twice
 * (once at API pre-flight, once at worker publish), and drafts/cancelled
 * posts would permanently consume window capacity until reset.
 *
 * Race semantics: the API pre-flight is best-effort UX gating. The
 * authoritative race protection (T-API-02 / T-LIMITS-01) is the worker's
 * atomic CASE-WHEN UPDATE on publish — concurrent publishes serialize on
 * the row lock, and the worker's runtime re-check (`ctx.checkBudget` ->
 * `rate_limit_exhausted` abort) catches any post that slips past the
 * relaxed API pre-flight.
 */
export async function checkLinkedInBudgetWithDb(
  db: Db,
  args: { profileId: string; additionalCount: number; now?: Date },
): Promise<PlatformBudgetCheckOutcome> {
  const now = args.now ?? new Date();
  const snapshot = await loadLinkedInUsage(db, args.profileId, now);

  // Project the post-increment count for the budget decision.
  const projected = checkLinkedInBudget(
    {
      currentCount: snapshot.currentCount,
      limit: snapshot.limit,
      warnThresholdPercent: snapshot.warnThresholdPercent,
    },
    args.additionalCount,
  );

  // Read-only: counter mutation lives in the worker's success path (single
  // writer rule — see docstring). The window-expiry reset already happens
  // implicitly inside `loadLinkedInUsage`, which returns count=0 when the
  // stored window is older than today's UTC midnight.

  return {
    ...projected,
    currentCount: snapshot.currentCount + args.additionalCount,
    snapshot,
  };
}

/**
 * Facebook pre-flight (LIMIT-06). Read-only mirror of `checkLinkedInBudgetWithDb`
 * with rolling-hour window semantics instead of UTC-day. Same single-writer
 * rule applies: counter mutation lives only in the worker's success path.
 *
 * CRITICAL: callers must pass `mediaIds.length + 1` for multi-photo posts
 * because each photo POST counts against the hourly cap independently of
 * the final /feed call (Pitfall 2). For text-only or single-link posts,
 * pass 1.
 */
export async function checkFacebookBudgetWithDb(
  db: Db,
  args: { profileId: string; additionalCount: number; now?: Date },
): Promise<PlatformBudgetCheckOutcome> {
  const now = args.now ?? new Date();
  const snapshot = await loadFacebookUsage(db, args.profileId, now);

  const projected = checkFacebookBudget(
    {
      currentCount: snapshot.currentCount,
      limit: snapshot.limit,
      warnThresholdPercent: snapshot.warnThresholdPercent,
    },
    args.additionalCount,
  );

  // Read-only: same single-writer rule as the LinkedIn helper. The window
  // expiry reset already happens implicitly inside `loadFacebookUsage`,
  // which returns count=0 when the stored window is older than `now - 1h`.

  return {
    ...projected,
    currentCount: snapshot.currentCount + args.additionalCount,
    snapshot,
  };
}

/**
 * Platform dispatcher used by the POST /api/posts pre-flight. Twitter
 * delegates to the existing monthly-budget service; LinkedIn and Facebook
 * use the read-only per-platform pre-flights above.
 *
 * Returns a uniform shape: `blockThresholdHit` is the discriminator the
 * route reads to choose between 201 and 409. For Twitter, the legacy
 * service exposes `wouldExceed` instead — we surface both fields so callers
 * can use either name.
 */
export interface PlatformBudgetDispatchOutcome {
  blockThresholdHit: boolean;
  warnThresholdHit: boolean;
  /** Twitter monthly budget (when platform=twitter) — unset for LI/FB. */
  budget?: number;
  /** Twitter current usage (when platform=twitter) — unset for LI/FB. */
  currentUsage?: number;
  /** Per-window snapshot (when platform=linkedin|facebook) — unset for Twitter. */
  snapshot?: PlatformRateLimitSnapshot;
  /** Twitter warn threshold percent — used to enqueue warn notifications. */
  warnThresholdPercent?: number;
}

export async function checkPlatformBudgetWithDb(
  db: Db,
  args: {
    profileId: string;
    platform: 'twitter' | 'linkedin' | 'facebook';
    additionalCount: number;
    now?: Date;
  },
): Promise<PlatformBudgetDispatchOutcome> {
  if (args.platform === 'twitter') {
    const result = await checkTwitterBudgetWithDb(db, {
      profileId: args.profileId,
      additionalPostCount: args.additionalCount,
    });
    return {
      blockThresholdHit: result.wouldExceed,
      warnThresholdHit: result.warnThresholdHit,
      budget: result.budget,
      currentUsage: result.currentUsage,
      warnThresholdPercent: result.warnThresholdPercent,
    };
  }
  if (args.platform === 'linkedin') {
    const result = await checkLinkedInBudgetWithDb(db, {
      profileId: args.profileId,
      additionalCount: args.additionalCount,
      now: args.now,
    });
    return {
      blockThresholdHit: result.willExceed || result.blockThresholdHit,
      warnThresholdHit: result.warnThresholdHit,
      snapshot: result.snapshot,
      warnThresholdPercent: result.snapshot.warnThresholdPercent,
    };
  }
  // facebook
  const result = await checkFacebookBudgetWithDb(db, {
    profileId: args.profileId,
    additionalCount: args.additionalCount,
    now: args.now,
  });
  return {
    blockThresholdHit: result.willExceed || result.blockThresholdHit,
    warnThresholdHit: result.warnThresholdHit,
    snapshot: result.snapshot,
    warnThresholdPercent: result.snapshot.warnThresholdPercent,
  };
}
