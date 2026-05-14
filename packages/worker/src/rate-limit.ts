// Worker-side rate-limit wrapper. Mirrors @sms/api's rate-limit.service.ts
// but reads from the worker's own Drizzle client. Both code paths delegate
// to the SAME pure calculator in @sms/shared/rate-limit/check-budget — there
// is no worker-specific math. This file exists only so the worker never
// needs to import from @sms/api (revision Blocker 4 / T-04-03-10).
//
// Used by post-lifecycle.service during the runtime budget re-check (D-26,
// LIMIT-03). The check runs inside the SELECT FOR UPDATE transaction, so a
// budget_exhausted abort leaves the post in `scheduled` state for the next
// scanner pass to re-evaluate once the month rolls.

import { DateTime } from 'luxon';
import { sql, and, eq, gte, inArray } from 'drizzle-orm';
import { posts, socialProfiles } from '@sms/db';
import {
  checkTwitterBudget,
  checkLinkedInBudget,
  checkFacebookBudget,
  type BudgetCheckResult,
  type PlatformBudgetCheckResult,
  type PlatformBudgetSnapshot,
} from '@sms/shared';
import type { WorkerDb } from './db.js';

// D-21: only these statuses represent posts that actually consumed Twitter
// quota this month. Keep in lockstep with @sms/api rate-limit.service.ts.
const COUNTED_STATUSES = ['published', 'auto_destructing', 'destroyed'] as const;

export interface WorkerUsageSnapshot {
  currentUsage: number;
  monthlyBudget: number;
  warnThresholdPercent: number;
  monthStartUtc: Date;
}

export async function loadWorkerUsage(
  db: WorkerDb,
  profileId: string,
): Promise<WorkerUsageSnapshot> {
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

/** Runtime re-check for the publish worker (D-26 / LIMIT-03). */
export async function checkBudgetForWorker(
  db: WorkerDb,
  args: { profileId: string; additionalPostCount: number },
): Promise<BudgetCheckResult & { monthStartUtc: Date }> {
  const snapshot = await loadWorkerUsage(db, args.profileId);
  const projection = checkTwitterBudget({
    currentUsage: snapshot.currentUsage,
    monthlyBudget: snapshot.monthlyBudget,
    warnThresholdPercent: snapshot.warnThresholdPercent,
    additionalCount: args.additionalPostCount,
  });
  return { ...projection, monthStartUtc: snapshot.monthStartUtc };
}

// ============================================================================
// Phase 8 — per-platform window loaders + checkers (LIMIT-06, LIMIT-07)
// ============================================================================
//
// Mirrors the API-side rate-limit.service.ts loaders. Each loader applies the
// per-platform window expiry rule (UTC-midnight for LinkedIn, rolling-hour for
// Facebook) before returning the snapshot, so the pure calculator from
// @sms/shared sees a clean count of zero when the window has rolled.
//
// We deliberately duplicate this read logic instead of importing from @sms/api
// (revision Blocker 4 / T-04-03-10 — the worker must not depend on the API
// package). The math itself lives once in @sms/shared.

export interface PlatformWindowSnapshot {
  currentCount: number;
  limit: number;
  warnThresholdPercent: number;
  windowStartUtc: Date;
  windowResetAt: Date;
}

export async function loadLinkedInWindowUsage(
  db: WorkerDb,
  profileId: string,
  now: Date = new Date(),
): Promise<PlatformWindowSnapshot> {
  const [row] = await db
    .select({
      limit: socialProfiles.linkedinDailyLimit,
      count: socialProfiles.linkedinDailyCount,
      windowStart: socialProfiles.linkedinWindowStartUtc,
      warnThresholdPercent: socialProfiles.warnThresholdPercent,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));
  if (!row) throw new Error(`Profile ${profileId} not found`);

  const dayStart = DateTime.fromJSDate(now).toUTC().startOf('day').toJSDate();
  const isExpired = !row.windowStart || row.windowStart < dayStart;
  const nextDay = DateTime.fromJSDate(now)
    .toUTC()
    .startOf('day')
    .plus({ days: 1 })
    .toJSDate();
  return {
    currentCount: isExpired ? 0 : row.count,
    limit: row.limit,
    warnThresholdPercent: row.warnThresholdPercent ?? 80,
    windowStartUtc: !isExpired && row.windowStart ? row.windowStart : dayStart,
    windowResetAt: nextDay,
  };
}

export async function loadFacebookWindowUsage(
  db: WorkerDb,
  profileId: string,
  now: Date = new Date(),
): Promise<PlatformWindowSnapshot> {
  const [row] = await db
    .select({
      limit: socialProfiles.facebookHourlyLimit,
      count: socialProfiles.facebookHourlyCount,
      windowStart: socialProfiles.facebookWindowStartUtc,
      warnThresholdPercent: socialProfiles.warnThresholdPercent,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));
  if (!row) throw new Error(`Profile ${profileId} not found`);

  const hourThreshold = new Date(now.getTime() - 60 * 60 * 1000);
  const isExpired = !row.windowStart || row.windowStart < hourThreshold;
  const nextHour = DateTime.fromJSDate(now)
    .toUTC()
    .startOf('hour')
    .plus({ hours: 1 })
    .toJSDate();
  return {
    currentCount: isExpired ? 0 : row.count,
    limit: row.limit,
    warnThresholdPercent: row.warnThresholdPercent ?? 80,
    windowStartUtc: !isExpired && row.windowStart ? row.windowStart : now,
    windowResetAt: nextHour,
  };
}

export async function checkLinkedInBudgetForWorker(
  db: WorkerDb,
  args: { profileId: string; additionalCount: number; now?: Date },
): Promise<PlatformBudgetCheckResult & { snapshot: PlatformWindowSnapshot }> {
  const snapshot = await loadLinkedInWindowUsage(db, args.profileId, args.now);
  const inputs: PlatformBudgetSnapshot = {
    currentCount: snapshot.currentCount,
    limit: snapshot.limit,
    warnThresholdPercent: snapshot.warnThresholdPercent,
  };
  return { ...checkLinkedInBudget(inputs, args.additionalCount), snapshot };
}

export async function checkFacebookBudgetForWorker(
  db: WorkerDb,
  args: { profileId: string; additionalCount: number; now?: Date },
): Promise<PlatformBudgetCheckResult & { snapshot: PlatformWindowSnapshot }> {
  const snapshot = await loadFacebookWindowUsage(db, args.profileId, args.now);
  const inputs: PlatformBudgetSnapshot = {
    currentCount: snapshot.currentCount,
    limit: snapshot.limit,
    warnThresholdPercent: snapshot.warnThresholdPercent,
  };
  return { ...checkFacebookBudget(inputs, args.additionalCount), snapshot };
}
