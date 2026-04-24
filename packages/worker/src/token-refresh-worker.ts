// BullMQ Worker that consumes the token-refresh queue. Dispatches jobs by
// platform:
//
//   • LinkedIn → POST /oauth/v2/accessToken with grant_type=refresh_token.
//     On 200, rewrite oauth2AccessToken* (ciphertext + iv + authTag) and
//     refresh the tokenExpiresAt / tokenStatus='active' / tokenHealthCheckedAt
//     columns. The refresh token ciphertext is deliberately NOT rewritten —
//     LinkedIn does NOT rotate refresh tokens (RESEARCH Pitfall 3). On 400
//     invalid_grant (or any other 4xx), throw UnrecoverableError so BullMQ
//     stops retrying and the .on('failed') listener flips to needs_reauth.
//     5xx / network → rethrow so BullMQ retries per backoff.
//
//   • Facebook → GET /me?fields=id with the stored page token. On ok:true,
//     just bump tokenHealthCheckedAt. On Graph error code:190, throw
//     UnrecoverableError (token invalidated). Other errors rethrow
//     (transient).
//
// Retry budget: attempts:4 + tokenRefreshBackoffStrategy (5min/30min/2hr).
// After exhaustion or UnrecoverableError, the .on('failed') listener runs:
//   UPDATE social_profiles SET tokenStatus='needs_reauth'
//                               WHERE id = $1 AND tokenStatus != 'needs_reauth'
//                               RETURNING id
//   If rowsAffected === 1, emit exactly ONE notification event
//   (token_refresh_failed for LinkedIn refresh exhaustion,
//    token_reauth_required for Facebook 190 / LinkedIn invalid_grant /
//    missing refresh token / cross-provider reauth needs). Subsequent
//    failures on the same already-needs_reauth profile are silent-skip
//    (rowsAffected === 0) — RESEARCH Pitfall 6.
//
// CREDENTIAL DISCIPLINE (SEC-04 / T-07-03 / T-07-04):
//   - Plaintext tokens live in function-local `const` only.
//   - Never logged. Child logger binds only profileId / correlationId /
//     jobId / platform / attempt.
//   - Never persisted unencrypted. Re-encryption happens in the same
//     function that decrypts.

import { Worker, UnrecoverableError, type Job, type Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { and, eq, sql } from 'drizzle-orm';
import { socialProfiles } from '@sms/db';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  type TokenNotificationEvent,
} from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import {
  decrypt,
  encrypt,
  validateEncryptionKey,
} from '@sms/shared/encryption';
import type { WorkerDb } from './db.js';
import { tokenRefreshBackoffStrategy } from './backoff.js';

// Re-export so callers (and tests asserting the strategy wiring) have a
// single well-known symbol to reference.
export { tokenRefreshBackoffStrategy };

const logger = createLogger('token-refresh-worker');

export interface RefreshOrPingTokenPayload {
  profileId: string;
  correlationId: string;
}

export interface TokenRefreshWorkerDeps {
  redis: Redis;
  db: WorkerDb;
  notificationQueue: Pick<Queue, 'add'>;
}

// Internal chainable shape used by the helpers — tests pass a stub typed
// as WorkerDb via `as never`, and at runtime the duck typing matches.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbLike = any;

export const TOKEN_REFRESH_CONFIG = {
  concurrency: 2,
  lockDuration: 60_000,           // 60s — HTTPS hop to LinkedIn can be slow
  stalledInterval: 30_000,
  maxStalledCount: 1,
  attempts: 4,                    // initial + 3 retries, per D-14
} as const;

