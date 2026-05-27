import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AppError } from '@sms/shared';
import type { Db } from '@sms/db';
import { postMedia } from '@sms/db';

// Subclass exists so structured logs show 'MediaServiceError' instead of 'AppError'.
// All behavior comes from AppError; the subclass adds no fields or methods.
export class MediaServiceError extends AppError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
  }
}

export async function softDeleteMedia(
  db: Db,
  userId: string,
  mediaId: string,
): Promise<void> {
  await db
    .update(postMedia)
    .set({ deletedAt: new Date() })
    .where(and(eq(postMedia.id, mediaId), eq(postMedia.userId, userId), isNull(postMedia.deletedAt)));
}

export async function softDeleteMediaForPost(
  db: Db,
  userId: string,
  postId: string,
): Promise<number> {
  const updatedRows = await db
    .update(postMedia)
    .set({ deletedAt: new Date() })
    .where(and(eq(postMedia.postId, postId), eq(postMedia.userId, userId), isNull(postMedia.deletedAt)))
    .returning({ id: postMedia.id });

  return updatedRows.length;
}

export async function associateMediaToPost(
  db: Db,
  userId: string,
  postId: string,
  mediaIds: string[],
): Promise<void> {
  if (mediaIds.length === 0) {
    return;
  }

  const ownedUnclaimedMediaRows = await db
    .select({ id: postMedia.id })
    .from(postMedia)
    .where(and(
      inArray(postMedia.id, mediaIds),
      eq(postMedia.userId, userId),
      isNull(postMedia.postId),
      isNull(postMedia.deletedAt),
    ));

  if (ownedUnclaimedMediaRows.length !== mediaIds.length) {
    throw new MediaServiceError('One or more media files not found', 400);
  }

  const sortOrderCases = mediaIds.map((mediaId, sortOrder) => (
    sql`when ${postMedia.id} = ${mediaId} then ${sortOrder}`
  ));

  await db
    .update(postMedia)
    .set({
      postId,
      sortOrder: sql<number>`case ${sql.join(sortOrderCases, sql` `)} else ${postMedia.sortOrder} end`,
    })
    .where(and(
      inArray(postMedia.id, mediaIds),
      eq(postMedia.userId, userId),
      isNull(postMedia.postId),
      isNull(postMedia.deletedAt),
    ));
}
