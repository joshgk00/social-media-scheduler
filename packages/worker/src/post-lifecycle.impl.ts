// Publish lifecycle orchestrator. This module owns the worker transaction
// shape, callback wiring, post_attempts audit-row inserts, notification
// ordering, and the lock/network-call boundary for publish jobs.
//
// Post lifecycle invariants are delegated to @sms/shared/post/aggregate.ts.
// When the aggregate rejects a graceful-skip condition, this service adapts
// that PostInvariantError into PostLifecycleAbort so BullMQ resolves the job
// without consuming retry budget.
//
// On Twitter failure, `recordFailureAttempt` writes the `post_attempts` row
// with a classified error, asks the aggregate whether the post should stay
// `publishing` for a retry or transition to `failed`,
// and rethrows the ORIGINAL error so the publish-worker's classifier and
// the BullMQ backoff see the real error shape. Per RESEARCH.md Pitfall 8,
// we persist the classification BEFORE the classifier-driven
// UnrecoverableError replaces the error object.

import { sql, eq, and, isNull, inArray } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { posts, postAttempts, socialProfiles, postMedia } from '@sms/db';
import {
  JOB_NAMES,
  PostInvariantError,
  PublishFailure,
  planRecordFailure,
  planRecordSuccess,
  planTransitionToPublishing,
  countFacebookPublishApiCalls,
  type MediaItem,
  type PostState,
  type PostTransitionProfile,
  type PreflightState,
  type PublishablePost,
  type PublishCtx,
  type TokenNotificationEvent,
  type TransitionDecision,
  type SupportedPlatform,
  type PublishFailureKind,
} from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import { createStorageBackend, type StorageBackend } from '@sms/shared/storage';
import type { WorkerDb } from './db.js';

const logger = createLogger('post-lifecycle');

type ClassifiedError = {
  kind: PublishFailureKind;
  httpStatus: number | null;
  errorCode: string;
  message: string;
};

// UTC midnight of "today" — the LinkedIn daily window resets here per
// LIMIT-07. Mirrors the same helper used in @sms/api rate-limit.service.ts.
function utcDayStart(now: Date = new Date()): Date {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  return dayStart;
}

export class PostLifecycleAbort extends Error {
  constructor(public readonly invariant: PostInvariantError) {
    super(`PostLifecycleAbort: ${invariant.kind}`);
    this.name = 'PostLifecycleAbort';
  }
}

const GRACEFUL_LIFECYCLE_ABORTS = new Set<PostInvariantError['kind']>([
  'version_mismatch',
  'already_published',
  'not_scheduled',
  'thread_unsupported',
  'media_pending',
  'token_unhealthy',
  'budget_exhausted',
  'rate_limit_exhausted',
]);

function lifecycleAbort(kind: PostInvariantError['kind'], message?: string): PostLifecycleAbort {
  return new PostLifecycleAbort(new PostInvariantError(kind, message ?? kind));
}

function postInvariantToLifecycleAbort(err: PostInvariantError): PostLifecycleAbort {
  if (GRACEFUL_LIFECYCLE_ABORTS.has(err.kind)) {
    return new PostLifecycleAbort(err);
  }
  throw err;
}