export function createTokenRefreshWorker(
  deps: TokenRefreshWorkerDeps,
): Worker<RefreshOrPingTokenPayload> {
  const worker = new Worker<RefreshOrPingTokenPayload>(
    QUEUE_NAMES.tokenRefresh,
    async (job: Job<RefreshOrPingTokenPayload>) => {
      const jobLogger = logger.child({
        correlationId: job.data.correlationId,
        profileId: job.data.profileId,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
      });

      const profile = await loadProfile(deps.db, job.data.profileId);
      if (!profile) {
        jobLogger.warn('Profile not found; skipping');
        return;
      }

      jobLogger.info(
        { platform: profile.platform },
        'Processing token refresh/ping',
      );

      const platform = profile.platform as string;
      if (platform === 'linkedin') {
        await handleLinkedInRefresh(deps.db, profile);
      } else if (platform === 'facebook') {
        await handleFacebookPing(deps.db, profile);
      } else {
        jobLogger.warn({ platform }, 'Unsupported platform for token refresh');
      }
    },
    {
      connection: deps.redis,
      concurrency: TOKEN_REFRESH_CONFIG.concurrency,
      lockDuration: TOKEN_REFRESH_CONFIG.lockDuration,
      stalledInterval: TOKEN_REFRESH_CONFIG.stalledInterval,
      maxStalledCount: TOKEN_REFRESH_CONFIG.maxStalledCount,
      settings: {
        backoffStrategy: tokenRefreshBackoffStrategy,
      },
    },
  );

  // Failed listener fires on every job failure. We only act on terminal
  // failures: UnrecoverableError, or attemptsMade >= configured cap.
  worker.on('failed', async (job, err) => {
    if (!job) return;
    const attemptsCap = (job.opts?.attempts as number | undefined) ?? TOKEN_REFRESH_CONFIG.attempts;
    const isUnrecoverable =
      err instanceof UnrecoverableError || err?.name === 'UnrecoverableError';
    const isTerminal = isUnrecoverable || job.attemptsMade >= attemptsCap;
    if (!isTerminal) return;

    try {
      // Conditional UPDATE — only the first transition to needs_reauth
      // affects a row. Re-runs on an already-needs_reauth profile return
      // rowsAffected = 0 and we skip the notification.
      const updatedResult = deps.db
        .update(socialProfiles)
        .set({ tokenStatus: 'needs_reauth', updatedAt: new Date() })
        .where(
          and(
            eq(socialProfiles.id, job.data.profileId),
            sql`${socialProfiles.tokenStatus} <> 'needs_reauth'`,
          ),
        );
      // .returning() may be chained; handle both shapes tolerantly.
      const maybeWithReturning = updatedResult as unknown as {
        returning?: (cols?: unknown) => Promise<Array<{ id: string }>>;
      };
      const updated = maybeWithReturning.returning
        ? await maybeWithReturning.returning({ id: socialProfiles.id })
        : await (updatedResult as unknown as Promise<Array<{ id: string }>>);
      const rowsAffected = Array.isArray(updated) ? updated.length : 0;
      if (rowsAffected !== 1) return;

      // Load profile row just for the user/platform fields needed in payload.
      const profile = await loadProfile(deps.db, job.data.profileId);
      if (!profile) return;

      // LinkedIn refresh-specific exhaustion gets a dedicated event type so
      // Phase 9 can tailor email copy. Everything else is reauth_required.
      const isLinkedInRefreshFailure = profile.platform === 'linkedin' && !isUnrecoverable;
      const eventType: TokenNotificationEvent['eventType'] = isLinkedInRefreshFailure
        ? 'token_refresh_failed'
        : 'token_reauth_required';
      const jobName = isLinkedInRefreshFailure
        ? JOB_NAMES.tokenRefreshFailed
        : JOB_NAMES.tokenReauthRequired;

      const payload: TokenNotificationEvent = {
        eventType,
        profileId: String(profile.id),
        userId: String(profile.userId),
        platform: profile.platform as TokenNotificationEvent['platform'],
        reason: truncateReason(err?.message ?? 'Unknown error'),
        correlationId: job.data.correlationId,
        occurredAt: new Date().toISOString(),
      };

      await deps.notificationQueue.add(jobName, payload);
    } catch (emitErr) {
      logger.error(
        { err: emitErr, profileId: job.data.profileId },
        'Failed to emit terminal-failure notification',
      );
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Token refresh worker error event');
  });

  return worker;
}

// --- Helpers -------------------------------------------------------------

function truncateReason(raw: string): string {
  // Bounded reason string for notification payload — safety margin against
  // an unexpected error message carrying token-shaped substrings.
  return raw.length > 200 ? raw.slice(0, 200) : raw;
}

async function loadProfile(
  db: DbLike,
  profileId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select()
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));
  return rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
}

async function handleLinkedInRefresh(
  db: DbLike,
  profile: Record<string, unknown>,
): Promise<void> {
  const refreshCt = profile.oauth2RefreshTokenCiphertext as string | null;
  const refreshIv = profile.oauth2RefreshTokenIv as string | null;
  const refreshTag = profile.oauth2RefreshTokenAuthTag as string | null;

  if (!refreshCt || !refreshIv || !refreshTag) {
    throw new UnrecoverableError('no_refresh_token');
  }

  const encryptionKey = validateEncryptionKey(process.env.ENCRYPTION_KEY ?? '');
  const refreshToken = decrypt(refreshCt, refreshIv, refreshTag, encryptionKey);

  const response = await callLinkedInRefresh({
    refreshToken,
    clientId: process.env.LINKEDIN_CLIENT_ID ?? '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
  });

  // Re-encrypt new access token. Refresh token ciphertext remains UNCHANGED
  // (Pitfall 3 — LinkedIn does not rotate refresh tokens).
  const newAccessEnc = encrypt(response.access_token, encryptionKey);
  const now = new Date();
  const newExpiresAt = new Date(now.getTime() + response.expires_in * 1000);
  const newRefreshExpiresAt = response.refresh_token_expires_in
    ? new Date(now.getTime() + response.refresh_token_expires_in * 1000)
    : undefined;

  const patch: Record<string, unknown> = {
    oauth2AccessTokenCiphertext: newAccessEnc.ciphertext,
    oauth2AccessTokenIv: newAccessEnc.iv,
    oauth2AccessTokenAuthTag: newAccessEnc.authTag,
    tokenExpiresAt: newExpiresAt,
    tokenStatus: 'active',
    tokenHealthCheckedAt: now,
    updatedAt: now,
  };
  if (newRefreshExpiresAt) {
    patch.refreshTokenExpiresAt = newRefreshExpiresAt;
  }

  await db
    .update(socialProfiles)
    .set(patch)
    .where(eq(socialProfiles.id, profile.id as string));
}

