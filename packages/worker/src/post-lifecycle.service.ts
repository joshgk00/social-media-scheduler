// Publish lifecycle orchestrator. Given a postId + expected version, runs
// the transactional state machine that takes a `scheduled` post through
// `publishing` → `published`, writing `post_attempts` rows along the way.
//
// Core invariants (enforced by tests in __tests__/post-lifecycle.test.ts):
//   1. Idempotency: if `platform_post_id` is already set, abort with
//      `already_published` and never call Twitter (WORKER-06, T-04-03-03).
//   2. Optimistic lock: if the expected version doesn't match, abort with
//      `version_mismatch`. The scanner re-enqueues with the new version.
//   3. Runtime budget re-check: if the profile has breached its monthly
//      cap since the scheduler last checked, abort with `budget_exhausted`
//      and leave the post in `scheduled` (D-26 / LIMIT-03).
//   4. Row lock is released BEFORE the Twitter call: the transaction
//      closes after transitioning to `publishing`. The network call runs
//      outside the transaction so we don't serialize workers behind a
//      2-second HTTPS round trip. Correctness is preserved by (a) the
//      `publishing` state being visible to other sessions and (b) the
//      unique index on `platform_post_id` as a hard backstop.
//
// On Twitter failure, `recordFailureAttempt` writes the `post_attempts` row
// with a classified error, transitions the post to `failed` if permanent,
// and rethrows the ORIGINAL error so the publish-worker's classifier and
// the BullMQ backoff see the real error shape. Per RESEARCH.md Pitfall 8,
// we persist the classification BEFORE the classifier-driven
// UnrecoverableError replaces the error object.

import { sql, eq, and, isNull, inArray } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { posts, postAttempts, socialProfiles, postMedia } from '@sms/db';
import {
  JOB_NAMES,
  type TokenNotificationEvent,
} from '@sms/shared';
import { classifyTwitterError, type ClassifiedError } from '@sms/shared/lib/error-classifier';
import { createLogger } from '@sms/shared/logger';
import type { WorkerDb } from './db.js';

const logger = createLogger('post-lifecycle');

// UTC midnight of "today" — the LinkedIn daily window resets here per
// LIMIT-07. Mirrors the same helper used in @sms/api rate-limit.service.ts.
function utcDayStart(now: Date = new Date()): Date {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  return dayStart;
}

export type LifecycleAbortReason =
  | 'version_mismatch'
  | 'already_published'
  | 'not_scheduled'
  | 'budget_exhausted'
  | 'thread_unsupported'
  | 'media_pending'
  | 'token_unhealthy'
  // Phase 8 (D-05, D-07): per-platform rate-limit pre-flight failed. Mirrors
  // budget_exhausted (Twitter) — post stays in `scheduled`, no retry budget
  // consumed, scanner re-evaluates once the platform window resets.
  | 'rate_limit_exhausted';

export class PostLifecycleAbort extends Error {
  constructor(public readonly reason: LifecycleAbortReason) {
    super(`PostLifecycleAbort: ${reason}`);
    this.name = 'PostLifecycleAbort';
  }
}

export interface LifecyclePost {
  id: string;
  text: string;
  isThread: boolean;
  status: string;
  postVersion: number;
  platformPostId: string | null;
  profileId: string | null;
}

export interface PublishContext {
  postId: string;
  expectedVersion: number;
  correlationId: string;
  currentAttemptNum: number;
  callTwitter: (
    profile: typeof socialProfiles.$inferSelect,
    postText: string,
    isThread: boolean,
    // Phase 8: typed columns flowed through so the publish-worker's platform
    // dispatcher can branch to LinkedIn / Facebook without a second SELECT.
    // Backward-compatible — Twitter callbacks ignore these.
    extras?: {
      platform: string | null;
      visibility: string | null;
      linkUrl: string | null;
    },
  ) => Promise<{ platformPostId: string }>;
  // Phase 8 (D-05, D-07): callers may now annotate the result with the
  // platform whose window was checked. When `platform` is `linkedin` or
  // `facebook` AND `blockThresholdHit` is true, the lifecycle aborts with
  // `rate_limit_exhausted` instead of `budget_exhausted` — same graceful-
  // skip semantics, distinct enum so the dashboard can route correctly.
  checkBudget: (
    profileId: string,
  ) => Promise<{
    wouldExceed: boolean;
    blockThresholdHit?: boolean;
    platform?: 'twitter' | 'linkedin' | 'facebook';
  }>;
  // Phase 07-04 (TOKEN-04): the failure path emits `token_revoked`
  // notifications AFTER the permanent_fail transaction commits so an orphan
  // notification can never escape a rolled-back state change.
  notificationQueue?: Queue;
}

