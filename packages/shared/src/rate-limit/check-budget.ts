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
