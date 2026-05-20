import { eq, and, sql, count as drizzleCount, max, lt, gt, desc, asc, type SQL } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { AppError, calculateNextRunAt, planMoveToQueue } from '@sms/shared';
import type { CreateQueueInput, UpdateQueueInput, QueueQueryInput } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { Db } from '@sms/db';
import { queues, posts, socialProfiles, users } from '@sms/db';

type QueueInsert = InferInsertModel<typeof queues>;
type PostInsert = InferInsertModel<typeof posts>;

const logger = createLogger('queue-service');

export class QueueServiceError extends AppError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
  }
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseQueueStartDate(startDate: string | null | undefined, timezone: string): Date | null {
  if (!startDate) return null;

  if (DATE_ONLY_PATTERN.test(startDate)) {
    const localStart = DateTime.fromISO(startDate, { zone: timezone }).startOf('day');
    if (!localStart.isValid) {
      throw new QueueServiceError('Invalid start date', 400);
    }
    return localStart.toJSDate();
  }

  const parsedStartDate = new Date(startDate);
  if (Number.isNaN(parsedStartDate.getTime())) {
    throw new QueueServiceError('Invalid start date', 400);
  }
  return parsedStartDate;
}

export async function createQueue(db: Db, userId: string, input: CreateQueueInput) {
  const [ownedProfile] = await db
    .select({ id: socialProfiles.id })
    .from(socialProfiles)
    .where(and(eq(socialProfiles.id, input.profileId), eq(socialProfiles.userId, userId)));

  if (!ownedProfile) {
    throw new QueueServiceError('Profile not found', 404);
  }

  const [userRow] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  const userTimezone = userRow?.timezone ?? 'UTC';
  const startDate = parseQueueStartDate(input.startDate, userTimezone);

  const nextRunAt = calculateNextRunAt(
    {
      intervalType: input.intervalType,
      intervalValue: input.intervalValue,
      intervalUnit: input.intervalUnit,
      hourSlots: input.hourSlots,
      daysOfWeek: input.daysOfWeek,
      lastPublishedAt: null,
      startDate,
    },
    userTimezone,
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
    startDate,
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

  const existingQueue = existingRows[0];

  const [userRow] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  const userTimezone = userRow?.timezone ?? 'UTC';
  const parsedStartDate = input.startDate !== undefined
    ? parseQueueStartDate(input.startDate, userTimezone)
    : undefined;

  const queuePatch: Partial<QueueInsert> = { updatedAt: new Date() };

  if (input.name !== undefined) queuePatch.name = input.name;
  if (input.profileId !== undefined) queuePatch.profileId = input.profileId;
  if (input.intervalType !== undefined) queuePatch.intervalType = input.intervalType;
  if (input.intervalValue !== undefined) queuePatch.intervalValue = input.intervalValue;
  if (input.intervalUnit !== undefined) queuePatch.intervalUnit = input.intervalUnit;
  if (input.daysOfWeek !== undefined) queuePatch.daysOfWeek = input.daysOfWeek;
  if (input.hourSlots !== undefined) queuePatch.hourSlots = input.hourSlots;
  if (input.startDate !== undefined) queuePatch.startDate = parsedStartDate ?? null;
  if (input.seasonalStart !== undefined) queuePatch.seasonalStart = input.seasonalStart;
  if (input.seasonalEnd !== undefined) queuePatch.seasonalEnd = input.seasonalEnd;
  if (input.seasonalRepeat !== undefined) queuePatch.seasonalRepeat = input.seasonalRepeat;
  if (input.isRecycling !== undefined) queuePatch.isRecycling = input.isRecycling;
  if (input.notes !== undefined) queuePatch.notes = input.notes;

  const effectiveIntervalType = (input.intervalType ?? existingQueue.intervalType) as string;
  const effectiveIntervalValue = input.intervalValue ?? existingQueue.intervalValue;
  const effectiveIntervalUnit = (input.intervalUnit ?? existingQueue.intervalUnit) as string;
  const effectiveHourSlots = (input.hourSlots ?? existingQueue.hourSlots) as number[];
  const effectiveDaysOfWeek = (input.daysOfWeek ?? existingQueue.daysOfWeek) as number[];
  const effectiveStartDate = input.startDate !== undefined
    ? parsedStartDate ?? null
    : existingQueue.startDate;

  const nextRunAt = calculateNextRunAt(
    {
      intervalType: effectiveIntervalType,
      intervalValue: effectiveIntervalValue,
      intervalUnit: effectiveIntervalUnit,
      hourSlots: effectiveHourSlots,
      daysOfWeek: effectiveDaysOfWeek,
      lastPublishedAt: existingQueue.lastPublishedAt,
      startDate: effectiveStartDate,
    },
    userTimezone,
  );
  queuePatch.nextRunAt = nextRunAt?.toJSDate() ?? null;

  const [updated] = await db
    .update(queues)
    .set(queuePatch)
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
  const whereConditions = [eq(queues.userId, userId)];
  if (filters.network && filters.network !== 'all') {
    whereConditions.push(eq(socialProfiles.platform, filters.network));
  }

  let queueRows;
  try {
    queueRows = await db
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
      .where(and(...whereConditions))
      .orderBy(queues.name);
  } catch (err) {
    logger.error({ err, userId }, 'Failed to load queues');
    throw new QueueServiceError('Unable to load queues', 500);
  }

  let postCountRows;
  try {
    postCountRows = await db
      .select({
        queueId: posts.queueId,
        postCount: drizzleCount(),
      })
      .from(posts)
      .where(and(eq(posts.userId, userId), sql`${posts.queueId} IS NOT NULL`))
      .groupBy(posts.queueId);
  } catch (err) {
    logger.error({ err, userId }, 'Failed to load post counts');
    throw new QueueServiceError('Unable to load queue statistics', 500);
  }

  const postCountMap = new Map(
    postCountRows.map((row) => [row.queueId, Number(row.postCount)]),
  );

  let filteredQueues = queueRows;

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

  return filteredQueues.map(({ profileName, network, ...q }) => ({
    ...q,
    profile: profileName ? { displayName: profileName, platform: network } : undefined,
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
      .select({ id: queues.id, profileId: queues.profileId })
      .from(queues)
      .where(and(eq(queues.id, queueId), eq(queues.userId, userId)));

    if (!queue) {
      throw new QueueServiceError('Queue not found', 404);
    }

    const [post] = await tx
      .select({ id: posts.id, status: posts.status, queueId: posts.queueId, profileId: posts.profileId })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

    if (!post) {
      throw new QueueServiceError('Post not found', 404);
    }

    if (post.profileId !== queue.profileId) {
      throw new QueueServiceError('Post profile does not match queue profile', 409);
    }

    if (post.queueId && post.queueId !== queueId) {
      throw new QueueServiceError('Post is already assigned to another queue', 409);
    }

    const [maxResult] = await tx
      .select({ maxPosition: max(posts.queuePosition) })
      .from(posts)
      .where(eq(posts.queueId, queueId));

    const nextPosition = (maxResult?.maxPosition ?? 0) + 1;

    const postPatch: Partial<PostInsert> = {
      queueId,
      queuePosition: nextPosition,
      updatedAt: new Date(),
    };

    if (post.status === 'draft') {
      const queuePatch = planMoveToQueue({
        status: post.status,
        postVersion: 0,
        scheduledAt: null,
      });
      postPatch.status = queuePatch.status;
    }

    await tx
      .update(posts)
      .set(postPatch)
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
  await db.transaction(async (tx) => {
    const [queue] = await tx
      .select({ id: queues.id })
      .from(queues)
      .where(and(eq(queues.id, queueId), eq(queues.userId, userId)));

    if (!queue) {
      throw new QueueServiceError('Queue not found', 404);
    }

    const updatedRows = await tx
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
  });

  logger.info({ queueId, postId, userId }, 'Post removed from queue');
}

export async function getQueuePosts(
  db: Db,
  userId: string,
  queueId: string,
  query: { search?: string } = {},
) {
  const [queue] = await db
    .select({ id: queues.id })
    .from(queues)
    .where(and(eq(queues.id, queueId), eq(queues.userId, userId)));

  if (!queue) {
    throw new QueueServiceError('Queue not found', 404);
  }

  const conditions = [eq(posts.queueId, queueId), eq(posts.userId, userId)];
  let orderClause: SQL = asc(posts.queuePosition);
  let headlineColumn: SQL.Aliased<string> | undefined;
  let rankColumn: SQL.Aliased<number> | undefined;
  const searchText = query.search?.trim();

  if (searchText) {
    const tsQuery = sql`plainto_tsquery('english', ${searchText})`;
    conditions.push(sql`(${posts.searchVector} || ${posts.tagSearchVector}) @@ ${tsQuery}`);
    headlineColumn = sql<string>`ts_headline('english', ${posts.text}, ${tsQuery}, 'StartSel=<b>, StopSel=</b>, MaxWords=20, MinWords=10, ShortWord=2')`.as('headline');
    rankColumn = sql<number>`ts_rank(${posts.searchVector} || ${posts.tagSearchVector}, ${tsQuery})`.as('rank');
    orderClause = sql`rank DESC, ${posts.queuePosition} ASC`;
  }

  const baseSelect = {
    id: posts.id,
    text: posts.text,
    status: posts.status,
    hasSpinnableText: posts.hasSpinnableText,
    autoDestructAfter: posts.autoDestructAfter,
    queuePosition: posts.queuePosition,
    platformPostId: posts.platformPostId,
    publishedAt: posts.publishedAt,
  };
  const selectMap = searchText
    ? {
        ...baseSelect,
        headline: headlineColumn!,
        rank: rankColumn!,
      }
    : baseSelect;

  const postRows = await db
    .select(selectMap)
    .from(posts)
    .where(and(...conditions))
    .orderBy(orderClause);

  return postRows.map((post) => ({
    ...post,
    text: post.text.length > 80 ? post.text.slice(0, 80) + '...' : post.text,
  }));
}

type SwapDirection = 'up' | 'down';

async function swapPostPosition(
  db: Db,
  userId: string,
  queueId: string,
  postId: string,
  direction: SwapDirection,
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
    if (currentPosition === null) {
      throw new QueueServiceError('Post is already at the boundary position', 409);
    }

    const positionFilter = direction === 'up'
      ? lt(posts.queuePosition, currentPosition)
      : gt(posts.queuePosition, currentPosition);
    const positionOrder = direction === 'up'
      ? desc(posts.queuePosition)
      : asc(posts.queuePosition);

    const [neighbor] = await tx
      .select({ id: posts.id, queuePosition: posts.queuePosition })
      .from(posts)
      .where(and(
        eq(posts.queueId, queueId),
        positionFilter,
        eq(posts.status, 'queued'),
      ))
      .orderBy(positionOrder)
      .limit(1);

    if (!neighbor) {
      throw new QueueServiceError('Post is already at the boundary position', 409);
    }

    await tx
      .update(posts)
      .set({ queuePosition: neighbor.queuePosition, updatedAt: new Date() })
      .where(eq(posts.id, postId));

    await tx
      .update(posts)
      .set({ queuePosition: currentPosition, updatedAt: new Date() })
      .where(eq(posts.id, neighbor.id));
  });
}

export const movePostUp = (db: Db, userId: string, queueId: string, postId: string) =>
  swapPostPosition(db, userId, queueId, postId, 'up');

export const movePostDown = (db: Db, userId: string, queueId: string, postId: string) =>
  swapPostPosition(db, userId, queueId, postId, 'down');
