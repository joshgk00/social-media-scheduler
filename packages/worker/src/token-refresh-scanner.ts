// Daily token-health scanner. Runs at 03:00 UTC (D-14), walks the
// social_profiles rows for LinkedIn + Facebook, applies the state-transition
// ladder, and enqueues one refresh-or-ping job per profile per UTC day.
//
// State-transition ladder (LinkedIn only — Facebook transitions happen in
// the worker after the /me ping resolves):
//   - tokenExpiresAt <= now          → UPDATE tokenStatus='expired'
//                                      WHERE tokenStatus != 'expired';
//                                      emit token_reauth_required if the
//                                      conditional UPDATE affected a row.
//                                      Do NOT enqueue refresh (useless).
//   - tokenExpiresAt <= now + 7d     → UPDATE tokenStatus='expiring'
//                                      WHERE tokenStatus='active';
//                                      emit token_expiring_soon once.
//                                      Always enqueue refresh (due).
//   - tokenExpiresAt > now + 7d      → skip (not due).
//
// Facebook: always enqueue refresh-or-ping. The worker does the /me ping
// and determines health.
//
// Dedupe contract: notifications fire ONLY when the conditional UPDATE
// flipped a row (rowsAffected === 1). Subsequent scanner runs that hit the
// same state are no-ops. RESEARCH Pitfall 6 covers this.
//
// Stable jobId: `refresh-${profileId}-${yyyymmdd}` ensures a scanner rerun
// inside the same UTC day is a no-op — BullMQ rejects the duplicate; we
// swallow it and log at debug.

import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { socialProfiles } from '@sms/db';
import { QUEUE_NAMES, JOB_NAMES, buildTokenRefreshJobId } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';

const logger = createLogger('token-refresh-scanner');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface StartTokenRefreshScannerDeps {
  redis: Redis;
}

export interface StartTokenRefreshScannerResult {
  tokenRefreshQueue: Queue;
}

export async function startTokenRefreshScanner(
  deps: StartTokenRefreshScannerDeps,
): Promise<StartTokenRefreshScannerResult> {
  const tokenRefreshQueue = new Queue(QUEUE_NAMES.tokenRefresh, {
    connection: deps.redis,
  });

  // Idempotent scheduler registration. BullMQ v5 handles dedupe by id.
  // `pattern` is 5-field cron (min hr day month dow) matching
  // `media-cleanup-worker.ts` — NOT the 6-field form with a seconds slot.
  await tokenRefreshQueue.upsertJobScheduler(
    'scan-token-health',
    { pattern: '0 3 * * *', tz: 'UTC' },
    {
      name: JOB_NAMES.scanTokenHealth,
      opts: {
        removeOnComplete: 24,   // keep the last 24 runs for debug
        removeOnFail: 168,      // keep 1 week of failures
        attempts: 1,            // scanner is idempotent; no retry
      },
    },
  );

  logger.info('Token refresh scanner registered: daily at 03:00 UTC');

  return { tokenRefreshQueue };
}

// --- scanTokenHealth body -------------------------------------------------

export interface ScanTokenHealthDeps {
  db: {
    select: (...args: unknown[]) => {
      from: (...args: unknown[]) => {
        where: (...args: unknown[]) => Promise<Array<{
          id: string;
          userId: string;
          platform: 'linkedin' | 'facebook' | string;
          tokenStatus: string;
          tokenExpiresAt: Date | null;
        }>>;
      };
    };
    update: (...args: unknown[]) => {
      set: (patch: Record<string, unknown>) => {
        where: (...args: unknown[]) => {
          returning: (...args: unknown[]) => Promise<Array<{ id: string }>>;
        };
      };
    };
  };
  tokenRefreshQueue: Pick<Queue, 'add'>;
  notificationQueue: Pick<Queue, 'add'>;
  now?: Date;
}

export interface ScanTokenHealthResult {
  scanned: number;
  enqueued: number;
  transitionsToExpiring: number;
}

