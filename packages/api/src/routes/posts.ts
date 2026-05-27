import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { DateTime } from 'luxon';
import { and, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Queue } from 'bullmq';
import {
  bulkDeleteInputSchema,
  bulkModifyTagsInputSchema,
  bulkPauseInputSchema,
  createPostSchema,
  updatePostSchema,
  postQuerySchema,
  conflictCheckSchema,
  planRetryFailedPost,
  JOB_NAMES,
  AppError,
  countFacebookPublishApiCalls,
  type JobName,
  type PostStatus,
} from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { Db } from '@sms/db';
import { posts, postAttempts, postMedia, postTags, socialProfiles, tags } from '@sms/db';

import {
  createPost,
  updatePost,
  deletePost,
  getDashboardPostStats,
  getPostById,
  getPostStatusCounts,
  getPosts,
  checkConflicts,
} from '../services/post.service.js';
import {
  checkTwitterBudgetWithDb,
  checkPlatformBudgetWithDb,
  type LinkedInRateLimitExceededBody,
  type FacebookRateLimitExceededBody,
} from '../services/rate-limit.service.js';
import type { PublishQueueService } from '../services/publish-queue.service.js';
import { beginCsvDownload, writeCsvRows } from '../services/bulk-export.service.js';
import { InvalidIdempotencyKeyError, type BulkOperationFactory } from '../services/bulk-operation.factory.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { bulkOperationsLimiter } from '../middleware/rate-limiter.js';
import { validateUuidParam } from '../middleware/validation.js';

const logger = createLogger('posts-router');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dashboardStatsQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d']).default('24h'),
});

function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

async function loadFacebookBudgetMediaByIds(
  db: Db,
  userId: string,
  mediaIds: string[],
): Promise<Array<{ mimeType: string }>> {
  if (mediaIds.length === 0) return [];

  return db
    .select({ mimeType: postMedia.mimeType })
    .from(postMedia)
    .where(
      and(
        inArray(postMedia.id, mediaIds),
        eq(postMedia.userId, userId),
        isNull(postMedia.deletedAt),
      ),
    );
}

async function loadFacebookBudgetMediaForPost(
  db: Db,
  userId: string,
  postId: string,
): Promise<Array<{ mimeType: string }>> {
  return db
    .select({ mimeType: postMedia.mimeType })
    .from(postMedia)
    .where(
      and(
        eq(postMedia.postId, postId),
        eq(postMedia.userId, userId),
        isNull(postMedia.deletedAt),
      ),
    )
    .orderBy(postMedia.sortOrder);
}

async function loadTagNamesByPostId(db: Db, postIds: string[]): Promise<Record<string, string>> {
  if (postIds.length === 0) return {};

  const tagRows = await db
    .select({
      postId: postTags.postId,
      name: tags.name,
    })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(inArray(postTags.postId, postIds));

  const tagNamesByPostId: Record<string, string[]> = {};
  for (const tagRow of tagRows) {
    tagNamesByPostId[tagRow.postId] ??= [];
    tagNamesByPostId[tagRow.postId].push(tagRow.name);
  }

  return Object.fromEntries(
    Object.entries(tagNamesByPostId).map(([postId, tagNames]) => [postId, tagNames.join(';')]),
  );
}

