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
import { posts, postAttempts, socialProfiles, postMedia } from '@sms/db';
import { classifyTwitterError, type ClassifiedError } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { WorkerDb } from './db.js';

const logger = createLogger('post-lifecycle');

export type LifecycleAbortReason =
  | 'version_mismatch'
  | 'already_published'
  | 'not_scheduled'
  | 'budget_exhausted'
  | 'thread_unsupported'
  | 'media_pending'
  | 'token_unhealthy';

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
  ) => Promise<{ platformPostId: string }>;
  checkBudget: (profileId: string) => Promise<{ wouldExceed: boolean }>;
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
  let lockedProfile: typeof socialProfiles.$inferSelect;
  let lockedPost: LockedPostRow;
  try {
    const result = await db.transaction(async (tx) => {
      const lockedRows = await tx.execute<LockedPostRow>(sql`
        SELECT id,
               text,
               is_thread,
               status,
               post_version,
               platform_post_id,
               profile_id
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

      // IDEMPOTENCY (T-04-03-03 primary guard): if we already published,
      // short-circuit success without calling Twitter.
      if (post.platform_post_id) {
        lifecycleLogger.info(
          { platformPostId: post.platform_post_id },
          'Idempotent skip — post already has platform_post_id',
        );
        throw new PostLifecycleAbort('already_published');
      }

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

      // Phase 4 single-tweet scope: reject thread posts inside the transaction
      // so they stay in `scheduled` for Phase 4.5.
      if (post.is_thread) {
        throw new PostLifecycleAbort('thread_unsupported');
      }

      if (!post.profile_id) {
        throw new PostLifecycleAbort('not_scheduled');
      }

      // D-26 runtime budget re-check (LIMIT-03): leaves post scheduled so the
      // scanner re-evaluates once the month boundary resets.
      const budget = await ctx.checkBudget(post.profile_id);
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

      // Load the full profile row — the twitter publish service needs the
      // encrypted token columns. Done inside the transaction so we see a
      // consistent view of the profile alongside the post.
      const [profile] = await tx
        .select()
        .from(socialProfiles)
        .where(eq(socialProfiles.id, post.profile_id));
      if (!profile) {
        throw new PostLifecycleAbort('not_scheduled');
      }

      // TOKEN-05 (D-18/D-19) token-health pre-flight. Mirrors the budget
      // pre-flight pattern above — abort BEFORE transitioning to `publishing`
      // so the post stays in `scheduled` and the scanner re-enqueues once
      // the user Reconnects. A cancelled attempt row records the reason
      // for the SCHED-04 history modal; no notification is emitted here
      // (RESEARCH Pitfall 6 — notifications fire at the state-transition
      // site, not for every blocked publish attempt against the dead token).
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

      return { post, profile };
    });
    lockedPost = result.post;
    lockedProfile = result.profile;
  } catch (err) {
    // Abort errors are expected control flow — propagate without wrapping.
    if (err instanceof PostLifecycleAbort) {
      throw err;
    }
    lifecycleLogger.error({ err }, 'Lifecycle lock transaction failed');
    throw err;
  }

  // PHASE 2 — Twitter call OUTSIDE the transaction. Long-held locks across
  // a network round trip would serialize the entire worker pool.
  let platformPostId: string;
  try {
    const callResult = await ctx.callTwitter(
      lockedProfile,
      lockedPost.text,
      lockedPost.is_thread,
    );
    platformPostId = callResult.platformPostId;
  } catch (twitterErr) {
    const classification = classifyTwitterError(twitterErr);
    await recordFailureAttempt(db, {
      postId: ctx.postId,
      attemptNum: ctx.currentAttemptNum,
      attemptStart,
      classification,
    }).catch((writeErr) => {
      // Never let a failure-attempt write swallow the original error.
      lifecycleLogger.error(
        { err: writeErr },
        'Failed to persist post_attempts row for transient/permanent failure',
      );
    });
    throw twitterErr;
  }

  // PHASE 3 — success: insert attempt row + transition to published.
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

    await tx
      .update(posts)
      .set({
        status: 'published',
        publishedAt: new Date(),
        platformPostId,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, ctx.postId));
  });

  lifecycleLogger.info({ platformPostId }, 'Publish lifecycle succeeded');
  return { platformPostId };
}

interface RecordFailureArgs {
  postId: string;
  attemptNum: number;
  attemptStart: Date;
  classification: ClassifiedError;
}

async function recordFailureAttempt(
  db: WorkerDb,
  args: RecordFailureArgs,
): Promise<void> {
  const outcome: 'transient_fail' | 'permanent_fail' =
    args.classification.kind === 'permanent' ? 'permanent_fail' : 'transient_fail';

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
    } else {
      // Transient: revert publishing → scheduled so the retry picks it up.
      await tx
        .update(posts)
        .set({ status: 'scheduled', updatedAt: new Date() })
        .where(eq(posts.id, args.postId));
    }
  });
}
