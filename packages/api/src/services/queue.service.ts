import { eq, and, sql, count as drizzleCount, max } from 'drizzle-orm';
import { AppError, transitionPost, calculateNextRunAt } from '@sms/shared';
import type { PostStatus, CreateQueueInput, UpdateQueueInput, QueueQueryInput } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { Db } from '@sms/db';
import { queues, posts, socialProfiles } from '@sms/db';

const logger = createLogger('queue-service');

export class QueueServiceError extends AppError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
  }
}

export async function createQueue(db: Db, userId: string, input: CreateQueueInput) {
  const [ownedProfile] = await db
    .select({ id: socialProfiles.id })
    .from(socialProfiles)
    .where(and(eq(socialProfiles.id, input.profileId), eq(socialProfiles.userId, userId)));

  if (!ownedProfile) {
    throw new QueueServiceError('Profile not found', 404);
  }

  const nextRunAt = calculateNextRunAt(
    {
      intervalType: input.intervalType,
      intervalValue: input.intervalValue,
      intervalUnit: input.intervalUnit,
      hourSlots: input.hourSlots,
      daysOfWeek: input.daysOfWeek,
      lastPublishedAt: null,
      startDate: input.startDate ? new Date(input.startDate) : null,
    },
    'UTC',
  );

  const [queue] = await db.insert(queues).values({
    userId,
    profileId: input.profileId,
    name: input.name,
    intervalType: input.intervalType,
    intervalValue: input.intervalValue,
    intervalUnit: input.intervalUnit,
    daysOfWeek: input.daysOfWeek,
    hourSlots: input.hourSlots,
    startDate: input.startDate ? new Date(input.startDate) : null,
    seasonalStart: input.seasonalStart ?? null,
    seasonalEnd: input.seasonalEnd ?? null,
    seasonalRepeat: input.seasonalRepeat ?? false,
    isRecycling: input.isRecycling ?? false,
    notes: input.notes ?? null,
    nextRunAt: nextRunAt?.toJSDate() ?? null,
  }).returning();

  logger.info({ queueId: queue.id, userId }, 'Queue created');

  return queue;
}

export async function updateQueue(
  db: Db,
  userId: string,
  queueId: string,
  input: UpdateQueueInput,
) {
  const existingRows = await db
    .select()
    .from(queues)
    .where(and(eq(queues.id, queueId), eq(queues.userId, userId)));

  if (existingRows.length === 0) {
    throw new QueueServiceError('Queue not found', 404);
  }

  const existing = existingRows[0];

  const updateFields: Record<string, unknown> = { updatedAt: new Date() };

  if (input.name !== undefined) updateFields.name = input.name;
  if (input.profileId !== undefined) updateFields.profileId = input.profileId;
  if (input.intervalType !== undefined) updateFields.intervalType = input.intervalType;
  if (input.intervalValue !== undefined) updateFields.intervalValue = input.intervalValue;
  if (input.intervalUnit !== undefined) updateFields.intervalUnit = input.intervalUnit;
  if (input.daysOfWeek !== undefined) updateFields.daysOfWeek = input.daysOfWeek;
  if (input.hourSlots !== undefined) updateFields.hourSlots = input.hourSlots;
  if (input.startDate !== undefined) updateFields.startDate = input.startDate ? new Date(input.startDate) : null;
  if (input.seasonalStart !== undefined) updateFields.seasonalStart = input.seasonalStart;
  if (input.seasonalEnd !== undefined) updateFields.seasonalEnd = input.seasonalEnd;
  if (input.seasonalRepeat !== undefined) updateFields.seasonalRepeat = input.seasonalRepeat;
  if (input.isRecycling !== undefined) updateFields.isRecycling = input.isRecycling;
  if (input.notes !== undefined) updateFields.notes = input.notes;

  const effectiveIntervalType = (input.intervalType ?? existing.intervalType) as string;
  const effectiveIntervalValue = input.intervalValue ?? existing.intervalValue;
  const effectiveIntervalUnit = (input.intervalUnit ?? existing.intervalUnit) as string;
  const effectiveHourSlots = (input.hourSlots ?? existing.hourSlots) as number[];
  const effectiveDaysOfWeek = (input.daysOfWeek ?? existing.daysOfWeek) as number[];
  const effectiveStartDate = input.startDate !== undefined
    ? (input.startDate ? new Date(input.startDate) : null)
    : existing.startDate;

  const nextRunAt = calculateNextRunAt(
    {
      intervalType: effectiveIntervalType,
      intervalValue: effectiveIntervalValue,
      intervalUnit: effectiveIntervalUnit,
      hourSlots: effectiveHourSlots,
      daysOfWeek: effectiveDaysOfWeek,
      lastPublishedAt: existing.lastPublishedAt,
      startDate: effectiveStartDate,
    },
    'UTC',
  );
  updateFields.nextRunAt = nextRunAt?.toJSDate() ?? null;

  const [updated] = await db
    .update(queues)
    .set(updateFields)
    .where(and(eq(queues.id, queueId), eq(queues.userId, userId)))
    .returning();

  logger.info({ queueId, userId }, 'Queue updated');

  return updated;
}

