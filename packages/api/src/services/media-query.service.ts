import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@sms/db';
import { postMedia } from '@sms/db';

export async function getMediaStatus(db: Db, userId: string, mediaId: string) {
  const rows = await db
    .select({
      id: postMedia.id,
      transcodeStatus: postMedia.transcodeStatus,
      transcodeError: postMedia.transcodeError,
    })
    .from(postMedia)
    .where(and(eq(postMedia.id, mediaId), eq(postMedia.userId, userId), isNull(postMedia.deletedAt)));

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}
