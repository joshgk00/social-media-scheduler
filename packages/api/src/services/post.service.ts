import { eq, and, sql, ilike, inArray, gte, lte, ne, count as drizzleCount } from 'drizzle-orm';
import { EDITABLE_STATES, DELETABLE_STATES } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { PostStatus } from '@sms/shared';
import type { Db } from '@sms/db';
import { posts, postTags, tags, socialProfiles } from '@sms/db';

const logger = createLogger('post-service');

function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

interface CreatePostInput {
  profileId: string;
  text: string;
  isThread?: boolean;
  status?: 'draft' | 'scheduled';
  scheduledAt?: string | null;
  hasSpinnableText?: boolean;
  autoDestructAfter?: string | null;
  notes?: string | null;
  tagIds?: string[];
}

interface UpdatePostInput {
  text?: string;
  isThread?: boolean;
  status?: 'draft' | 'scheduled';
  scheduledAt?: string | null;
  hasSpinnableText?: boolean;
  autoDestructAfter?: string | null;
  notes?: string | null;
  tagIds?: string[];
  postVersion: number;
}

interface PostQuery {
  status?: PostStatus;
  profileId?: string;
  tagId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class PostServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'PostServiceError';
  }
}

export async function createPost(db: Db, userId: string, input: CreatePostInput) {
  const status = input.status ?? 'draft';

  if (status === 'scheduled') {
    if (!input.scheduledAt) {
      throw new PostServiceError('scheduledAt is required when status is scheduled', 400);
    }
    if (new Date(input.scheduledAt) <= new Date()) {
      throw new PostServiceError('scheduledAt must be in the future', 400);
    }
  }

  const [ownedProfile] = await db
    .select({ id: socialProfiles.id })
    .from(socialProfiles)
    .where(and(eq(socialProfiles.id, input.profileId), eq(socialProfiles.userId, userId)));

  if (!ownedProfile) {
    throw new PostServiceError('Profile not found', 404);
  }

  const tagIds = input.tagIds ?? [];

  const post = await db.transaction(async (tx) => {
    const [insertedPost] = await tx.insert(posts).values({
      userId,
      profileId: input.profileId,
      text: input.text,
      isThread: input.isThread ?? false,
      status,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      hasSpinnableText: input.hasSpinnableText ?? false,
      autoDestructAfter: input.autoDestructAfter ?? null,
      notes: input.notes ?? null,
    }).returning();

    if (tagIds.length > 0) {
      const ownedTags = await tx.select({ id: tags.id }).from(tags)
        .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)));
      if (ownedTags.length !== tagIds.length) {
        throw new PostServiceError('One or more tags not found', 400);
      }

      await tx.insert(postTags).values(
        tagIds.map((tagId) => ({ postId: insertedPost.id, tagId })),
      );
    }

    return insertedPost;
  });

  logger.info({ postId: post.id, userId }, 'Post created');

  const postWithTags = await getPostById(db, userId, post.id);
  return postWithTags;
}

export async function updatePost(
  db: Db,
  userId: string,
  postId: string,
  input: UpdatePostInput,
) {
  const updateFields: Record<string, unknown> = {
    postVersion: sql`${posts.postVersion} + 1`,
    updatedAt: new Date(),
  };

  if (input.text !== undefined) updateFields.text = input.text;
  if (input.isThread !== undefined) updateFields.isThread = input.isThread;
  if (input.status !== undefined) updateFields.status = input.status;
  if (input.scheduledAt !== undefined) {
    updateFields.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  }
  if (input.hasSpinnableText !== undefined) updateFields.hasSpinnableText = input.hasSpinnableText;
  if (input.autoDestructAfter !== undefined) updateFields.autoDestructAfter = input.autoDestructAfter;
  if (input.notes !== undefined) updateFields.notes = input.notes;

  await db.transaction(async (tx) => {
    const updatedRows = await tx.update(posts)
      .set(updateFields)
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.userId, userId),
          eq(posts.postVersion, input.postVersion),
          inArray(posts.status, [...EDITABLE_STATES]),
        ),
      )
      .returning();

    if (updatedRows.length === 0) {
      const existingPost = await tx
        .select({ id: posts.id, status: posts.status, postVersion: posts.postVersion })
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

      if (existingPost.length === 0) {
        throw new PostServiceError('Post not found', 404);
      }

      const currentPost = existingPost[0];
      if (!EDITABLE_STATES.includes(currentPost.status as PostStatus)) {
        throw new PostServiceError(
          'This post is currently being published and cannot be edited.',
          409,
        );
      }

      throw new PostServiceError(
        'This post was modified elsewhere. Refresh to see the latest version.',
        409,
      );
    }

    if (input.tagIds !== undefined) {
      await tx.delete(postTags).where(eq(postTags.postId, postId));
      if (input.tagIds.length > 0) {
        const ownedTags = await tx.select({ id: tags.id }).from(tags)
          .where(and(eq(tags.userId, userId), inArray(tags.id, input.tagIds)));
        if (ownedTags.length !== input.tagIds.length) {
          throw new PostServiceError('One or more tags not found', 400);
        }

        await tx.insert(postTags).values(
          input.tagIds.map((tagId) => ({ postId, tagId })),
        );
      }
    }
  });

  logger.info({ postId, userId }, 'Post updated');

  return getPostById(db, userId, postId);
}