export async function scanTokenHealth(
  deps: ScanTokenHealthDeps,
): Promise<ScanTokenHealthResult> {
  const now = deps.now ?? new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const sevenDaysOut = new Date(now.getTime() + SEVEN_DAYS_MS);

  // One SELECT for the whole batch — platform in {linkedin,facebook} and
  // tokenStatus in {active,expiring}. The scanner skips rows already in
  // expired/needs_reauth because they're terminal until user reconnects.
  const profiles = await deps.db
    .select({
      id: socialProfiles.id,
      userId: socialProfiles.userId,
      platform: socialProfiles.platform,
      tokenStatus: socialProfiles.tokenStatus,
      tokenExpiresAt: socialProfiles.tokenExpiresAt,
    })
    .from(socialProfiles)
    .where(
      and(
        inArray(socialProfiles.platform, ['linkedin', 'facebook']),
        inArray(socialProfiles.tokenStatus, ['active', 'expiring']),
      ),
    );

  let enqueued = 0;
  let transitionsToExpiring = 0;

  for (const profile of profiles) {
    try {
      if (profile.platform === 'linkedin') {
        const expiry = profile.tokenExpiresAt;
        if (!expiry) {
          logger.warn(
            { profileId: profile.id },
            'LinkedIn profile has null tokenExpiresAt; skipping',
          );
          continue;
        }

        const expiryMs = expiry.getTime();
        const nowMs = now.getTime();

        if (expiryMs <= nowMs) {
          // EXPIRED transition — conditional UPDATE so only the first
          // transition fires the notification.
          const updated = await deps.db
            .update(socialProfiles)
            .set({ tokenStatus: 'expired', updatedAt: now })
            .where(
              and(
                eq(socialProfiles.id, profile.id),
                sql`${socialProfiles.tokenStatus} <> 'expired'`,
              ),
            )
            .returning({ id: socialProfiles.id });

          if (updated.length === 1) {
            await emitNotification(deps.notificationQueue, {
              eventType: 'token_reauth_required',
              profileId: profile.id,
              userId: profile.userId,
              platform: 'linkedin',
              reason: 'Token expired',
              correlationId: `scan-${yyyymmdd}-${profile.id}`,
              occurredAt: now.toISOString(),
            }, JOB_NAMES.tokenReauthRequired);
          }
          // Do NOT enqueue refresh — token is unusable, user must reconnect.
          continue;
        }

        if (expiryMs <= sevenDaysOut.getTime()) {
          // EXPIRING transition — conditional UPDATE only flips active → expiring.
          const updated = await deps.db
            .update(socialProfiles)
            .set({ tokenStatus: 'expiring', updatedAt: now })
            .where(
              and(
                eq(socialProfiles.id, profile.id),
                eq(socialProfiles.tokenStatus, 'active'),
              ),
            )
            .returning({ id: socialProfiles.id });

          if (updated.length === 1) {
            transitionsToExpiring += 1;
            const daysLeft = Math.max(
              1,
              Math.ceil((expiryMs - nowMs) / (24 * 60 * 60 * 1000)),
            );
            await emitNotification(deps.notificationQueue, {
              eventType: 'token_expiring_soon',
              profileId: profile.id,
              userId: profile.userId,
              platform: 'linkedin',
              reason: `Token expiring in ${daysLeft} days`,
              correlationId: `scan-${yyyymmdd}-${profile.id}`,
              occurredAt: now.toISOString(),
            }, JOB_NAMES.tokenExpiringSoon);
          }

          // Always enqueue the refresh — the profile is within the refresh window.
          if (await enqueueRefreshJob(deps.tokenRefreshQueue, profile.id, yyyymmdd)) {
            enqueued += 1;
          }
          continue;
        }

        // Not yet due: token more than 7 days from expiry.
        continue;
      }

      if (profile.platform === 'facebook') {
        // Facebook has no deterministic expiry — always enqueue the health ping.
        if (await enqueueRefreshJob(deps.tokenRefreshQueue, profile.id, yyyymmdd)) {
          enqueued += 1;
        }
        continue;
      }

      // Any other platform shouldn't appear in the filtered query, but guard anyway.
      logger.warn(
        { profileId: profile.id, platform: profile.platform },
        'Unexpected platform in token-refresh scan; skipping',
      );
    } catch (err) {
      // Per-profile errors must not abort the batch — log and continue.
      logger.error(
        { err, profileId: profile.id, platform: profile.platform },
        'Scanner failed to process profile; continuing with next',
      );
    }
  }

  logger.info(
    { scanned: profiles.length, enqueued, transitionsToExpiring },
    'Token health scan completed',
  );

  return { scanned: profiles.length, enqueued, transitionsToExpiring };
}

async function emitNotification(
  queue: Pick<Queue, 'add'>,
  payload: {
    eventType: 'token_expiring_soon' | 'token_reauth_required' | 'token_refresh_failed' | 'token_revoked';
    profileId: string;
    userId: string;
    platform: 'linkedin' | 'facebook' | 'twitter';
    reason: string;
    correlationId: string;
    occurredAt: string;
  },
  jobName: string,
): Promise<void> {
  try {
    await queue.add(jobName, payload);
  } catch (err) {
    logger.error(
      { err, profileId: payload.profileId, eventType: payload.eventType },
      'Failed to enqueue token-lifecycle notification',
    );
  }
}

async function enqueueRefreshJob(
  queue: Pick<Queue, 'add'>,
  profileId: string,
  yyyymmdd: string,
): Promise<boolean> {
  const jobId = buildTokenRefreshJobId(profileId, yyyymmdd);
  try {
    await queue.add(
      JOB_NAMES.refreshOrPingToken,
      { profileId, correlationId: `scan-${yyyymmdd}-${profileId}` },
      { jobId },
    );
    return true;
  } catch (err) {
    // Most commonly: BullMQ rejects an identical jobId inside the same UTC
    // day. That's the intended dedupe — silent-skip with a debug log.
    logger.debug(
      { err, profileId, jobId },
      'token-refresh enqueue rejected (likely duplicate jobId — dedupe working)',
    );
    return false;
  }
}
