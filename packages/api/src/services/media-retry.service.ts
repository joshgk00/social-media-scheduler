import type { Queue } from 'bullmq';
import { and, eq, isNull } from 'drizzle-orm';
import { JOB_NAMES } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { Db } from '@sms/db';
import { postMedia } from '@sms/db';
import { MediaServiceError } from './media-lifecycle.service.js';

const logger = createLogger('media-service');

export async function retryTranscode(
  db: Db,
  transcodeQueue: Queue,
  userId: string,
  mediaId: string,
) {
  const rows = await db
    .select({
      id: postMedia.id,
      transcodeStatus: postMedia.transcodeStatus,
      transcodeError: postMedia.transcodeError,
      filePath: postMedia.filePath,
    })
    .from(postMedia)
    .where(and(eq(postMedia.id, mediaId), eq(postMedia.userId, userId), isNull(postMedia.deletedAt)));

  if (rows.length === 0 || rows[0].transcodeStatus !== 'failed') {
    throw new MediaServiceError('Media not found or not in failed state', 404);
  }

  const mediaRow = rows[0];

  await db
    .update(postMedia)
    .set({ transcodeStatus: 'pending', transcodeError: null })
    .where(and(eq(postMedia.id, mediaId), eq(postMedia.userId, userId), isNull(postMedia.deletedAt)));

  // Derive profileId from the file path pattern: media/{profileId}/...
  const pathSegments = mediaRow.filePath.split('/');
  const profileId = pathSegments[1] || 'unknown';

  await transcodeQueue.add(
    JOB_NAMES.transcodeVideo,
    { mediaId, inputKey: mediaRow.filePath, profileId },
    { jobId: `transcode-retry-${mediaId}-${Date.now()}`, attempts: 1 },
  );

  logger.info({ mediaId }, 'Transcode retry enqueued');

  return {
    id: mediaId,
    transcodeStatus: 'pending' as const,
  };
}
