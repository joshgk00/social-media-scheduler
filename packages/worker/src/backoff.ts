// Custom BullMQ backoff strategy for the publish worker (D-09, WORKER-04).
//
// Schedule: 30s → 5min → 30min → 30min (cap). With `attempts: 4` on the
// publish queue, that's initial + 3 retries = max total wait of ~36 minutes
// between the first failure and the final UnrecoverableError.
//
// Twitter Retry-After override: if the thrown error is a 429
// `ApiResponseError` carrying a `rateLimit.reset` UNIX timestamp in the
// future, we honor that timestamp (clamped to 30 min) instead of the static
// schedule. This prevents hammering Twitter while the monthly window resets.
//
// Registered inside the Worker constructor's `settings.backoffStrategy` —
// per RESEARCH.md Pitfall 4, registering this on the Queue has no effect.

import type { Job } from 'bullmq';
import { ApiResponseError } from 'twitter-api-v2';

const BACKOFF_SCHEDULE_MS = [30_000, 5 * 60_000, 30 * 60_000] as const;
const MAX_BACKOFF_MS = 30 * 60_000;

export type BackoffStrategy = (
  attemptsMade: number,
  type: string,
  err: Error,
  job: Job,
) => number;

export function buildBackoffStrategy(): BackoffStrategy {
  return (attemptsMade: number, _type: string, err: Error, _job: Job): number => {
    // BullMQ passes `attemptsMade` already incremented for the just-failed
    // attempt, so the first failure arrives with attemptsMade=1 — we want
    // to return the delay BEFORE attempt 2, which lives at schedule[0].
    const scheduleIndex = attemptsMade - 1;

    if (err instanceof ApiResponseError && err.rateLimitError && err.rateLimit) {
      const resetEpochMs = err.rateLimit.reset * 1000;
      const resetMs = resetEpochMs - Date.now();
      if (resetMs > 0) {
        return Math.min(resetMs, MAX_BACKOFF_MS);
      }
    }

    const scheduled = BACKOFF_SCHEDULE_MS[scheduleIndex];
    return scheduled ?? MAX_BACKOFF_MS;
  };
}