export async function deleteQueue(
  db: Db,
  userId: string,
  queueId: string,
): Promise<void> {
  const deletedRows = await db
    .delete(queues)
    .where(and(eq(queues.id, queueId), eq(queues.userId, userId)))
    .returning({ id: queues.id });

  if (deletedRows.length === 0) {
    throw new QueueServiceError('Queue not found', 404);
  }

  logger.info({ queueId, userId }, 'Queue deleted');
}

export async function getQueues(db: Db, userId: string, filters: QueueQueryInput) {
  const queueRows = await db
    .select({
      id: queues.id,
      name: queues.name,
      profileId: queues.profileId,
      profileName: socialProfiles.displayName,
      network: socialProfiles.platform,
      isPaused: queues.isPaused,
      isRecycling: queues.isRecycling,
      lastPublishedAt: queues.lastPublishedAt,
      nextRunAt: queues.nextRunAt,
      cursorPosition: queues.cursorPosition,
      seasonalStart: queues.seasonalStart,
      seasonalEnd: queues.seasonalEnd,
      hourSlots: queues.hourSlots,
      daysOfWeek: queues.daysOfWeek,
      notes: queues.notes,
    })
    .from(queues)
    .innerJoin(socialProfiles, eq(queues.profileId, socialProfiles.id))
    .where(eq(queues.userId, userId))
    .orderBy(queues.name);

  const postCountRows = await db
    .select({
      queueId: posts.queueId,
      postCount: drizzleCount(),
    })
    .from(posts)
    .where(and(eq(posts.userId, userId), sql`${posts.queueId} IS NOT NULL`))
    .groupBy(posts.queueId);

  const postCountMap = new Map(
    postCountRows.map((row) => [row.queueId, Number(row.postCount)]),
  );

  let filteredQueues = queueRows;

  if (filters.network && filters.network !== 'all') {
    filteredQueues = filteredQueues.filter((q) => q.network === filters.network);
  }

  if (filters.status && filters.status !== 'all') {
    filteredQueues = filteredQueues.filter((q) => {
      const postCount = postCountMap.get(q.id) ?? 0;
      switch (filters.status) {
        case 'active':
          return !q.isPaused && postCount > 0;
        case 'paused':
          return q.isPaused;
        case 'empty':
          return postCount === 0;
        default:
          return true;
      }
    });
  }

  return filteredQueues.map((q) => ({
    ...q,
    postCount: postCountMap.get(q.id) ?? 0,
  }));
}

export async function getQueueById(db: Db, userId: string, queueId: string) {
  const rows = await db
    .select()
    .from(queues)
    .where(and(eq(queues.id, queueId), eq(queues.userId, userId)));

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}

export async function copyQueueConfig(db: Db, userId: string, queueId: string) {
  const queue = await getQueueById(db, userId, queueId);

  if (!queue) {
    throw new QueueServiceError('Queue not found', 404);
  }

  return {
    name: queue.name,
    profileId: queue.profileId,
    intervalType: queue.intervalType,
    intervalValue: queue.intervalValue,
    intervalUnit: queue.intervalUnit,
    daysOfWeek: queue.daysOfWeek,
    hourSlots: queue.hourSlots,
    seasonalStart: queue.seasonalStart,
    seasonalEnd: queue.seasonalEnd,
    seasonalRepeat: queue.seasonalRepeat,
    isRecycling: queue.isRecycling,
    notes: queue.notes,
  };
}

export async function addPostToQueue(
  db: Db,
  userId: string,
  queueId: string,
  postId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [queue] = await tx
      .select({ id: queues.id })
      .from(queues)
      .where(and(eq(queues.id, queueId), eq(queues.userId, userId)));

    if (!queue) {
      throw new QueueServiceError('Queue not found', 404);
    }

    const [post] = await tx
      .select({ id: posts.id, status: posts.status, queueId: posts.queueId })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

    if (!post) {
      throw new QueueServiceError('Post not found', 404);
    }

    if (post.queueId && post.queueId !== queueId) {
      throw new QueueServiceError('Post is already assigned to another queue', 409);
    }

    const [maxResult] = await tx
      .select({ maxPosition: max(posts.queuePosition) })
      .from(posts)
      .where(eq(posts.queueId, queueId));

    const nextPosition = (maxResult?.maxPosition ?? 0) + 1;

    const updateFields: Record<string, unknown> = {
      queueId,
      queuePosition: nextPosition,
      updatedAt: new Date(),
    };

    if (post.status === 'draft') {
      try {
        transitionPost(post.status as PostStatus, 'queued');
        updateFields.status = 'queued';
      } catch {
        // If transition is invalid, keep current status
      }
    }

    await tx
      .update(posts)
      .set(updateFields)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));
  });

  logger.info({ queueId, postId, userId }, 'Post added to queue');
}