export async function deletePost(
  db: Db,
  userId: string,
  postId: string,
): Promise<boolean> {
  const deletedRows = await db.delete(posts)
    .where(
      and(
        eq(posts.id, postId),
        eq(posts.userId, userId),
        inArray(posts.status, [...DELETABLE_STATES]),
      ),
    )
    .returning({ id: posts.id });

  if (deletedRows.length === 0) {
    const existingPost = await db
      .select({ id: posts.id, status: posts.status })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

    if (existingPost.length === 0) {
      throw new PostServiceError('Post not found', 404);
    }

    throw new PostServiceError(
      'This post cannot be deleted in its current state.',
      409,
    );
  }

  logger.info({ postId, userId }, 'Post deleted');

  return true;
}

export async function getPostById(db: Db, userId: string, postId: string) {
  const postRows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

  if (postRows.length === 0) {
    return null;
  }

  const post = postRows[0];

  const postTagRows = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(eq(postTags.postId, post.id));

  return { ...post, tags: postTagRows };
}

export async function getPosts(db: Db, userId: string, query: PostQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const offset = (page - 1) * limit;

  const conditions = [eq(posts.userId, userId)];

  if (query.status) {
    conditions.push(eq(posts.status, query.status));
  }
  if (query.profileId) {
    conditions.push(eq(posts.profileId, query.profileId));
  }
  if (query.search) {
    conditions.push(ilike(posts.text, `%${escapeLikePattern(query.search)}%`));
  }

  if (query.tagId) {
    const postIdsWithTag = db
      .select({ postId: postTags.postId })
      .from(postTags)
      .where(eq(postTags.tagId, query.tagId));

    conditions.push(inArray(posts.id, postIdsWithTag));
  }

  const postRows = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(sql`${posts.scheduledAt} DESC NULLS LAST`, sql`${posts.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: drizzleCount() })
    .from(posts)
    .where(and(...conditions));

  const postIdsForTags = postRows.map((p) => p.id);
  let tagsByPostId: Record<string, Array<{ id: string; name: string; color: string }>> = {};

  if (postIdsForTags.length > 0) {
    const allTags = await db
      .select({
        postId: postTags.postId,
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(postTags)
      .innerJoin(tags, eq(postTags.tagId, tags.id))
      .where(inArray(postTags.postId, postIdsForTags));

    for (const tagRow of allTags) {
      if (!tagsByPostId[tagRow.postId]) {
        tagsByPostId[tagRow.postId] = [];
      }
      tagsByPostId[tagRow.postId].push({ id: tagRow.id, name: tagRow.name, color: tagRow.color });
    }
  }

  const postsWithTags = postRows.map((post) => ({
    ...post,
    tags: tagsByPostId[post.id] ?? [],
  }));

  return { posts: postsWithTags, total, page, limit };
}

export async function checkConflicts(
  db: Db,
  userId: string,
  profileId: string,
  scheduledAt: string,
  excludePostId?: string,
) {
  const targetTime = new Date(scheduledAt);
  const windowStart = new Date(targetTime.getTime() - 5 * 60 * 1000);
  const windowEnd = new Date(targetTime.getTime() + 5 * 60 * 1000);

  const conditions = [
    eq(posts.userId, userId),
    eq(posts.profileId, profileId),
    inArray(posts.status, ['scheduled', 'queued', 'publishing']),
    gte(posts.scheduledAt, windowStart),
    lte(posts.scheduledAt, windowEnd),
  ];

  if (excludePostId) {
    conditions.push(ne(posts.id, excludePostId));
  }

  const conflictingPosts = await db
    .select({
      id: posts.id,
      text: posts.text,
      scheduledAt: posts.scheduledAt,
      status: posts.status,
    })
    .from(posts)
    .where(and(...conditions));

  return conflictingPosts.map((post) => ({
    id: post.id,
    textPreview: post.text.length > 100 ? post.text.slice(0, 100) + '...' : post.text,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    status: post.status,
  }));
}
