import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { DateTime } from 'luxon';
import { and, eq, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import {
  createPostSchema,
  updatePostSchema,
  postQuerySchema,
  conflictCheckSchema,
  transitionPost,
  JOB_NAMES,
  type PostStatus,
} from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { Db } from '@sms/db';
import { posts, postAttempts, socialProfiles } from '@sms/db';

import {
  createPost,
  updatePost,
  deletePost,
  getPostById,
  getPosts,
  checkConflicts,
  PostServiceError,
} from '../services/post.service.js';
import { checkTwitterBudgetWithDb } from '../services/rate-limit.service.js';
import type { PublishQueueService } from '../services/publish-queue.service.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { validateUuidParam } from '../middleware/validation.js';

const logger = createLogger('posts-router');

interface PostsDependencies {
  db: Db;
  // Both are optional so unit tests that only exercise the existing CRUD
  // paths can keep omitting BullMQ. Handlers that require enqueue will
  // degrade gracefully when the dependency is missing (see below).
  publishQueueService?: PublishQueueService;
  notificationQueue?: Queue;
}

// Shape of the 409 Conflict body returned when a Twitter post would exceed
// the monthly budget. Frontend (UI-SPEC §RateLimit modal) consumes the
// `code` discriminator to render the "budget exceeded" toast.
interface BudgetExceededBody {
  code: 'twitter_budget_exceeded';
  budget: number;
  currentCount: number;
}

// Enqueue a LIMIT-02 warn notification with a per-profile-per-billing-cycle
// dedupe jobId. BullMQ silently ignores re-adds of an existing jobId, so
// repeated POSTs near the warn threshold in the same month produce exactly
// one notification job (T-04-04-11 mitigation / revision Blocker 5).
async function enqueueWarnNotification(
  notificationQueue: Queue,
  params: {
    profileId: string;
    currentUsage: number;
    monthlyBudget: number;
    warnThresholdPercent: number;
  },
): Promise<void> {
  const billingMonth = DateTime.utc().toFormat('yyyy-LL');
  const warnJobId = `rate-limit-warn:${params.profileId}:${billingMonth}`;
  try {
    await notificationQueue.add(
      JOB_NAMES.rateLimitWarnNotification,
      {
        profileId: params.profileId,
        currentUsage: params.currentUsage,
        monthlyBudget: params.monthlyBudget,
        warnThresholdPercent: params.warnThresholdPercent,
        triggeredAt: new Date().toISOString(),
      },
      { jobId: warnJobId },
    );
  } catch (err) {
    // Post creation is the user's primary intent; a notification enqueue
    // failure must not fail the POST. Log and continue.
    logger.error(
      { err, profileId: params.profileId, warnJobId },
      'Failed to enqueue rate-limit warn notification',
    );
  }
}

export function createPostsRouter({
  db,
  publishQueueService,
  notificationQueue,
}: PostsDependencies) {
  const router = Router();

  router.post('/api/posts', requireAuth, async (req, res) => {
    const parsed = createPostSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const userId = req.session.userId!;

    // Pre-flight Twitter budget check (LIMIT-01/02/03/04). Runs only when
    // the target profile is a Twitter profile and the caller is trying to
    // schedule (not save as draft). Ownership is enforced by the profile
    // lookup below — a cross-user profileId returns 404 before any budget
    // data is leaked.
    const isScheduledTweet = parsed.data.status === 'scheduled';
    if (isScheduledTweet) {
      const [ownedProfile] = await db
        .select({ id: socialProfiles.id, platform: socialProfiles.platform })
        .from(socialProfiles)
        .where(
          and(
            eq(socialProfiles.id, parsed.data.profileId),
            eq(socialProfiles.userId, userId),
          ),
        );

      if (!ownedProfile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }

      if (ownedProfile.platform === 'twitter') {
        const budget = await checkTwitterBudgetWithDb(db, {
          profileId: parsed.data.profileId,
          additionalPostCount: 1,
        });

        if (budget.wouldExceed) {
          // 409 block path. Mutually exclusive with the warn-notification
          // enqueue below — a blocked post never fires a warn notification.
          const body: BudgetExceededBody = {
            code: 'twitter_budget_exceeded',
            budget: budget.budget,
            currentCount: budget.currentUsage,
          };
          res.status(409).json(body);
          return;
        }

        if (budget.warnThresholdHit && notificationQueue) {
          // LIMIT-02 / revision Blocker 5: enqueue a per-month deduped warn.
          // jobId shape: `rate-limit-warn:{profileId}:YYYY-MM`
          await enqueueWarnNotification(notificationQueue, {
            profileId: parsed.data.profileId,
            currentUsage: budget.currentUsage,
            monthlyBudget: budget.budget,
            warnThresholdPercent: budget.warnThresholdPercent,
          });
        }
      }
    }

    try {
      const post = await createPost(db, userId, parsed.data);

      // After create, enqueue the delayed publish job if scheduled.
      if (
        post &&
        post.status === 'scheduled' &&
        post.scheduledAt &&
        publishQueueService
      ) {
        const correlationId =
          (req as unknown as { id?: string }).id ?? randomUUID();
        await publishQueueService.enqueuePublish(
          post.id,
          post.postVersion,
          new Date(post.scheduledAt),
          correlationId,
        );
      }

      res.status(201).json(post);
    } catch (err: unknown) {
      if (err instanceof PostServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.get('/api/posts', requireAuth, async (req, res) => {
    const parsed = postQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const postResults = await getPosts(db, req.session.userId!, parsed.data);
    res.json(postResults);
  });

  router.get('/api/posts/conflicts', requireAuth, async (req, res) => {
    const parsed = conflictCheckSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const conflicts = await checkConflicts(
      db,
      req.session.userId!,
      parsed.data.profileId,
      parsed.data.scheduledAt,
      parsed.data.excludePostId,
    );
    res.json(conflicts);
  });

  router.get('/api/posts/:id', requireAuth, async (req, res) => {
    const postId = validateUuidParam(req.params.id as string);
    const post = await getPostById(db, req.session.userId!, postId);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json(post);
  });

  router.patch('/api/posts/:id', requireAuth, async (req, res) => {
    const postId = validateUuidParam(req.params.id as string);
    const parsed = updatePostSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const userId = req.session.userId!;

    // If the edit moves the post into `scheduled` OR reschedules an already
    // scheduled post, rerun the Twitter budget pre-flight so a mass-reschedule
    // can't sneak past the block. A post staying in `draft` has no budget
    // impact and skips the check entirely.
    const transitioningToScheduled = parsed.data.status === 'scheduled';
    if (transitioningToScheduled) {
      const [existingPost] = await db
        .select({
          id: posts.id,
          profileId: posts.profileId,
          status: posts.status,
          postVersion: posts.postVersion,
        })
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

      if (!existingPost) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      if (existingPost.profileId) {
        const [ownedProfile] = await db
          .select({ id: socialProfiles.id, platform: socialProfiles.platform })
          .from(socialProfiles)
          .where(
            and(
              eq(socialProfiles.id, existingPost.profileId),
              eq(socialProfiles.userId, userId),
            ),
          );

        if (ownedProfile?.platform === 'twitter') {
          const budget = await checkTwitterBudgetWithDb(db, {
            profileId: existingPost.profileId,
            additionalPostCount:
              existingPost.status === 'scheduled' ? 0 : 1,
          });

          if (budget.wouldExceed) {
            const body: BudgetExceededBody = {
              code: 'twitter_budget_exceeded',
              budget: budget.budget,
              currentCount: budget.currentUsage,
            };
            res.status(409).json(body);
            return;
          }

          if (budget.warnThresholdHit && notificationQueue) {
            await enqueueWarnNotification(notificationQueue, {
              profileId: existingPost.profileId,
              currentUsage: budget.currentUsage,
              monthlyBudget: budget.budget,
              warnThresholdPercent: budget.warnThresholdPercent,
            });
          }
        }
      }

      // Cancel the previous delayed publish for the old version before the
      // service bumps postVersion. A no-op if the job already moved to
      // `active` (the worker's post_version optimistic check handles that).
      if (publishQueueService) {
        try {
          await publishQueueService.cancelScheduled(
            postId,
            existingPost.postVersion,
          );
        } catch (err) {
          logger.error(
            { err, postId, postVersion: existingPost.postVersion },
            'cancelScheduled failed on PATCH',
          );
        }
      }
    }

    try {
      const updatedPost = await updatePost(db, userId, postId, parsed.data);

      if (
        updatedPost &&
        updatedPost.status === 'scheduled' &&
        updatedPost.scheduledAt &&
        publishQueueService
      ) {
        const correlationId =
          (req as unknown as { id?: string }).id ?? randomUUID();
        await publishQueueService.enqueuePublish(
          updatedPost.id,
          updatedPost.postVersion,
          new Date(updatedPost.scheduledAt),
          correlationId,
        );
      }

      res.json(updatedPost);
    } catch (err: unknown) {
      if (err instanceof PostServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.delete('/api/posts/:id', requireAuth, async (req, res) => {
    const postId = validateUuidParam(req.params.id as string);
    try {
      await deletePost(db, req.session.userId!, postId);
      res.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof PostServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // POST /api/posts/:id/retry — reset a failed post to scheduled, bump
  // post_version, and enqueue an immediate publish. Returns 404 on
  // ownership mismatch (timing-safe, per D-24) and 409 when the post is
  // in any state other than `failed` (T-04-04-09).
  router.post('/api/posts/:id/retry', requireAuth, async (req, res) => {
    const postId = validateUuidParam(req.params.id as string);
    const userId = req.session.userId!;

    try {
      const updated = await db.transaction(async (tx) => {
        const [existingPost] = await tx
          .select({
            id: posts.id,
            status: posts.status,
            postVersion: posts.postVersion,
          })
          .from(posts)
          .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

        if (!existingPost) {
          throw new PostServiceError('Post not found', 404);
        }

        if (existingPost.status !== 'failed') {
          throw new PostServiceError(
            'Only failed posts can be retried.',
            409,
          );
        }

        // Validate transition rules even though we already checked status
        // above — keeps the single authoritative transition function as the
        // source of truth (POST_STATE_TRANSITIONS).
        transitionPost(existingPost.status as PostStatus, 'scheduled');

        const [row] = await tx
          .update(posts)
          .set({
            status: 'scheduled',
            failureReason: null,
            failedAt: null,
            postVersion: sql`${posts.postVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
          .returning();

        return row;
      });

      if (publishQueueService) {
        const correlationId =
          (req as unknown as { id?: string }).id ?? randomUUID();
        await publishQueueService.enqueuePublish(
          updated.id,
          updated.postVersion,
          new Date(),
          correlationId,
        );
      }

      res.status(200).json(updated);
    } catch (err: unknown) {
      if (err instanceof PostServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // GET /api/posts/:id/history — return post_attempts grouped into retry
  // cycles. A new cycle starts whenever `attempt_num` resets to 1 (D-17).
  router.get('/api/posts/:id/history', requireAuth, async (req, res) => {
    const postId = validateUuidParam(req.params.id as string);
    const userId = req.session.userId!;

    const [ownedPost] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

    if (!ownedPost) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    const attemptRows = await db
      .select()
      .from(postAttempts)
      .where(eq(postAttempts.postId, postId))
      .orderBy(postAttempts.startedAt);

    // Serialize timestamps to ISO so the response matches
    // postHistoryResponseSchema from @sms/shared (string, not Date).
    const serializedAttempts = attemptRows.map((attempt) => ({
      id: attempt.id,
      postId: attempt.postId,
      attemptNum: attempt.attemptNum,
      startedAt: attempt.startedAt instanceof Date
        ? attempt.startedAt.toISOString()
        : attempt.startedAt,
      finishedAt: attempt.finishedAt instanceof Date
        ? attempt.finishedAt.toISOString()
        : attempt.finishedAt,
      outcome: attempt.outcome,
      httpStatus: attempt.httpStatus,
      errorCode: attempt.errorCode,
      errorMessage: attempt.errorMessage,
      platformPostId: attempt.platformPostId,
    }));

    const cycles: (typeof serializedAttempts)[] = [];
    let currentCycle: typeof serializedAttempts = [];
    for (const attempt of serializedAttempts) {
      if (attempt.attemptNum === 1 && currentCycle.length > 0) {
        cycles.push(currentCycle);
        currentCycle = [];
      }
      currentCycle.push(attempt);
    }
    if (currentCycle.length > 0) cycles.push(currentCycle);

    res.json({ postId, cycles });
  });

  return router;
}