export interface PublishResult {
  platformPostId: string;
}

// Raw row shape returned from the SELECT FOR UPDATE join. Uses snake_case
// because we bypass drizzle's column mapping to run the FOR UPDATE lock.
// Index signature is required by drizzle's `execute<T>` generic constraint.
interface LockedPostRow extends Record<string, unknown> {
  id: string;
  text: string;
  is_thread: boolean;
  status: string;
  post_version: number;
  platform_post_id: string | null;
  profile_id: string | null;
  // Phase 8: typed columns added by Plan 02 — read directly from the locked
  // row so the platform dispatcher (publish-worker) doesn't need a second
  // round-trip. Falls back to the joined profile.platform when null (legacy
  // rows pre-dating the denormalization migration).
  platform: string | null;
  visibility: string | null;
  link_url: string | null;
}

export async function publishPost(
  db: WorkerDb,
  ctx: PublishContext,
): Promise<PublishResult> {
  const lifecycleLogger = logger.child({
    postId: ctx.postId,
    correlationId: ctx.correlationId,
    attempt: ctx.currentAttemptNum,
  });

  const attemptStart = new Date();

  // PHASE 1 — transactional lock, version/state checks, transition to publishing.
  // `recoveryPlatformPostId` is set only on the issue #17 recovery path: a
  // prior attempt's pre-write committed but Phase 3 rolled back, leaving the
  // row as `status='publishing'` with `platform_post_id` populated. In that
  // case we skip Phase 2 (Twitter call) and resume directly from Phase 3
  // using the stored marker so the post can complete normally.
  let lockedProfile: typeof socialProfiles.$inferSelect;
  let lockedPost: LockedPostRow;
  let recoveryPlatformPostId: string | null = null;
  try {
    const result = await db.transaction(async (tx) => {
      const lockedRows = await tx.execute<LockedPostRow>(sql`
        SELECT id,
               text,
               is_thread,
               status,
               post_version,
               platform_post_id,
               profile_id,
               platform,
               visibility,
               link_url
          FROM posts
         WHERE id = ${ctx.postId}
           FOR UPDATE
      `);

      const lockedRowsArray = Array.isArray(lockedRows)
        ? (lockedRows as LockedPostRow[])
        : ((lockedRows as unknown as { rows?: LockedPostRow[] }).rows ?? []);
      const [post] = lockedRowsArray;
      if (!post) {
        throw new PostLifecycleAbort('not_scheduled');
      }

      // IDEMPOTENCY (T-04-03-03 primary guard): platform_post_id is set, so
      // the tweet exists on Twitter. There are two distinct sub-cases now
      // (issue #17): a TRUE idempotent retry of a fully-committed publish,
      // and a RECOVERY from a prior attempt where the pre-write of
      // platform_post_id committed but the Phase 3 transaction rolled back.
      //
      //   - status='published'  → Phase 3 already committed. Skip everything.
      //   - status='publishing' → recovery. Pre-write happened, Phase 3 did
      //                           not. Skip Phase 2 (the tweet is already
      //                           live), preserve the platform_post_id, and
      //                           let the rest of the function run Phase 3
      //                           to record the success attempt, transition
      //                           to 'published', and bump the platform
      //                           counter. Without this branch the post
      //                           would be permanently stranded.
      //   - any other status    → corrupted state (shouldn't be reachable).
      //                           Treat as true idempotent skip — safer than
      //                           risking a duplicate tweet by re-publishing.
      if (post.platform_post_id) {
        if (post.status === 'publishing') {
          lifecycleLogger.info(
            { platformPostId: post.platform_post_id },
            'Recovery from prior issue-#17 pre-write — Phase 3 will resume',
          );
          // Do NOT throw. Skip the version check (post_version is stable
          // across the same job's retries; recovery is by definition the
          // same logical attempt continued) and skip the transition (status
          // is already 'publishing'). Fall through to load the profile and
          // return with recoveryPlatformPostId populated.
        } else {
          lifecycleLogger.info(
            { platformPostId: post.platform_post_id, status: post.status },
            'Idempotent skip — post already has platform_post_id',
          );
          throw new PostLifecycleAbort('already_published');
        }
      }

      // Skip version/state checks on the recovery path — by definition the
      // post is already 'publishing' with a stable version from the prior
      // attempt under the same job/lock chain.
      const isRecovery = post.platform_post_id !== null && post.status === 'publishing';
      if (!isRecovery) {
        if (post.post_version !== ctx.expectedVersion) {
          lifecycleLogger.info(
            { expectedVersion: ctx.expectedVersion, actualVersion: post.post_version },
            'Version mismatch — scanner will re-enqueue',
          );
          throw new PostLifecycleAbort('version_mismatch');
        }

        if (post.status !== 'scheduled') {
          lifecycleLogger.info(
            { actualStatus: post.status },
            'Post no longer in scheduled state — aborting',
          );
          throw new PostLifecycleAbort('not_scheduled');
        }
      }

      // Phase 4 single-tweet scope: reject thread posts inside the transaction
      // so they stay in `scheduled` for Phase 4.5.
      if (post.is_thread) {
        throw new PostLifecycleAbort('thread_unsupported');
      }

      if (!post.profile_id) {
        throw new PostLifecycleAbort('not_scheduled');
      }

      // Recovery path skips budget / media-readiness / token-health / status
      // transition — those preconditions were validated on the original
      // attempt; the tweet is already live. We still load the profile so
      // Phase 3's counter-bump branch has the data it needs.
      if (!isRecovery) {
        // D-26 runtime budget re-check (LIMIT-03): leaves post scheduled so
        // the scanner re-evaluates once the month boundary resets. Phase 8
        // (D-05 / D-07 / LIMIT-06 / LIMIT-07): the worker-side checker
        // returns the platform discriminator so non-twitter posts that hit
        // the per-platform window emit `rate_limit_exhausted` rather than
        // `budget_exhausted` — same graceful-skip semantics, distinct enum.
        const budget = await ctx.checkBudget(post.profile_id);
        const isPlatformRateLimit =
          (budget.platform === 'linkedin' || budget.platform === 'facebook') &&
          budget.blockThresholdHit === true;
        if (isPlatformRateLimit) {
          await tx.insert(postAttempts).values({
            postId: ctx.postId,
            attemptNum: ctx.currentAttemptNum,
            startedAt: attemptStart,
            finishedAt: new Date(),
            outcome: 'cancelled',
            errorCode: 'rate_limit_exhausted',
            errorMessage: `${budget.platform} rate limit reached`,
          });
          lifecycleLogger.warn(
            { platform: budget.platform },
            'Rate limit exhausted at runtime — leaving post scheduled',
          );
          throw new PostLifecycleAbort('rate_limit_exhausted');
        }
        if (budget.wouldExceed) {
          lifecycleLogger.warn('Budget exhausted at runtime — leaving post scheduled');
          throw new PostLifecycleAbort('budget_exhausted');
        }

        // MEDIA-05: Skip posts with media still being transcoded (T-06-11).
        const pendingMedia = await tx
          .select({ count: sql<string>`COUNT(*)::text` })
          .from(postMedia)
          .where(
            and(
              eq(postMedia.postId, ctx.postId),
              isNull(postMedia.deletedAt),
              inArray(postMedia.transcodeStatus, ['pending', 'processing']),
            ),
          );
        const pendingMediaCount = parseInt(pendingMedia[0]?.count ?? '0', 10);
        if (pendingMediaCount > 0) {
          lifecycleLogger.info(
            { postId: ctx.postId, pendingMediaCount },
            'Skipping publish -- media still transcoding',
          );
          throw new PostLifecycleAbort('media_pending');
        }
      }

      // Load the full profile row — the twitter publish service needs the
      // encrypted token columns (fresh path) and Phase 3 needs the platform
      // discriminator (both paths). Done inside the transaction so we see a
      // consistent view of the profile alongside the post.
      const [profile] = await tx
        .select()
        .from(socialProfiles)
        .where(eq(socialProfiles.id, post.profile_id));
      if (!profile) {
        throw new PostLifecycleAbort('not_scheduled');
      }

      if (!isRecovery) {
        // TOKEN-05 (D-18/D-19) token-health pre-flight. Mirrors the budget
        // pre-flight pattern above — abort BEFORE transitioning to
        // `publishing` so the post stays in `scheduled` and the scanner
        // re-enqueues once the user Reconnects. A cancelled attempt row
        // records the reason for the SCHED-04 history modal; no notification
        // is emitted here (RESEARCH Pitfall 6 — notifications fire at the
        // state-transition site, not for every blocked publish attempt
        // against the dead token).
        if (profile.tokenStatus !== 'active') {
          await tx.insert(postAttempts).values({
            postId: ctx.postId,
            attemptNum: ctx.currentAttemptNum,
            startedAt: attemptStart,
            finishedAt: new Date(),
            outcome: 'cancelled',
            errorCode: 'token_unhealthy',
            errorMessage: `Profile token status: ${profile.tokenStatus}`,
          });
          lifecycleLogger.warn(
            { profileId: profile.id, tokenStatus: profile.tokenStatus },
            'Publish aborted — profile token status is not active',
          );
          throw new PostLifecycleAbort('token_unhealthy');
        }

        // Transition scheduled → publishing, guarded by the optimistic
        // version check so a concurrent edit still loses the race cleanly.
        const [updatedRow] = await tx
          .update(posts)
          .set({ status: 'publishing', updatedAt: new Date() })
          .where(
            and(eq(posts.id, ctx.postId), eq(posts.postVersion, ctx.expectedVersion)),
          )
          .returning({ id: posts.id });

        if (!updatedRow) {
          throw new PostLifecycleAbort('version_mismatch');
        }
      }

      return {
        post,
        profile,
        recoveryPlatformPostId: isRecovery ? post.platform_post_id : null,
      };
    });
    lockedPost = result.post;
    lockedProfile = result.profile;
    recoveryPlatformPostId = result.recoveryPlatformPostId;
  } catch (err) {
    // Abort errors are expected control flow — propagate without wrapping.
    if (err instanceof PostLifecycleAbort) {
      throw err;
    }
    lifecycleLogger.error({ err }, 'Lifecycle lock transaction failed');
    throw err;
  }

  // PHASE 2 + crash-safe pre-write (issue #17).
  //
  // Fresh attempt: call Twitter, then persist platform_post_id in a
  // standalone UPDATE BEFORE the Phase 3 transaction so a BullMQ retry
  // after a Phase 3 failure can recover (Phase 1 of the retry will see the
  // marker and route through the recovery branch above instead of
  // re-tweeting).
  //
  // Recovery attempt: Phase 1 detected status='publishing' + platform_post_id
  // set, meaning the prior attempt got past the pre-write but Phase 3
  // rolled back. The tweet is already live. Skip the Twitter call AND the
  // pre-write (idempotent — the marker is already on the row) and continue
  // straight to Phase 3 with the recovered id.
  let platformPostId: string;
  if (recoveryPlatformPostId !== null) {
    platformPostId = recoveryPlatformPostId;
    lifecycleLogger.info(
      { platformPostId },
      'Resuming from issue-#17 recovery — Twitter call and pre-write skipped, advancing to Phase 3',
    );
  } else {
    // PHASE 2 — Twitter call OUTSIDE the transaction. Long-held locks across
    // a network round trip would serialize the entire worker pool.
    try {
      const callResult = await ctx.callTwitter(
        lockedProfile,
        lockedPost.text,
        lockedPost.is_thread,
        {
          platform: lockedPost.platform,
          visibility: lockedPost.visibility,
          linkUrl: lockedPost.link_url,
        },
      );
      platformPostId = callResult.platformPostId;
    } catch (twitterErr) {
      const classification = classifyTwitterError(twitterErr);
      await recordFailureAttempt(db, {
        postId: ctx.postId,
        profileId: lockedProfile.id,
        userId: lockedProfile.userId,
        platform: lockedProfile.platform,
        attemptNum: ctx.currentAttemptNum,
        attemptStart,
        classification,
        correlationId: ctx.correlationId,
        notificationQueue: ctx.notificationQueue,
      }).catch((writeErr) => {
        // Never let a failure-attempt write swallow the original error.
        lifecycleLogger.error(
          { err: writeErr },
          'Failed to persist post_attempts row for transient/permanent failure',
        );
      });
      throw twitterErr;
    }

    // CRASH-SAFE IDEMPOTENCY MARKER (issue #17). See the recovery branch in
    // Phase 1 (`isRecovery`) for the matching read path.
    //
    // If THIS update fails, BullMQ retries; the retry's Phase 1 lock load
    // won't see platform_post_id and will proceed to a duplicate tweet,
    // which Twitter's own duplicate-content rejection (code 187) catches
    // for identical text within a short window. There's no unique-index
    // on platform_post_id today to act as a database-side backstop, so
    // the log line below is the operator's only signal that this window
    // was hit. The duplicate-tweet risk here is narrower than the
    // pre-fix Phase-3-rollback window the issue documents.
    //
    // Operators distinguish:
    //   - "tweet live + Phase 3 rolled back"  (retry safe, marker persisted; recovery branch will complete it)
    //   - "tweet live + pre-write failed"     (retry MAY duplicate; rely on Twitter-side duplicate detection)
    // by reading log lines.
    lifecycleLogger.info(
      { platformPostId },
      'Tweet posted — persisting idempotency marker before Phase 3 commit',
    );
    try {
      await db
        .update(posts)
        .set({ platformPostId, updatedAt: new Date() })
        .where(eq(posts.id, ctx.postId));
    } catch (prewriteErr) {
      // Intentionally surface (don't swallow): BullMQ must retry.
      lifecycleLogger.error(
        { err: prewriteErr, platformPostId },
        'CRITICAL: tweet posted but pre-write of platform_post_id failed — retry may duplicate, rely on Twitter duplicate-content rejection',
      );
      throw prewriteErr;
    }
    lifecycleLogger.info(
      { platformPostId },
      'Idempotency marker persisted — Phase 3 commit may now retry safely',
    );
  }

  // PHASE 3 — success: insert attempt row + transition to published + advance
  // per-platform window counter atomically (T-API-02 / T-LIMITS-01).
  await db.transaction(async (tx) => {
    await tx.insert(postAttempts).values({
      postId: ctx.postId,
      attemptNum: ctx.currentAttemptNum,
      startedAt: attemptStart,
      finishedAt: new Date(),
      outcome: 'success',
      httpStatus: 200,
      platformPostId,
    });

    // platformPostId was already persisted by the crash-safe pre-write
    // above (issue #17). We re-set it here for safety in case the row was
    // somehow cleared between writes — drizzle's update is idempotent and
    // the unique-index backstop covers concurrent writers.
    await tx
      .update(posts)
      .set({
        status: 'published',
        publishedAt: new Date(),
        platformPostId,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, ctx.postId));

    // Phase 8: atomic per-platform window counter increment (T-API-02,
    // T-LIMITS-01). Single-statement CASE-WHEN UPDATE — concurrent writers
    // serialize on the row lock so the second observer's count correctly
    // reflects the first's bump. Idempotency: this branch only runs in
    // Phase 3 (post `platform_post_id` set), so a stalled-job retry that
    // finds platform_post_id non-null short-circuits in `already_published`
    // BEFORE reaching here (Pitfall 12).
    if (lockedProfile.platform === 'linkedin') {
      const dayStart = utcDayStart();
      await tx
        .update(socialProfiles)
        .set({
          linkedinDailyCount: sql`CASE
            WHEN ${socialProfiles.linkedinWindowStartUtc} IS NULL
              OR ${socialProfiles.linkedinWindowStartUtc} < ${dayStart}
              THEN 1
            ELSE ${socialProfiles.linkedinDailyCount} + 1
          END`,
          linkedinWindowStartUtc: sql`CASE
            WHEN ${socialProfiles.linkedinWindowStartUtc} IS NULL
              OR ${socialProfiles.linkedinWindowStartUtc} < ${dayStart}
              THEN ${dayStart}
            ELSE ${socialProfiles.linkedinWindowStartUtc}
          END`,
          updatedAt: new Date(),
        })
        .where(eq(socialProfiles.id, lockedProfile.id));
    } else if (lockedProfile.platform === 'facebook') {
      const now = new Date();
      const hourThreshold = new Date(now.getTime() - 60 * 60 * 1000);
      await tx
        .update(socialProfiles)
        .set({
          facebookHourlyCount: sql`CASE
            WHEN ${socialProfiles.facebookWindowStartUtc} IS NULL
              OR ${socialProfiles.facebookWindowStartUtc} < ${hourThreshold}
              THEN 1
            ELSE ${socialProfiles.facebookHourlyCount} + 1
          END`,
          facebookWindowStartUtc: sql`CASE
            WHEN ${socialProfiles.facebookWindowStartUtc} IS NULL
              OR ${socialProfiles.facebookWindowStartUtc} < ${hourThreshold}
              THEN ${now}
            ELSE ${socialProfiles.facebookWindowStartUtc}
          END`,
          updatedAt: new Date(),
        })
        .where(eq(socialProfiles.id, lockedProfile.id));
    }
  });

  lifecycleLogger.info({ platformPostId }, 'Publish lifecycle succeeded');
  return { platformPostId };
}

