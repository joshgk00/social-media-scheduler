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

import {
  checkTwitterBudget,
  checkLinkedInBudget,
  checkFacebookBudget,
  type BudgetCheckResult,
  type PlatformBudgetCheckResult,
  type PlatformBudgetSnapshot,
} from '@sms/shared';
import {
  loadTwitterUsage as loadWorkerUsage,
  loadLinkedInWindowUsage,
  loadFacebookWindowUsage,
  type PlatformWindowSnapshot,
} from '@sms/shared/rate-limit/loaders';
import type { WorkerDb } from './db.js';

export { loadWorkerUsage };

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
// The DB read-side loaders live in @sms/shared so API and worker use the same
// quota windows without a package dependency on @sms/api.

export {
  loadLinkedInWindowUsage,
  loadFacebookWindowUsage,
  type PlatformWindowSnapshot,
};

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
