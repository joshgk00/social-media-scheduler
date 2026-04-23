import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import sharp from 'sharp';
import { eq, and, isNull } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { PLATFORM_MEDIA_LIMITS, JOB_NAMES, AppError } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { StorageBackend } from '@sms/shared/storage';
import type { Db } from '@sms/db';
import { postMedia } from '@sms/db';

const logger = createLogger('media-service');

// Subclass exists so structured logs show 'MediaServiceError' instead of 'AppError'.
// All behavior comes from AppError; the subclass adds no fields or methods.
export class MediaServiceError extends AppError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
  }
}

const IMAGE_MIME_PREFIXES = ['image/'];
const FORMAT_TO_EXT: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
  tiff: 'tiff',
  bmp: 'bmp',
};

function formatToExt(format: string): string {
  return FORMAT_TO_EXT[format] || format;
}

function buildStorageKey(profileId: string, uuid: string, ext: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `media/${profileId}/${year}/${month}/${uuid}.${ext}`;
}

interface ProcessImageParams {
  tempFilePath: string;
  originalName: string;
  mimeType: string;
  profileId: string;
  platform: string;
  storage: StorageBackend;
  db: Db;
}

export async function processImageUpload(params: ProcessImageParams) {
  const { tempFilePath, originalName, mimeType, profileId, platform, storage, db } = params;

  if (!IMAGE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    throw new Error(`${originalName} is not a supported image type.`);
  }

  try {
    const metadata = await sharp(tempFilePath).metadata();
    const imageWidth = metadata.width ?? 0;
    const imageHeight = metadata.height ?? 0;
    const format = metadata.format ?? 'jpeg';

    const limits = PLATFORM_MEDIA_LIMITS[platform];
    const needsResize =
      limits?.maxImageWidth &&
      limits?.maxImageHeight &&
      (imageWidth > limits.maxImageWidth || imageHeight > limits.maxImageHeight);

    let processedBuffer: Buffer;
    if (needsResize) {
      processedBuffer = await sharp(tempFilePath)
        .rotate()
        .resize(limits.maxImageWidth, limits.maxImageHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toBuffer();
    } else {
      processedBuffer = await sharp(tempFilePath).rotate().toBuffer();
    }

    // Re-read dimensions from the processed buffer
    const processedMeta = await sharp(processedBuffer).metadata();
    const resizedWidth = processedMeta.width ?? imageWidth;
    const resizedHeight = processedMeta.height ?? imageHeight;

    const fileUuid = randomUUID();
    const ext = formatToExt(format);
    const storageKey = buildStorageKey(profileId, fileUuid, ext);
    const thumbnailKey = buildStorageKey(profileId, `${fileUuid}_thumb`, ext);

    await storage.save(storageKey, processedBuffer, mimeType);

    const thumbnailBuffer = await sharp(processedBuffer)
      .resize(300, undefined, { withoutEnlargement: true })
      .toBuffer();
    await storage.save(thumbnailKey, thumbnailBuffer, mimeType);

    const insertChain = db.insert(postMedia).values({
      postId: null,
      filePath: storageKey,
      fileName: originalName,
      mimeType,
      fileSize: processedBuffer.length,
      width: resizedWidth,
      height: resizedHeight,
      thumbnailPath: thumbnailKey,
      sortOrder: 0,
      transcodeStatus: 'not_applicable',
    }).returning();

    const [insertedRow] = await insertChain;

    const thumbnailUrl = storage.getUrl(thumbnailKey);

    logger.info(
      { mediaId: insertedRow.id, profileId, storageKey },
      'Image uploaded and processed',
    );

    return {
      id: insertedRow.id,
      fileName: originalName,
      mimeType,
      fileSize: processedBuffer.length,
      thumbnailUrl,
      transcodeStatus: 'not_applicable' as const,
    };
  } finally {
    try {
      await unlink(tempFilePath);
    } catch (err) {
      logger.debug({ err, tempFilePath }, 'Temp file cleanup failed');
    }
  }
}

interface ProcessVideoParams {
  tempFilePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  profileId: string;
  storage: StorageBackend;
  db: Db;
  transcodeQueue: Queue;
}

export async function processVideoUpload(params: ProcessVideoParams) {
  const { tempFilePath, originalName, mimeType, fileSize, profileId, storage, db, transcodeQueue } = params;
  const fileUuid = randomUUID();
  const ext = originalName.split('.').pop() || 'mp4';
  const storageKey = buildStorageKey(profileId, `${fileUuid}_original`, ext);

  try {
    const fileStream = createReadStream(tempFilePath);
    await storage.save(storageKey, fileStream, mimeType);

    const insertChain = db.insert(postMedia).values({
      postId: null,
      filePath: storageKey,
      fileName: originalName,
      mimeType,
      fileSize,
      thumbnailPath: null,
      sortOrder: 0,
      transcodeStatus: 'pending',
    }).returning();

    const [insertedRow] = await insertChain;

    await transcodeQueue.add(
      JOB_NAMES.transcodeVideo,
      { mediaId: insertedRow.id, inputKey: storageKey, profileId },
      { jobId: `transcode-${insertedRow.id}`, attempts: 1 },
    );

    logger.info(
      { mediaId: insertedRow.id, profileId, storageKey },
      'Video uploaded and transcode job enqueued',
    );

    return {
      id: insertedRow.id,
      fileName: originalName,
      mimeType,
      fileSize,
      thumbnailUrl: null,
      transcodeStatus: 'pending' as const,
    };
  } finally {
    try {
      await unlink(tempFilePath);
    } catch (err) {
      logger.debug({ err, tempFilePath }, 'Temp file cleanup failed');
    }
  }
}

export async function getMediaStatus(db: Db, mediaId: string) {
  const rows = await db
    .select({
      id: postMedia.id,
      transcodeStatus: postMedia.transcodeStatus,
      transcodeError: postMedia.transcodeError,
    })
    .from(postMedia)
    .where(and(eq(postMedia.id, mediaId), isNull(postMedia.deletedAt)));

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}

export async function softDeleteMedia(
  db: Db,
  mediaId: string,
): Promise<void> {
  await db
    .update(postMedia)
    .set({ deletedAt: new Date() })
    .where(and(eq(postMedia.id, mediaId), isNull(postMedia.deletedAt)));
}

export async function softDeleteMediaForPost(
  db: Db,
  postId: string,
): Promise<number> {
  const updatedRows = await db
    .update(postMedia)
    .set({ deletedAt: new Date() })
    .where(and(eq(postMedia.postId, postId), isNull(postMedia.deletedAt)))
    .returning({ id: postMedia.id });

  return updatedRows.length;
}

export async function retryTranscode(
  db: Db,
  transcodeQueue: Queue,
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
    .where(and(eq(postMedia.id, mediaId), isNull(postMedia.deletedAt)));

  if (rows.length === 0 || rows[0].transcodeStatus !== 'failed') {
    throw new MediaServiceError('Media not found or not in failed state', 404);
  }

  const mediaRow = rows[0];

  await db
    .update(postMedia)
    .set({ transcodeStatus: 'pending', transcodeError: null })
    .where(eq(postMedia.id, mediaId));

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

export async function associateMediaToPost(
  db: Db,
  postId: string,
  mediaIds: string[],
): Promise<void> {
  for (let sortOrder = 0; sortOrder < mediaIds.length; sortOrder++) {
    const mediaId = mediaIds[sortOrder];
    await db
      .update(postMedia)
      .set({ postId, sortOrder })
      .where(and(eq(postMedia.id, mediaId), isNull(postMedia.postId)));
  }
}