export async function removePostFromQueue(
  db: Db,
  userId: string,
  queueId: string,
  postId: string,
): Promise<void> {
  const [queue] = await db
    .select({ id: queues.id })
    .from(queues)
    .where(and(eq(queues.id, queueId), eq(queues.userId, userId)));

  if (!queue) {
    throw new QueueServiceError('Queue not found', 404);
  }

  const updatedRows = await db
    .update(posts)
    .set({ queueId: null, queuePosition: null, status: 'draft', updatedAt: new Date() })
    .where(
      and(
        eq(posts.id, postId),
        eq(posts.userId, userId),
        eq(posts.queueId, queueId),
        eq(posts.status, 'queued'),
      ),
    )
    .returning({ id: posts.id });

  if (updatedRows.length === 0) {
    throw new QueueServiceError('Post not found in this queue', 404);
  }

  logger.info({ queueId, postId, userId }, 'Post removed from queue');
}

export async function getQueuePosts(db: Db, userId: string, queueId: string) {
  const [queue] = await db
    .select({ id: queues.id })
    .from(queues)
    .where(and(eq(queues.id, queueId), eq(queues.userId, userId)));

  if (!queue) {
    throw new QueueServiceError('Queue not found', 404);
  }

  const postRows = await db
    .select({
      id: posts.id,
      text: posts.text,
      status: posts.status,
      hasSpinnableText: posts.hasSpinnableText,
      autoDestructAfter: posts.autoDestructAfter,
      queuePosition: posts.queuePosition,
      platformPostId: posts.platformPostId,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .where(and(eq(posts.queueId, queueId), eq(posts.userId, userId)))
    .orderBy(posts.queuePosition);

  return postRows.map((post) => ({
    ...post,
    text: post.text.length > 80 ? post.text.slice(0, 80) + '...' : post.text,
  }));
}

export async function movePostUp(
  db: Db,
  userId: string,
  queueId: string,
  postId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [queue] = await tx
      .select({ id: queues.id })
      .from(queues)
      .where(and(eq(queues.id, queueId), eq(queues.userId, userId)));

    if (!queue) {
      throw new QueueServiceError('Queue not found', 404);
    }

    const [targetPost] = await tx
      .select({ id: posts.id, queuePosition: posts.queuePosition, queueId: posts.queueId })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

    if (!targetPost || targetPost.queueId !== queueId) {
      throw new QueueServiceError('Post not found in this queue', 404);
    }

    const currentPosition = targetPost.queuePosition;
    if (currentPosition === null || currentPosition <= 1) return;

    const queuePosts = await tx
      .select({ id: posts.id, queuePosition: posts.queuePosition })
      .from(posts)
      .where(and(eq(posts.queueId, queueId), eq(posts.userId, userId)))
      .orderBy(posts.queuePosition);

    const targetIndex = queuePosts.findIndex((p) => p.id === postId);
    if (targetIndex <= 0) return;

    const previousPost = queuePosts[targetIndex - 1];
    const previousPosition = previousPost.queuePosition;

    await tx
      .update(posts)
      .set({ queuePosition: previousPosition, updatedAt: new Date() })
      .where(eq(posts.id, postId));

    await tx
      .update(posts)
      .set({ queuePosition: currentPosition, updatedAt: new Date() })
      .where(eq(posts.id, previousPost.id));
  });
}

export async function movePostDown(
  db: Db,
  userId: string,
  queueId: string,
  postId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [queue] = await tx
      .select({ id: queues.id })
      .from(queues)
      .where(and(eq(queues.id, queueId), eq(queues.userId, userId)));

    if (!queue) {
      throw new QueueServiceError('Queue not found', 404);
    }

    const [targetPost] = await tx
      .select({ id: posts.id, queuePosition: posts.queuePosition, queueId: posts.queueId })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

    if (!targetPost || targetPost.queueId !== queueId) {
      throw new QueueServiceError('Post not found in this queue', 404);
    }

    const queuePosts = await tx
      .select({ id: posts.id, queuePosition: posts.queuePosition })
      .from(posts)
      .where(and(eq(posts.queueId, queueId), eq(posts.userId, userId)))
      .orderBy(posts.queuePosition);

    const targetIndex = queuePosts.findIndex((p) => p.id === postId);
    if (targetIndex < 0 || targetIndex >= queuePosts.length - 1) return;

    const nextPost = queuePosts[targetIndex + 1];
    const currentPosition = targetPost.queuePosition;
    const nextPosition = nextPost.queuePosition;

    await tx
      .update(posts)
      .set({ queuePosition: nextPosition, updatedAt: new Date() })
      .where(eq(posts.id, postId));

    await tx
      .update(posts)
      .set({ queuePosition: currentPosition, updatedAt: new Date() })
      .where(eq(posts.id, nextPost.id));
  });
}
