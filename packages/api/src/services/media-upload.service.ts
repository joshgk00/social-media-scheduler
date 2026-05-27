import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import type { Queue } from 'bullmq';
import sharp from 'sharp';
import { JOB_NAMES, PLATFORM_MEDIA_LIMITS } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { StorageBackend } from '@sms/shared/storage';
import type { Db } from '@sms/db';
import { postMedia } from '@sms/db';

const logger = createLogger('media-service');

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
  userId: string;
  profileId: string;
  platform: string;
  storage: StorageBackend;
  db: Db;
}

export async function processImageUpload(params: ProcessImageParams) {
  const { tempFilePath, originalName, mimeType, userId, profileId, platform, storage, db } = params;

  if (!IMAGE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    throw new Error(`${originalName} is not a supported image type.`);
  }

  try {
    const originalImage = sharp(tempFilePath);
    const metadata = await originalImage.clone().metadata();
    const imageWidth = metadata.width ?? 0;
    const imageHeight = metadata.height ?? 0;
    const format = metadata.format ?? 'jpeg';

    const limits = PLATFORM_MEDIA_LIMITS[platform];
    const needsResize =
      limits?.maxImageWidth &&
      limits?.maxImageHeight &&
      (imageWidth > limits.maxImageWidth || imageHeight > limits.maxImageHeight);

    const processedImage = originalImage.clone().rotate();
    if (needsResize) {
      processedImage.resize(limits.maxImageWidth, limits.maxImageHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    const { data: processedBuffer, info: processedInfo } = await processedImage.toBuffer({
      resolveWithObject: true,
    });
    const resizedWidth = processedInfo.width ?? imageWidth;
    const resizedHeight = processedInfo.height ?? imageHeight;

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
      userId,
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
  userId: string;
  profileId: string;
  storage: StorageBackend;
  db: Db;
  transcodeQueue: Queue;
}

export async function processVideoUpload(params: ProcessVideoParams) {
  const { tempFilePath, originalName, mimeType, fileSize, userId, profileId, storage, db, transcodeQueue } = params;
  const fileUuid = randomUUID();
  const ext = originalName.split('.').pop() || 'mp4';
  const storageKey = buildStorageKey(profileId, `${fileUuid}_original`, ext);

  try {
    const fileStream = createReadStream(tempFilePath);
    await storage.save(storageKey, fileStream, mimeType);

    const insertChain = db.insert(postMedia).values({
      userId,
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