export interface PublishContext {
  postId: string;
  expectedVersion: number;
  correlationId: string;
  currentAttemptNum: number;
  isFinalAttempt?: boolean;
  publish: (
    profile: typeof socialProfiles.$inferSelect,
    post: PublishablePost,
    ctx: PublishCtx,
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
  storage?: StorageBackend;
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

interface PublishableMediaRow {
  id: string;
  filePath: string;
  fileName: string;
  mimeType: string;
}

function isSupportedPlatform(platform: string | null | undefined): platform is SupportedPlatform {
  return platform === 'twitter' || platform === 'linkedin' || platform === 'facebook';
}

function resolvePublishPlatform(
  post: LockedPostRow,
  profile: typeof socialProfiles.$inferSelect,
): SupportedPlatform {
  if (isSupportedPlatform(post.platform)) return post.platform;
  if (isSupportedPlatform(profile.platform)) return profile.platform;
  return 'twitter';
}

function mapLockedPostRowToState(post: LockedPostRow): PostState {
  return {
    status: post.status as PostState['status'],
    postVersion: post.post_version,
    scheduledAt: null,
    platform: isSupportedPlatform(post.platform) ? post.platform : null,
    isThread: post.is_thread,
    platformPostId: post.platform_post_id,
  };
}

function detectRecoveryPlatformPostId(currentState: PostState): string | null {
  if (currentState.status === 'publishing' && currentState.platformPostId) {
    return currentState.platformPostId;
  }
  return null;
}

function mapSocialProfileToTransitionProfile(
  profile: typeof socialProfiles.$inferSelect,
): PostTransitionProfile {
  return {
    platform: isSupportedPlatform(profile.platform) ? profile.platform : 'twitter',
  };
}

function resolveVisibility(
  visibility: string | null | undefined,
): PublishablePost['visibility'] {
  return visibility === 'PUBLIC' || visibility === 'CONNECTIONS' ? visibility : null;
}

function mediaKindFromMimeType(mimeType: string): MediaItem['kind'] {
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType.startsWith('video/')) return 'video';
  return 'image';
}

async function loadPublishableMedia(
  db: WorkerDb,
  postId: string,
  storage?: StorageBackend,
): Promise<MediaItem[]> {
  const rows = await db
    .select({
      id: postMedia.id,
      filePath: postMedia.filePath,
      fileName: postMedia.fileName,
      mimeType: postMedia.mimeType,
    })
    .from(postMedia)
    .where(and(eq(postMedia.postId, postId), isNull(postMedia.deletedAt)))
    .orderBy(postMedia.sortOrder);

  if (rows.length === 0) return [];

  const storageBackend = storage ?? createStorageBackend();
  return Promise.all(
    rows.map(async (row: PublishableMediaRow) => ({
      id: row.id,
      kind: mediaKindFromMimeType(row.mimeType),
      bytes: await storageBackend.get(row.filePath),
      mimeType: row.mimeType,
      fileName: row.fileName,
    })),
  );
}

async function loadFacebookCounterMedia(
  db: WorkerDb,
  postId: string,
): Promise<Array<{ mimeType: string }>> {
  return db
    .select({ mimeType: postMedia.mimeType })
    .from(postMedia)
    .where(and(eq(postMedia.postId, postId), isNull(postMedia.deletedAt)))
    .orderBy(postMedia.sortOrder);
}

function classifyPublishError(err: unknown): ClassifiedError {
  if (err instanceof PublishFailure) {
    return {
      kind: err.kind,
      httpStatus: err.httpStatus ?? null,
      errorCode: err.errorCode,
      message: err.message,
    };
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  return { kind: 'transient', httpStatus: null, errorCode: 'unknown', message };
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
        throw lifecycleAbort('not_scheduled');
      }

      const currentState = mapLockedPostRowToState(post);
      let transitionDecision: TransitionDecision | null = null;
      const recoveryPostId = detectRecoveryPlatformPostId(currentState);
      const isRecovery = recoveryPostId !== null;
      const isPublishingRetry =
        currentState.status === 'publishing' && currentState.platformPostId === null;
      if (isRecovery) {
        lifecycleLogger.info(
          { platformPostId: recoveryPostId },
          'Recovery from prior issue-#17 pre-write — Phase 3 will resume',
        );
      } else if (isPublishingRetry) {
        lifecycleLogger.info(
          'Retrying publish attempt from existing publishing state',
        );
      } else {
        if (currentState.platformPostId) {
          lifecycleLogger.info(
            {
              platformPostId: currentState.platformPostId,
              status: currentState.status,
            },
            'Idempotent skip — post already has platform_post_id',
          );
          throw lifecycleAbort('already_published');
        }

        if (
          currentState.status !== 'scheduled' &&
          currentState.status !== 'publishing'
        ) {
          lifecycleLogger.info(
            { actualStatus: currentState.status },
            'Skipping publish — post is no longer scheduled',
          );
          throw lifecycleAbort('not_scheduled');
        }

        if (post.post_version !== ctx.expectedVersion) {
          lifecycleLogger.info(
            { expectedVersion: ctx.expectedVersion, actualVersion: post.post_version },
            'Version mismatch — scanner will re-enqueue',
          );
          throw lifecycleAbort('version_mismatch');
        }

      }

      if (!post.profile_id) {
        throw lifecycleAbort('not_scheduled');
      }

      let budget: Awaited<ReturnType<PublishContext['checkBudget']>> = {
        wouldExceed: false,
      };
      let isPlatformRateLimit = false;
      let pendingMediaCount = 0;

      // Recovery skips graceful preflights because the platform post already
      // exists and Phase 3 must only finish bookkeeping. Publishing retries
      // rerun these checks because token, media, and budget state can change
      // while BullMQ is backing off between attempts.
      if (!isRecovery) {
        // D-26 runtime budget re-check (LIMIT-03): leaves post scheduled so
        // the scanner re-evaluates once the month boundary resets. Phase 8
        // (D-05 / D-07 / LIMIT-06 / LIMIT-07): the worker-side checker
        // returns the platform discriminator so non-twitter posts that hit
        // the per-platform window emit `rate_limit_exhausted` rather than
        // `budget_exhausted` — same graceful-skip semantics, distinct enum.
        budget = await ctx.checkBudget(post.profile_id);
        isPlatformRateLimit =
          (budget.platform === 'linkedin' || budget.platform === 'facebook') &&
          budget.blockThresholdHit === true;

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
        pendingMediaCount = parseInt(pendingMedia[0]?.count ?? '0', 10);
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
        throw lifecycleAbort('not_scheduled');
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
        const preflight: PreflightState = {
          mediaReady: pendingMediaCount === 0,
          tokenHealthy: profile.tokenStatus === 'active',
          budgetExhausted: !isPlatformRateLimit && budget.wouldExceed,
          rateLimitExhausted: isPlatformRateLimit,
        };
        try {
          transitionDecision = planTransitionToPublishing(
            currentState,
            mapSocialProfileToTransitionProfile(profile),
            preflight,
          );
        } catch (err) {
          if (err instanceof PostInvariantError) {
            if (err.kind === 'media_pending') {
              lifecycleLogger.info(
                { postId: ctx.postId, pendingMediaCount },
                'Skipping publish -- media still transcoding',
              );
            } else if (err.kind === 'token_unhealthy') {
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
            } else if (err.kind === 'budget_exhausted') {
              lifecycleLogger.warn('Budget exhausted at runtime — leaving post scheduled');
            } else if (err.kind === 'rate_limit_exhausted') {
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
            }
          }
          throw err;
        }

        // Transition scheduled → publishing, guarded by the optimistic
        // version check so a concurrent edit still loses the race cleanly.
        if (transitionDecision?.kind !== 'proceed') {
          throw lifecycleAbort('not_scheduled');
        }
        const [updatedRow] = await tx
          .update(posts)
          .set({ status: transitionDecision.patch.status, updatedAt: new Date() })
          .where(
            and(eq(posts.id, ctx.postId), eq(posts.postVersion, ctx.expectedVersion)),
          )
          .returning({ id: posts.id });

        if (!updatedRow) {
          throw lifecycleAbort('version_mismatch');
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
    if (err instanceof PostInvariantError) {
      throw postInvariantToLifecycleAbort(err);
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
  let facebookPublishCallCount = 1;
  let platformPostId: string;
  if (recoveryPlatformPostId !== null) {
    platformPostId = recoveryPlatformPostId;
    if (lockedProfile.platform === 'facebook') {
      facebookPublishCallCount = countFacebookPublishApiCalls(
        await loadFacebookCounterMedia(db, ctx.postId),
      );
    }
    lifecycleLogger.info(
      { platformPostId },
      'Resuming from issue-#17 recovery — Twitter call and pre-write skipped, advancing to Phase 3',
    );
  } else {
    // PHASE 2 — media load + platform publish OUTSIDE the transaction. Long-held
    // locks across storage or network round trips would serialize the worker pool.
    try {
      const media = await loadPublishableMedia(db, ctx.postId, ctx.storage);
      const publishablePost: PublishablePost = {
        text: lockedPost.text,
        platform: resolvePublishPlatform(lockedPost, lockedProfile),
        isThread: lockedPost.is_thread,
        visibility: resolveVisibility(lockedPost.visibility),
        linkUrl: lockedPost.link_url ?? null,
        media,
      };
      if (publishablePost.platform === 'facebook') {
        facebookPublishCallCount = countFacebookPublishApiCalls(media);
      }
      const callResult = await ctx.publish(
        lockedProfile,
        publishablePost,
        { correlationId: ctx.correlationId },
      );
      platformPostId = callResult.platformPostId;
    } catch (publishErr) {
      const classification = classifyPublishError(publishErr);
      await recordFailureAttempt(db, {
        postId: ctx.postId,
        currentRow: {
          ...mapLockedPostRowToState(lockedPost),
          status: 'publishing',
        },
        profileId: lockedProfile.id,
        userId: lockedProfile.userId,
        platform: lockedProfile.platform,
        attemptNum: ctx.currentAttemptNum,
        attemptStart,
        classification,
        correlationId: ctx.correlationId,
        notificationQueue: ctx.notificationQueue,
        isFinalAttempt: ctx.isFinalAttempt === true,
      }).catch((writeErr) => {
        // Never let a failure-attempt write swallow the original error.
        lifecycleLogger.error(
          { err: writeErr },
          'Failed to persist post_attempts row for transient/permanent failure',
        );
      });
      throw publishErr;
    }

    // CRASH-SAFE IDEMPOTENCY MARKER (issue #17). See the recovery branch in
    // Phase 1 (`isRecovery`) for the matching read path.
    //
    // If THIS update fails, BullMQ retries; the retry's Phase 1 lock load
    // won't see platform_post_id and will proceed to a duplicate tweet,
    // which Twitter's own duplicate-content rejection (code 187) catches
    // for identical text within a short window. The schema's unique-index
    // backstop only helps after a marker reaches the database, so the log line
    // below remains the operator's signal that this pre-write window was hit.
    // The duplicate-tweet risk here is narrower than the pre-fix
    // Phase-3-rollback window the issue documents.
    //
    // Operators distinguish:
    //   - "tweet live + Phase 3 rolled back"  (retry safe, marker persisted; recovery branch will complete it)
    //   - "tweet live + pre-write failed"     (retry MAY duplicate; rely on Twitter-side duplicate detection)
    // by reading log lines.
    lifecycleLogger.info(
      { platformPostId },
      'Platform post published — persisting idempotency marker before Phase 3 commit',
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
        'CRITICAL: platform post published but pre-write of platform_post_id failed — retry may duplicate',
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
    const finishedAt = new Date();
    await tx.insert(postAttempts).values({
      postId: ctx.postId,
      attemptNum: ctx.currentAttemptNum,
      startedAt: attemptStart,
      finishedAt,
      outcome: 'success',
      httpStatus: 200,
      platformPostId,
    });

    // platformPostId was already persisted by the crash-safe pre-write
    // above (issue #17). We re-set it here for safety in case the row was
    // somehow cleared between writes — drizzle's update is idempotent and
    // the unique-index backstop covers concurrent writers.
    const successPatch = planRecordSuccess(
      {
        ...mapLockedPostRowToState(lockedPost),
        status: 'publishing',
      },
      platformPostId,
      finishedAt,
    );
    await tx
      .update(posts)
      .set({
        status: successPatch.status,
        publishedAt: successPatch.publishedAt,
        platformPostId: successPatch.platformPostId,
        failureReason: successPatch.failureReason,
        updatedAt: finishedAt,
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
              THEN ${facebookPublishCallCount}
            ELSE ${socialProfiles.facebookHourlyCount} + ${facebookPublishCallCount}
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
  currentRow: PostState;
  profileId: string;
  userId: string;
  platform: string;
  attemptNum: number;
  attemptStart: Date;
  classification: ClassifiedError;
  correlationId: string;
  isFinalAttempt: boolean;
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
    const finishedAt = new Date();
    await tx.insert(postAttempts).values({
      postId: args.postId,
      attemptNum: args.attemptNum,
      startedAt: args.attemptStart,
      finishedAt,
      outcome,
      httpStatus: args.classification.httpStatus,
      errorCode: args.classification.errorCode,
      errorMessage: args.classification.message,
    });

    const failurePatch = planRecordFailure(
      args.currentRow,
      args.classification,
      args.isFinalAttempt,
      finishedAt,
    );

    if (failurePatch.status === 'failed') {
      // Permanent failures transition publishing → failed so the UI can
      // surface the failure and the scanner won't re-enqueue.
      await tx
        .update(posts)
        .set({
          status: failurePatch.status,
          failureReason: failurePatch.failureReason,
          failedAt: failurePatch.failedAt,
          updatedAt: finishedAt,
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
      // Transient with retries remaining: leave status as `publishing` so
      // BullMQ retries the same job while preserving the classified message.
      await tx
        .update(posts)
        .set({
          failureReason: failurePatch.failureReason,
          updatedAt: failurePatch.lastAttemptAt ?? finishedAt,
        })
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