interface RecordFailureArgs {
  postId: string;
  profileId: string;
  userId: string;
  platform: string;
  attemptNum: number;
  attemptStart: Date;
  classification: ClassifiedError;
  correlationId: string;
  notificationQueue?: Queue;
}

async function recordFailureAttempt(
  db: WorkerDb,
  args: RecordFailureArgs,
): Promise<void> {
  const outcome: 'transient_fail' | 'permanent_fail' =
    args.classification.kind === 'permanent' ? 'permanent_fail' : 'transient_fail';

  // Phase 07-04 (TOKEN-04): accumulate notifications while the transaction
  // runs; enqueue AFTER the commit so a rolled-back state change can never
  // produce an orphan notification.
  const notificationsToEmit: TokenNotificationEvent[] = [];

  await db.transaction(async (tx) => {
    await tx.insert(postAttempts).values({
      postId: args.postId,
      attemptNum: args.attemptNum,
      startedAt: args.attemptStart,
      finishedAt: new Date(),
      outcome,
      httpStatus: args.classification.httpStatus,
      errorCode: args.classification.errorCode,
      errorMessage: args.classification.message,
    });

    if (outcome === 'permanent_fail') {
      // Permanent failures transition publishing → failed so the UI can
      // surface the failure and the scanner won't re-enqueue.
      await tx
        .update(posts)
        .set({
          status: 'failed',
          failureReason: args.classification.message,
          failedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(posts.id, args.postId));

      // TOKEN-04 side effect. Twitter 401 flips tokenStatus to
      // `needs_reauth`; the conditional WHERE + RETURNING guards against
      // dedupe. Multiple concurrent 401s against the same profile UPDATE
      // zero rows (rowsAffected === 0) → no notification emitted.
      if (
        args.classification.errorCode === 'auth_revoked' &&
        isKnownPlatform(args.platform)
      ) {
        const profileUpdate = await tx
          .update(socialProfiles)
          .set({ tokenStatus: 'needs_reauth', updatedAt: new Date() })
          .where(
            and(
              eq(socialProfiles.id, args.profileId),
              sql`${socialProfiles.tokenStatus} != 'needs_reauth'`,
            ),
          )
          .returning({ id: socialProfiles.id });

        if (profileUpdate.length === 1) {
          notificationsToEmit.push({
            eventType: 'token_revoked',
            profileId: args.profileId,
            userId: args.userId,
            platform: args.platform,
            reason: `${args.platform} returned ${args.classification.httpStatus ?? 401} during publish`,
            correlationId: args.correlationId,
            occurredAt: new Date().toISOString(),
          });
        }
      }
    } else {
      // Transient: revert publishing → scheduled so the retry picks it up.
      await tx
        .update(posts)
        .set({ status: 'scheduled', updatedAt: new Date() })
        .where(eq(posts.id, args.postId));
    }
  });

  // Post-commit notification emit (RESEARCH Pitfall 6 — notifications must
  // never fire inside the transaction that gates the state transition).
  if (notificationsToEmit.length > 0 && args.notificationQueue) {
    const queue = args.notificationQueue;
    for (const event of notificationsToEmit) {
      try {
        await queue.add(JOB_NAMES.tokenRevoked, event);
      } catch (enqueueErr) {
        logger.error(
          {
            err: enqueueErr,
            profileId: event.profileId,
            correlationId: event.correlationId,
          },
          'Failed to enqueue token_revoked notification after 401 transition',
        );
      }
    }
  }
}

// Narrow the platform string loaded from the social_profiles row into the
// union that the tokenNotificationEventSchema accepts. Anything else skips
// the notification — LinkedIn/Facebook 401 handling lives in Plan 03 and
// will add those branches explicitly.
function isKnownPlatform(
  platform: string,
): platform is TokenNotificationEvent['platform'] {
  return platform === 'twitter' || platform === 'linkedin' || platform === 'facebook';
}