interface PostsDependencies {
  db: Db;
  // Both are optional so unit tests that only exercise the existing CRUD
  // paths can keep omitting BullMQ. Handlers that require enqueue will
  // degrade gracefully when the dependency is missing (see below).
  publishQueueService?: PublishQueueService;
  bulkOperationFactory?: BulkOperationFactory;
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

function requestCorrelationId(req: Request): string {
  const requestId = req.id;
  return typeof requestId === 'string' && UUID_PATTERN.test(requestId) ? requestId : randomUUID();
}

async function enqueueRateLimitReachedNotification(
  notificationQueue: Queue,
  params: {
    userId: string;
    profileId: string;
    platform: 'twitter' | 'linkedin' | 'facebook';
    correlationId: string;
    currentUsage?: number;
    limit?: number;
  },
): Promise<void> {
  const billingMonth = DateTime.utc().toFormat('yyyy-LL');
  const jobId = `rate-limit-reached:${params.profileId}:${billingMonth}`;
  try {
    await notificationQueue.add(
      JOB_NAMES.rateLimitReachedNotification,
      {
        kind: 'rate_limit_reached',
        userId: params.userId,
        profileId: params.profileId,
        platform: params.platform,
        currentUsage: params.currentUsage,
        limit: params.limit,
        correlationId: params.correlationId,
        triggeredAt: new Date().toISOString(),
      },
      { jobId },
    );
  } catch (err) {
    logger.error(
      { err, profileId: params.profileId, jobId },
      'Failed to enqueue rate-limit-reached notification',
    );
  }
}

export function createPostsRouter({
  db,
  publishQueueService,
  bulkOperationFactory,
  notificationQueue,
}: PostsDependencies) {
  const router = Router();

  async function startPostBulkOperation(args: {
    userId: string;
    operationType: JobName;
    params: Record<string, unknown>;
    targetKind?: 'profile' | 'queue' | 'scheduled-list';
    targetId?: string | null;
    idempotencyKey: string | undefined;
    correlationId: string;
  }) {
    if (!bulkOperationFactory) {
      throw new Error('Bulk operations queue is not configured');
    }
    return bulkOperationFactory.startBulkOperation({
      userId: args.userId,
      idempotencyKey: args.idempotencyKey,
      operationType: args.operationType,
      targetKind: args.targetKind ?? 'scheduled-list',
      targetId: args.targetId ?? null,
      params: args.params,
      correlationId: args.correlationId,
    });
  }

  async function sendPostBulkOperation(args: Parameters<typeof startPostBulkOperation>[0], res: Response) {
    try {
      const result = await startPostBulkOperation(args);
      res.status(202).json(result);
    } catch (err) {
      if (err instanceof InvalidIdempotencyKeyError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  }

  async function resolveSelectedPostIds(
    userId: string,
    selector: { postIds?: string[]; filter?: Record<string, unknown> },
  ): Promise<string[]> {
    if (selector.postIds && selector.postIds.length > 0) {
      const rows = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.userId, userId), inArray(posts.id, selector.postIds)));
      return rows.map((row) => row.id);
    }
    const conditions = [eq(posts.userId, userId)];
    if (typeof selector.filter?.status === 'string') {
      conditions.push(eq(posts.status, selector.filter.status as PostStatus));
    }
    if (typeof selector.filter?.profileId === 'string') {
      conditions.push(eq(posts.profileId, selector.filter.profileId));
    }
    if (typeof selector.filter?.tagId === 'string') {
      conditions.push(sql`exists (
        select 1 from ${postTags}
        where ${postTags.postId} = ${posts.id}
        and ${postTags.tagId} = ${selector.filter.tagId}
      )`);
    }
    if (typeof selector.filter?.search === 'string' && selector.filter.search.trim().length > 0) {
      conditions.push(ilike(posts.text, `%${escapeLikePattern(selector.filter.search.trim())}%`));
    }
    const rows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(...conditions));
    return rows.map((row) => row.id);
  }

  router.post('/api/posts', requireAuth, async (req, res) => {
    const parsed = createPostSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const userId = req.session.userId!;

    // Pre-flight rate-limit check. Runs only when the caller is trying to
    // schedule (not save as draft). Ownership is enforced by the profile
    // lookup below — a cross-user profileId returns 404 before any budget
    // data is leaked. Platform-specific behavior:
    //   twitter  → monthly budget (LIMIT-01..04), 409 'twitter_budget_exceeded'
    //   linkedin → daily window (LIMIT-07), 409 'linkedin_rate_limit_exceeded'
    //   facebook → hourly window (LIMIT-06), 409 'facebook_rate_limit_exceeded'
    const isScheduledPost = parsed.data.status === 'scheduled';
    if (isScheduledPost) {
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

      if (ownedProfile.platform !== parsed.data.platform) {
        // Defensive — schema-layer doesn't know about the profile's platform.
        // T-DATA-01: cross-platform profile/payload combinations get 400 here
        // before they reach post.service.
        res.status(400).json({
          error: 'Profile platform mismatch',
          details: [
            {
              path: ['platform'],
              message: `Profile is on '${ownedProfile.platform}', not '${parsed.data.platform}'.`,
            },
          ],
        });
        return;
      }

      // Pitfall 2: Facebook videos publish as one /videos request, while
      // multi-photo posts consume one upload call per photo plus the /feed
      // wrapper. LinkedIn and Twitter publish via a single API call.
      const facebookMedia =
        parsed.data.platform === 'facebook'
          ? await loadFacebookBudgetMediaByIds(
              db,
              userId,
              parsed.data.mediaIds ?? [],
            )
          : [];
      const additionalCount =
        parsed.data.platform === 'facebook'
          ? countFacebookPublishApiCalls(facebookMedia)
          : 1;

      const budget = await checkPlatformBudgetWithDb(db, {
        profileId: parsed.data.profileId,
        platform: parsed.data.platform,
        additionalCount,
      });

      if (budget.blockThresholdHit) {
        if (notificationQueue) {
          const correlationId = requestCorrelationId(req);
          const currentUsage =
            parsed.data.platform === 'twitter'
              ? budget.currentUsage
              : budget.snapshot?.currentCount;
          const limit =
            parsed.data.platform === 'twitter'
              ? budget.budget
              : budget.snapshot?.limit;
          void enqueueRateLimitReachedNotification(notificationQueue, {
            userId,
            profileId: parsed.data.profileId,
            platform: parsed.data.platform,
            correlationId,
            currentUsage: typeof currentUsage === 'number' ? currentUsage : undefined,
            limit: typeof limit === 'number' ? limit : undefined,
          });
        }

        // Per-platform 409 body. Mutually exclusive with the warn-notification
        // enqueue below — a blocked post never fires a warn notification.
        if (parsed.data.platform === 'twitter') {
          const body: BudgetExceededBody = {
            code: 'twitter_budget_exceeded',
            budget: budget.budget!,
            currentCount: budget.currentUsage!,
          };
          res.status(409).json(body);
          return;
        }
        const snapshot = budget.snapshot!;
        const body: LinkedInRateLimitExceededBody | FacebookRateLimitExceededBody = {
          code:
            parsed.data.platform === 'linkedin'
              ? 'linkedin_rate_limit_exceeded'
              : 'facebook_rate_limit_exceeded',
          limit: snapshot.limit,
          currentCount: snapshot.currentCount,
          windowResetAt: snapshot.windowResetAt.toISOString(),
        };
        res.status(409).json(body);
        return;
      }

      if (
        parsed.data.platform === 'twitter' &&
        budget.warnThresholdHit &&
        notificationQueue
      ) {
        // LIMIT-02 warn enqueue is Twitter-specific for now; LinkedIn /
        // Facebook warn surfacing is a UI concern (the dashboard chip),
        // not a notification job.
        await enqueueWarnNotification(notificationQueue, {
          profileId: parsed.data.profileId,
          currentUsage: budget.currentUsage!,
          monthlyBudget: budget.budget!,
          warnThresholdPercent: budget.warnThresholdPercent!,
        });
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
        const correlationId = requestCorrelationId(req);
        await publishQueueService.enqueuePublish(
          post.id,
          post.postVersion,
          new Date(post.scheduledAt),
          correlationId,
        );
      }

      res.status(201).json(post);
    } catch (err: unknown) {
      if (err instanceof AppError) {
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

  router.get('/api/posts/status-counts', requireAuth, async (req, res) => {
    const parsed = postQuerySchema.omit({ status: true, page: true, limit: true }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const counts = await getPostStatusCounts(db, req.session.userId!, parsed.data);
    res.json(counts);
  });

  router.get('/api/posts/dashboard-stats', requireAuth, async (req, res) => {
    const parsed = dashboardStatsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const stats = await getDashboardPostStats(db, req.session.userId!, parsed.data.range);
    res.json(stats);
  });

  router.get('/api/posts.csv', requireAuth, bulkOperationsLimiter, async (req, res) => {
    const parsed = postQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const userId = req.session.userId!;
    const conditions = [eq(posts.userId, userId)];
    if (parsed.data.status) {
      conditions.push(eq(posts.status, parsed.data.status));
    }
    if (parsed.data.profileId) {
      conditions.push(eq(posts.profileId, parsed.data.profileId));
    }
    if (parsed.data.search) {
      conditions.push(ilike(posts.text, `%${escapeLikePattern(parsed.data.search)}%`));
    }
    if (parsed.data.tagId) {
      const postIdsWithTag = db
        .select({ postId: postTags.postId })
        .from(postTags)
        .where(eq(postTags.tagId, parsed.data.tagId));

      conditions.push(inArray(posts.id, postIdsWithTag));
    }
    const rows = await db
      .select({
        id: posts.id,
        platform: posts.platform,
        text: posts.text,
        status: posts.status,
        scheduled_at: posts.scheduledAt,
        notes: posts.notes,
      })
      .from(posts)
      .where(and(...conditions));
    const tagNamesByPostId = await loadTagNamesByPostId(db, rows.map((row) => row.id));
    const csvRows = rows.map((row) => ({
      ...row,
      tags: tagNamesByPostId[row.id] ?? '',
    }));
    beginCsvDownload(res, `posts-${DateTime.utc().toFormat('yyyy-LL-dd')}.csv`);
    await writeCsvRows(res, ['id', 'platform', 'text', 'status', 'scheduled_at', 'tags', 'notes'], csvRows);
  });

  router.post('/api/posts/bulk-pause', requireAuth, bulkOperationsLimiter, async (req, res) => {
    const parsed = bulkPauseInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    await sendPostBulkOperation({
      userId: req.session.userId!,
      operationType: JOB_NAMES.bulkProfilePause,
      params: parsed.data,
      targetKind: 'profile',
      targetId: parsed.data.profileId,
      idempotencyKey: req.get('Idempotency-Key'),
      correlationId: requestCorrelationId(req),
    }, res);
  });

  router.post('/api/posts/bulk-resume', requireAuth, bulkOperationsLimiter, async (req, res) => {
    const parsed = bulkPauseInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    await sendPostBulkOperation({
      userId: req.session.userId!,
      operationType: JOB_NAMES.bulkProfileResume,
      params: parsed.data,
      targetKind: 'profile',
      targetId: parsed.data.profileId,
      idempotencyKey: req.get('Idempotency-Key'),
      correlationId: requestCorrelationId(req),
    }, res);
  });

  router.post('/api/posts/bulk-delete', requireAuth, bulkOperationsLimiter, async (req, res) => {
    const parsed = bulkDeleteInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const postIds = await resolveSelectedPostIds(req.session.userId!, parsed.data);
    const postCount = postIds.length;
    const expected = `DELETE ${postCount} POSTS`;
    if (parsed.data.typedConfirmation !== expected) {
      res.status(400).json({ error: 'typedConfirmation_mismatch', expected });
      return;
    }
    await sendPostBulkOperation({
      userId: req.session.userId!,
      operationType: JOB_NAMES.bulkProfileBulkDelete,
      params: { postIds, typedConfirmation: parsed.data.typedConfirmation, postCount },
      idempotencyKey: req.get('Idempotency-Key'),
      correlationId: requestCorrelationId(req),
    }, res);
  });

  router.post('/api/posts/bulk-modify-tags', requireAuth, bulkOperationsLimiter, async (req, res) => {
    const parsed = bulkModifyTagsInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    await sendPostBulkOperation({
      userId: req.session.userId!,
      operationType: JOB_NAMES.bulkProfileModifyTags,
      params: parsed.data,
      idempotencyKey: req.get('Idempotency-Key'),
      correlationId: requestCorrelationId(req),
    }, res);
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
    // scheduled post, rerun the platform-specific budget pre-flight so a
    // mass-reschedule can't sneak past the block. A post staying in `draft`
    // has no budget impact and skips the check entirely.
    const transitioningToScheduled = parsed.data.status === 'scheduled';
    if (transitioningToScheduled) {
      const [existingPost] = await db
        .select({
          id: posts.id,
          profileId: posts.profileId,
          status: posts.status,
          postVersion: posts.postVersion,
          platform: posts.platform,
        })
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

      if (!existingPost) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      // T-DATA-01: posts.platform is immutable. Reject PATCH that tries to
      // change platform with a 409 + 'platform_immutable' before any other
      // pre-flight runs. The post.service also enforces this defense-in-depth.
      if (parsed.data.platform && parsed.data.platform !== existingPost.platform) {
        res.status(409).json({
          code: 'platform_immutable',
          message: `Cannot change post platform from '${existingPost.platform}' to '${parsed.data.platform}'.`,
        });
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

        if (ownedProfile) {
          // additionalCount = 0 when re-scheduling an already-scheduled
          // non-Facebook post (it's already counted), 1 for new schedule
          // transitions. Facebook needs media-aware call counting: videos are
          // one /videos call, while photo bundles are photos + /feed.
          let additionalCount = existingPost.status === 'scheduled' ? 0 : 1;
          if (ownedProfile.platform === 'facebook') {
            const facebookMedia =
              parsed.data.mediaIds === undefined
                ? await loadFacebookBudgetMediaForPost(db, userId, postId)
                : await loadFacebookBudgetMediaByIds(db, userId, parsed.data.mediaIds);
            const publishCallCount = countFacebookPublishApiCalls(facebookMedia);
            additionalCount =
              existingPost.status === 'scheduled'
                ? Math.max(0, publishCallCount - 1)
                : publishCallCount;
          }

          const budget = await checkPlatformBudgetWithDb(db, {
            profileId: existingPost.profileId,
            platform: ownedProfile.platform as 'twitter' | 'linkedin' | 'facebook',
            additionalCount,
          });

          if (budget.blockThresholdHit) {
            if (notificationQueue) {
              const correlationId = requestCorrelationId(req);
              const platform = ownedProfile.platform as 'twitter' | 'linkedin' | 'facebook';
              const currentUsage =
                platform === 'twitter'
                  ? budget.currentUsage
                  : budget.snapshot?.currentCount;
              const limit =
                platform === 'twitter'
                  ? budget.budget
                  : budget.snapshot?.limit;
              void enqueueRateLimitReachedNotification(notificationQueue, {
                userId,
                profileId: existingPost.profileId,
                platform,
                correlationId,
                currentUsage: typeof currentUsage === 'number' ? currentUsage : undefined,
                limit: typeof limit === 'number' ? limit : undefined,
              });
            }

            if (ownedProfile.platform === 'twitter') {
              const body: BudgetExceededBody = {
                code: 'twitter_budget_exceeded',
                budget: budget.budget!,
                currentCount: budget.currentUsage!,
              };
              res.status(409).json(body);
              return;
            }
            const snapshot = budget.snapshot!;
            const body: LinkedInRateLimitExceededBody | FacebookRateLimitExceededBody = {
              code:
                ownedProfile.platform === 'linkedin'
                  ? 'linkedin_rate_limit_exceeded'
                  : 'facebook_rate_limit_exceeded',
              limit: snapshot.limit,
              currentCount: snapshot.currentCount,
              windowResetAt: snapshot.windowResetAt.toISOString(),
            };
            res.status(409).json(body);
            return;
          }

          if (
            ownedProfile.platform === 'twitter' &&
            budget.warnThresholdHit &&
            notificationQueue
          ) {
            await enqueueWarnNotification(notificationQueue, {
              profileId: existingPost.profileId,
              currentUsage: budget.currentUsage!,
              monthlyBudget: budget.budget!,
              warnThresholdPercent: budget.warnThresholdPercent!,
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
        const correlationId = requestCorrelationId(req);
        await publishQueueService.enqueuePublish(
          updatedPost.id,
          updatedPost.postVersion,
          new Date(updatedPost.scheduledAt),
          correlationId,
        );
      }

      res.json(updatedPost);
    } catch (err: unknown) {
      if (err instanceof AppError) {
        // T-DATA-01 invariant 2: PLATFORM_IMMUTABLE → 409 with the canonical
        // platform_immutable code shape so the UI can render the right toast.
        if (err.code === 'PLATFORM_IMMUTABLE') {
          res.status(409).json({ code: 'platform_immutable', message: err.message });
          return;
        }
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
      if (err instanceof AppError) {
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
          throw new AppError('Post not found', 404);
        }

        if (existingPost.status !== 'failed') {
          throw new AppError(
            'Only failed posts can be retried.',
            409,
          );
        }

        const retryPatch = planRetryFailedPost({
          status: existingPost.status as PostStatus,
        });

        const [updatedPostRow] = await tx
          .update(posts)
          .set({
            status: retryPatch.status,
            failureReason: retryPatch.failureReason,
            failedAt: retryPatch.failedAt,
            postVersion: sql`${posts.postVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
          .returning();

        return updatedPostRow;
      });

      if (publishQueueService) {
        const correlationId = requestCorrelationId(req);
        await publishQueueService.enqueuePublish(
          updated.id,
          updated.postVersion,
          new Date(),
          correlationId,
        );
      }

      res.status(200).json(updated);
    } catch (err: unknown) {
      if (err instanceof AppError) {
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
