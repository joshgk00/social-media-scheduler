import { DateTime } from 'luxon';
import { sql, and, eq, gte, inArray } from 'drizzle-orm';
import type { Db } from '@sms/db';
import { posts, socialProfiles } from '@sms/db';
import {
  checkTwitterBudget,
  checkBulkBudget,
  type BudgetCheckResult,
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
}

/**
 * Load the live monthly usage counter for a single profile. Uses the
 * `posts_profile_status` composite index added in Phase 3.
 *
 * Throws if the profile does not exist. Callers that already verified
 * ownership can let the error propagate to the 404 handler; other callers
 * should catch and map it.
 */
export async function loadTwitterUsage(
  db: Db,
  profileId: string,
): Promise<UsageSnapshot> {
  const monthStartUtc = DateTime.utc().startOf('month').toJSDate();

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
  };
}

/**
 * Single-post publish pre-flight check (LIMIT-01/02/03/04).
 * Loads the live usage snapshot and delegates to the shared pure calculator.
 */
export async function checkTwitterBudgetWithDb(
  db: Db,
  args: { profileId: string; additionalPostCount: number },
): Promise<BudgetCheckResult & { monthStartUtc: Date }> {
  const snapshot = await loadTwitterUsage(db, args.profileId);
  const result = checkTwitterBudget({
    currentUsage: snapshot.currentUsage,
    monthlyBudget: snapshot.monthlyBudget,
    warnThresholdPercent: snapshot.warnThresholdPercent,
    additionalCount: args.additionalPostCount,
  });
  return { ...result, monthStartUtc: snapshot.monthStartUtc };
}

/**
 * CSV bulk upload pre-flight check (LIMIT-05). Phase 10's CSV importer will
 * call this with `additionalCount = parsedRowCount` BEFORE inserting any
 * rows so an oversized batch is rejected upstream with a single 409 response
 * rather than creating half the posts and then blocking.
 */
export async function checkBulkBudgetWithDb(
  db: Db,
  args: { profileId: string; additionalCount: number },
): Promise<BudgetCheckResult & { monthStartUtc: Date }> {
  const snapshot = await loadTwitterUsage(db, args.profileId);
  const result = checkBulkBudget({
    currentUsage: snapshot.currentUsage,
    monthlyBudget: snapshot.monthlyBudget,
    warnThresholdPercent: snapshot.warnThresholdPercent,
    additionalCount: args.additionalCount,
  });
  return { ...result, monthStartUtc: snapshot.monthStartUtc };
}
