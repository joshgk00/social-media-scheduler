// Pure rate-limit calculators. Given a snapshot of usage + budget, these
// functions project whether an additional batch of posts would breach the
// per-profile monthly Twitter budget. They perform NO I/O — no DB access,
// no Redis, no time math beyond what the caller passes in.
//
// Used by:
//   - @sms/api rate-limit.service.ts (DB-backed wrapper, LIMIT-01..04)
//   - @sms/worker post-lifecycle runtime re-check (D-26, LIMIT-03)
//   - @sms/api Phase 10 CSV bulk import (LIMIT-05) via checkBulkBudget
//
// This file lives in @sms/shared so the worker can import it WITHOUT a
// cross-package dependency on @sms/api. Revision Blocker 4 / T-04-02-07.

export interface BudgetCheckArgs {
  /** Number of posts already counted toward this billing cycle (D-21 query). */
  currentUsage: number;
  /** Profile's monthly budget cap (D-22, default 500). Must be > 0. */
  monthlyBudget: number;
  /** Percent at which a non-blocking warning surfaces (D-22, default 80, valid range 1-99). */
  warnThresholdPercent: number;
  /** How many additional posts the caller wants to add (1 for single post, N for CSV bulk). */
  additionalCount: number;
}

export interface BudgetCheckResult {
  currentUsage: number;
  budget: number;
  warnThresholdPercent: number;
  projectedCount: number;
  wouldExceed: boolean;
  warnThresholdHit: boolean;
  blockThresholdHit: boolean;
  /** Posts remaining BEFORE the additional batch is applied. Floors at 0. */
  remainingBudget: number;
}

/**
 * Single-post publish pre-flight check (LIMIT-01/02/03/04).
 * Pass `additionalCount = 1` for a normal publish, or `additionalCount = 0`
 * to snapshot current state without projecting an addition.
 */
export function checkTwitterBudget(args: BudgetCheckArgs): BudgetCheckResult {
  const projectedCount = args.currentUsage + args.additionalCount;
  const warnThreshold = Math.floor(
    args.monthlyBudget * (args.warnThresholdPercent / 100),
  );
  return {
    currentUsage: args.currentUsage,
    budget: args.monthlyBudget,
    warnThresholdPercent: args.warnThresholdPercent,
    projectedCount,
    wouldExceed: projectedCount > args.monthlyBudget,
    warnThresholdHit: projectedCount >= warnThreshold,
    blockThresholdHit: projectedCount >= args.monthlyBudget,
    remainingBudget: Math.max(0, args.monthlyBudget - args.currentUsage),
  };
}

/**
 * CSV bulk upload pre-flight check (LIMIT-05). Semantic alias for
 * `checkTwitterBudget` — the math is identical. The alias exists so the
 * Phase 10 CSV importer has a clear contract to wire against: load
 * `currentUsage` from the DB, then call this with
 * `additionalCount = csvRowCount` BEFORE inserting any rows.
 */
export function checkBulkBudget(args: BudgetCheckArgs): BudgetCheckResult {
  return checkTwitterBudget(args);
}

// ── LinkedIn / Facebook per-window budget calculators (LIMIT-06, LIMIT-07) ──
//
// Same pure-calculator pattern as `checkTwitterBudget` but keyed off the rolling
// window snapshot the worker reads from `social_profiles` (windowStartUtc +
// currentCount + limit). The DB-layer wrapper (Plan 03) does the atomic CAS
// UPDATE; these helpers project whether an additional N calls would breach.

export interface PlatformBudgetSnapshot {
  /** Number of API calls already counted in the current window. */
  currentCount: number;
  /** Window cap (LinkedIn ~100/day, Facebook 200/hour). Must be > 0. */
  limit: number;
  /** Percent at which a non-blocking warning surfaces (1-99). */
  warnThresholdPercent: number;
}

export interface PlatformBudgetCheckResult {
  willExceed: boolean;
  blockThresholdHit: boolean;
  warnThresholdHit: boolean;
  projectedCount: number;
  /** Integer percentage of the limit consumed after the projected calls. */
  percent: number;
}

export interface FacebookPublishApiCallMedia {
  kind?: string | null;
  mimeType?: string | null;
}

function resolveFacebookMediaKind(
  media: FacebookPublishApiCallMedia,
): 'image' | 'video' | 'gif' | 'other' {
  if (media.kind === 'image' || media.kind === 'video' || media.kind === 'gif') {
    return media.kind;
  }
  const mimeType = media.mimeType ?? '';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  return 'other';
}

export function countFacebookPublishApiCalls(
  media: readonly FacebookPublishApiCallMedia[] = [],
): number {
  if (media.some((item) => resolveFacebookMediaKind(item) === 'video')) {
    return 1;
  }

  // Facebook GIF uploads use the video pipeline, so they intentionally stay
  // out of the multi-photo upload count and cost a single API call.
  const imageCount = media.filter(
    (item) => resolveFacebookMediaKind(item) === 'image',
  ).length;
  return imageCount + 1;
}

/**
 * LinkedIn rolling-day budget pre-flight check (LIMIT-07).
 * `additionalCallCount` is normally 1 because LinkedIn /rest/posts is a single
 * API call per share (image uploads via /rest/images count separately, but
 * Plan 04's worker increments the counter per /rest/posts call only).
 */
export function checkLinkedInBudget(
  snapshot: PlatformBudgetSnapshot,
  additionalCallCount: number,
): PlatformBudgetCheckResult {
  return computePlatformBudget(snapshot, additionalCallCount);
}

/**
 * Facebook rolling-hour budget pre-flight check (LIMIT-06).
 *
 * CRITICAL: callers should pass `countFacebookPublishApiCalls(media)` so video
 * posts count as the single `/videos` request, while multi-photo posts count
 * each photo upload plus the final `/feed` call (Pitfall 2 in 08-RESEARCH.md).
 */
export function checkFacebookBudget(
  snapshot: PlatformBudgetSnapshot,
  additionalCallCount: number,
): PlatformBudgetCheckResult {
  return computePlatformBudget(snapshot, additionalCallCount);
}

function computePlatformBudget(
  snapshot: PlatformBudgetSnapshot,
  additionalCallCount: number,
): PlatformBudgetCheckResult {
  const projectedCount = snapshot.currentCount + additionalCallCount;
  const percent =
    snapshot.limit > 0
      ? Math.round((projectedCount / snapshot.limit) * 100)
      : 0;
  return {
    willExceed: projectedCount > snapshot.limit,
    blockThresholdHit: projectedCount >= snapshot.limit,
    warnThresholdHit: percent >= snapshot.warnThresholdPercent,
    projectedCount,
    percent,
  };
}
