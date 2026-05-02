import { eq, and, sql, inArray, gte, lte, ne, count as drizzleCount, isNull, type SQL } from 'drizzle-orm';
import { AppError, EDITABLE_STATES, DELETABLE_STATES, transitionPost } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { PostStatus } from '@sms/shared';
import type { Db } from '@sms/db';
import { posts, postTags, tags, socialProfiles, postMedia } from '@sms/db';

import { softDeleteMediaForPost, associateMediaToPost } from './media.service.js';

const logger = createLogger('post-service');

type Platform = 'twitter' | 'linkedin' | 'facebook';

interface CreatePostInput {
  profileId: string;
  // Phase 8: discriminator. Required for new payloads; defaults to 'twitter'
  // when callers (older Phase 3-7 paths) omit it so the existing single-shape
  // contract keeps working until every caller migrates to the union.
  platform?: Platform;
  text: string;
  isThread?: boolean;
  status?: 'draft' | 'scheduled';
  scheduledAt?: string | null;
  hasSpinnableText?: boolean;
  autoDestructAfter?: string | null;
  notes?: string | null;
  tagIds?: string[];
  mediaIds?: string[];
  // Phase 8: LinkedIn-only — persisted into posts.visibility (POST-LI-03).
  visibility?: 'PUBLIC' | 'CONNECTIONS' | null;
  // Phase 8: Facebook-only — persisted into posts.link_url (POST-FB-04).
  linkUrl?: string | null;
}

interface UpdatePostInput {
  // Phase 8: T-DATA-01 invariant 2 — platform is immutable post-insert.
  // updatePost rejects if this doesn't match the existing posts.platform value.
  platform?: Platform;
  text?: string;
  isThread?: boolean;
  status?: 'draft' | 'scheduled';
  scheduledAt?: string | null;
  hasSpinnableText?: boolean;
  autoDestructAfter?: string | null;
  notes?: string | null;
  tagIds?: string[];
  mediaIds?: string[];
  visibility?: 'PUBLIC' | 'CONNECTIONS' | null;
  linkUrl?: string | null;
  postVersion: number;
}

interface PostQuery {
  status?: PostStatus;
  profileId?: string;
  tagId?: string;
  search?: string;
  searchScope?: 'posts' | 'queue' | 'calendar';
  page?: number;
  limit?: number;
}

// Subclass exists so structured logs show 'PostServiceError' instead of 'AppError'.
// Phase 8 adds an optional `code` discriminator (e.g. 'PLATFORM_MISMATCH',
// 'PLATFORM_IMMUTABLE') so route handlers can map service errors to specific
// 409 response shapes without parsing the message string.
export class PostServiceError extends AppError {
  public readonly code?: string;
  constructor(message: string, statusCode: number, code?: string) {
    super(message, statusCode);
    this.name = 'PostServiceError';
    this.code = code;
  }
}