async function handleFacebookPing(
  db: DbLike,
  profile: Record<string, unknown>,
): Promise<void> {
  const accessCt = profile.oauth2AccessTokenCiphertext as string | null;
  const accessIv = profile.oauth2AccessTokenIv as string | null;
  const accessTag = profile.oauth2AccessTokenAuthTag as string | null;

  if (!accessCt || !accessIv || !accessTag) {
    throw new UnrecoverableError('no_access_token');
  }

  const encryptionKey = validateEncryptionKey(process.env.ENCRYPTION_KEY ?? '');
  const accessToken = decrypt(accessCt, accessIv, accessTag, encryptionKey);

  const graphVersion = process.env.FACEBOOK_GRAPH_VERSION ?? 'v25.0';
  const result = await callFacebookPing({ pageToken: accessToken, graphVersion });

  if (result.ok) {
    await db
      .update(socialProfiles)
      .set({ tokenHealthCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(socialProfiles.id, profile.id as string));
    return;
  }

  if (result.errorCode === 190) {
    throw new UnrecoverableError('token_invalidated');
  }

  // Transient — let BullMQ retry per backoff.
  throw new Error(
    `Facebook ping transient failure: code=${result.errorCode ?? 'unknown'}`,
  );
}

// --- HTTP helpers (duplicated from packages/api/src/services/*.service.ts
//     until Plan 02 extracts them to @sms/shared — see Plan 07-03 Task 2
//     Action 2 for the consolidation plan) -----------------------------

interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

/**
 * Duplicated from (to-be-written) packages/api/src/services/linkedin.service.ts
 * per Plan 07-03 Task 2 — keep in sync. Phase 8 consolidation will move
 * both copies to @sms/shared/lib.
 */
async function callLinkedInRefresh(args: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: args.refreshToken,
    client_id: args.clientId,
    client_secret: args.clientSecret,
  });
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (res.ok) {
    const payload = (await res.json()) as Partial<LinkedInTokenResponse>;
    // WR-03: a partial 200 (proxy rewrite, malformed upstream) would otherwise
    // yield undefined fields — downstream `expires_in * 1000` becomes `NaN`,
    // and `encrypt(undefined)` fails obscurely after the existing refresh
    // token ciphertext was already decrypted. Throw as UnrecoverableError so
    // BullMQ doesn't burn retries on a structural mismatch.
    if (
      typeof payload?.access_token !== 'string' ||
      payload.access_token.length === 0 ||
      typeof payload?.expires_in !== 'number' ||
      !Number.isFinite(payload.expires_in) ||
      payload.expires_in <= 0 ||
      typeof payload?.refresh_token !== 'string' ||
      payload.refresh_token.length === 0
    ) {
      throw new UnrecoverableError(
        'LinkedIn refresh returned an unexpected token response shape',
      );
    }
    return payload as LinkedInTokenResponse;
  }

  // 400 and any other 4xx → permanent. Most commonly invalid_grant.
  if (res.status >= 400 && res.status < 500) {
    const detail = await res.text().catch(() => '');
    throw new UnrecoverableError(
      `LinkedIn refresh rejected (${res.status}): ${truncateReason(detail)}`,
    );
  }
  // 5xx → transient; BullMQ will retry.
  throw new Error(`LinkedIn refresh transient ${res.status}`);
}

/**
 * Duplicated from (to-be-written) packages/api/src/services/facebook.service.ts
 * per Plan 07-03 Task 2 — keep in sync.
 */
async function callFacebookPing(args: {
  pageToken: string;
  graphVersion: string;
}): Promise<{ ok: boolean; errorCode?: number }> {
  const url = new URL(`https://graph.facebook.com/${args.graphVersion}/me`);
  url.searchParams.set('fields', 'id');
  url.searchParams.set('access_token', args.pageToken);

  const res = await fetch(url);
  if (res.ok) return { ok: true };

  try {
    const body = (await res.json()) as { error?: { code: number } };
    return { ok: false, errorCode: body.error?.code };
  } catch {
    return { ok: false };
  }
}