export async function createPost(db: Db, userId: string, input: CreatePostInput) {
  const status = input.status ?? 'draft';

  if (status === 'scheduled') {
    if (!input.scheduledAt) {
      throw new PostServiceError('scheduledAt is required when status is scheduled', 400);
    }
    if (new Date(input.scheduledAt) < new Date()) {
      throw new PostServiceError('scheduledAt must be in the future', 400);
    }
  }

  const [ownedProfile] = await db
    .select({
      id: socialProfiles.id,
      platform: socialProfiles.platform,
    })
    .from(socialProfiles)
    .where(and(eq(socialProfiles.id, input.profileId), eq(socialProfiles.userId, userId)));

  if (!ownedProfile) {
    throw new PostServiceError('Profile not found', 404);
  }

  // T-DATA-01 invariant 1: posts.platform is denormalized from
  // social_profiles.platform at insert time. When the caller passes a
  // platform on the input, defensively confirm it matches the profile —
  // otherwise the inserted row would assert one platform while the
  // upstream (e.g. UI form) believed another.
  if (input.platform && input.platform !== ownedProfile.platform) {
    throw new PostServiceError(
      `Profile platform '${ownedProfile.platform}' does not match payload platform '${input.platform}'.`,
      400,
      'PLATFORM_MISMATCH',
    );
  }
  const effectivePlatform = (ownedProfile.platform ?? 'twitter') as Platform;

  const tagIds = input.tagIds ?? [];

  const post = await db.transaction(async (tx) => {
    const [insertedPost] = await tx.insert(posts).values({
      userId,
      profileId: input.profileId,
      // T-DATA-01: copy from social_profiles, never trust the payload as source.
      platform: effectivePlatform,
      text: input.text,
      isThread: input.isThread ?? false,
      status,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      hasSpinnableText: input.hasSpinnableText ?? false,
      autoDestructAfter: input.autoDestructAfter ?? null,
      notes: input.notes ?? null,
      // Phase 8: per-platform optional fields. Schema-level validation
      // (createPostSchema in @sms/shared) already rejects cross-platform
      // smuggling — these are only set when the matching variant is used.
      visibility: effectivePlatform === 'linkedin' ? input.visibility ?? 'PUBLIC' : null,
      linkUrl: effectivePlatform === 'facebook' ? input.linkUrl ?? null : null,
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

    if (input.mediaIds && input.mediaIds.length > 0) {
      await associateMediaToPost(tx, insertedPost.id, input.mediaIds);
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
  // Phase 8: per-platform optional fields. Only persisted when the caller
  // explicitly passed a value — undefined means "leave existing alone".
  if (input.visibility !== undefined) updateFields.visibility = input.visibility;
  if (input.linkUrl !== undefined) updateFields.linkUrl = input.linkUrl;

  await db.transaction(async (tx) => {
    const existingRows = await tx
      .select({
        id: posts.id,
        status: posts.status,
        postVersion: posts.postVersion,
        scheduledAt: posts.scheduledAt,
        platform: posts.platform,
      })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

    if (existingRows.length === 0) {
      throw new PostServiceError('Post not found', 404);
    }

    const existingPost = existingRows[0];

    // T-DATA-01 invariant 2: posts.platform is immutable. Reject any update
    // payload whose platform differs from the persisted value. (When the
    // caller omits platform — e.g. legacy code paths — we leave the existing
    // value alone.)
    if (input.platform && input.platform !== existingPost.platform) {
      throw new PostServiceError(
        `Cannot change post platform from '${existingPost.platform}' to '${input.platform}'.`,
        409,
        'PLATFORM_IMMUTABLE',
      );
    }

    if (!EDITABLE_STATES.includes(existingPost.status as PostStatus)) {
      throw new PostServiceError(
        'This post is currently being published and cannot be edited.',
        409,
      );
    }

    if (existingPost.postVersion !== input.postVersion) {
      throw new PostServiceError(
        'This post was modified elsewhere. Refresh to see the latest version.',
        409,
      );
    }

    if (input.status && input.status !== existingPost.status) {
      try {
        transitionPost(existingPost.status as PostStatus, input.status);
      } catch {
        throw new PostServiceError(
          `Invalid state transition from '${existingPost.status}' to '${input.status}'.`,
          409,
        );
      }
    }

    const effectiveStatus = input.status ?? existingPost.status;
    if (effectiveStatus === 'scheduled') {
      const effectiveScheduledAt = input.scheduledAt !== undefined
        ? input.scheduledAt
        : (existingPost.scheduledAt?.toISOString() ?? null);

      if (!effectiveScheduledAt) {
        throw new PostServiceError('scheduledAt is required for scheduled posts.', 400);
      }

      // Only enforce future-date when the user is actively (re)scheduling.
      // Editing a typo on a soon-to-publish post must not be blocked just because
      // the existing scheduledAt drifted into the past between request submission
      // and handling.
      const scheduledAtChanged = input.scheduledAt !== undefined;
      const statusChangedToScheduled = input.status === 'scheduled' && existingPost.status !== 'scheduled';

      if (scheduledAtChanged || statusChangedToScheduled) {
        if (new Date(effectiveScheduledAt) < new Date()) {
          throw new PostServiceError('scheduledAt must be in the future.', 400);
        }
      }
    }

    // Atomic optimistic lock: include post_version in the WHERE clause so a
    // concurrent writer that bumped the version between our SELECT and UPDATE
    // (possible under read-committed isolation) gets zero rows updated here.
    // The read-check above catches stale input early with a clear error;
    // this guard catches the narrow race window where the row changes
    // between SELECT and UPDATE inside this transaction.
    const updatedRows = await tx.update(posts)
      .set(updateFields)
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.userId, userId),
          eq(posts.postVersion, input.postVersion),
        ),
      )
      .returning({ id: posts.id });

    if (updatedRows.length === 0) {
      // Zero rows means one of: row deleted, or version bumped by a concurrent
      // writer. Re-query to distinguish so the client sees an accurate error.
      const stillExists = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
        .limit(1);

      if (stillExists.length === 0) {
        throw new PostServiceError('This post was deleted by another session.', 409);
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

    if (input.mediaIds !== undefined) {
      await tx
        .update(postMedia)
        .set({ postId: null })
        .where(eq(postMedia.postId, postId));

      if (input.mediaIds.length > 0) {
        await associateMediaToPost(tx, postId, input.mediaIds);
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
  return db.transaction(async (tx) => {
    // D-13: Soft-delete associated media before deleting the post row.
    // The SET NULL FK on post_media.postId nulls post_id when the post is deleted,
    // but deletedAt persists so the weekly cleanup worker finds and removes storage files.
    // Both operations share a transaction so a failure in either rolls back the other.
    const softDeletedMediaCount = await softDeleteMediaForPost(tx, postId);
    if (softDeletedMediaCount > 0) {
      logger.info({ postId, softDeletedMediaCount }, 'Soft-deleted media for post deletion');
    }

    const deletedRows = await tx.delete(posts)
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.userId, userId),
          inArray(posts.status, [...DELETABLE_STATES]),
        ),
      )
      .returning({ id: posts.id });

    if (deletedRows.length === 0) {
      const existingPost = await tx
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
  });
}

// All columns returned intentionally -- the edit page needs every field.
// failureReason may contain internal error details; consider filtering
// it from list responses if posts are ever exposed beyond the single owner.
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

  const mediaRows = await db
    .select({
      id: postMedia.id,
      fileName: postMedia.fileName,
      mimeType: postMedia.mimeType,
      fileSize: postMedia.fileSize,
      thumbnailPath: postMedia.thumbnailPath,
      sortOrder: postMedia.sortOrder,
      transcodeStatus: postMedia.transcodeStatus,
    })
    .from(postMedia)
    .where(and(eq(postMedia.postId, post.id), isNull(postMedia.deletedAt)))
    .orderBy(postMedia.sortOrder);

  return { ...post, tags: postTagRows, media: mediaRows };
}

export async function getPosts(db: Db, userId: string, query: PostQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const offset = (page - 1) * limit;

  const conditions = [eq(posts.userId, userId)];
  let orderClause: SQL = sql`${posts.scheduledAt} DESC NULLS LAST, ${posts.createdAt} DESC`;
  let headlineColumn: SQL.Aliased<string> | undefined;
  let rankColumn: SQL.Aliased<number> | undefined;

  if (query.status) {
    conditions.push(eq(posts.status, query.status));
  }
  if (query.profileId) {
    conditions.push(eq(posts.profileId, query.profileId));
  }
  if (query.searchScope === 'posts') {
    conditions.push(sql`${posts.status} IN ('draft', 'scheduled', 'failed')`);
  } else if (query.searchScope === 'queue') {
    conditions.push(eq(posts.status, 'queued'));
  }
  if (query.search) {
    const tsQuery = sql`plainto_tsquery('english', ${query.search})`;
    conditions.push(sql`(${posts.searchVector} || ${posts.tagSearchVector}) @@ ${tsQuery}`);
    headlineColumn = sql<string>`ts_headline('english', ${posts.text}, ${tsQuery}, 'StartSel=<b>, StopSel=</b>, MaxWords=20, MinWords=10, ShortWord=2')`.as('headline');
    rankColumn = sql<number>`ts_rank(${posts.searchVector} || ${posts.tagSearchVector}, ${tsQuery})`.as('rank');
    orderClause = sql`rank DESC`;
  }

  if (query.tagId) {
    const postIdsWithTag = db
      .select({ postId: postTags.postId })
      .from(postTags)
      .where(eq(postTags.tagId, query.tagId));

    conditions.push(inArray(posts.id, postIdsWithTag));
  }

  const baseSelect = {
    post: posts,
    profile: {
      displayName: socialProfiles.displayName,
      handle: socialProfiles.handle,
      avatarUrl: socialProfiles.avatarUrl,
    },
  };
  const selectMap = query.search
    ? {
        ...baseSelect,
        headline: headlineColumn!,
        rank: rankColumn!,
      }
    : baseSelect;

  const postRows = await db
    .select(selectMap)
    .from(posts)
    .leftJoin(socialProfiles, eq(posts.profileId, socialProfiles.id))
    .where(and(...conditions))
    .orderBy(orderClause)
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: drizzleCount() })
    .from(posts)
    .where(and(...conditions));

  const postIdsForTags = postRows.map(({ post }) => post.id);
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

  const postsWithTags = postRows.map((row) => ({
    ...row.post,
    tags: tagsByPostId[row.post.id] ?? [],
    profile: row.profile?.handle
      ? {
          displayName: row.profile.displayName ?? row.profile.handle,
          handle: row.profile.handle,
          avatarUrl: row.profile.avatarUrl ?? '',
        }
      : undefined,
    ...('headline' in row ? { headline: row.headline, rank: row.rank } : {}),
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
