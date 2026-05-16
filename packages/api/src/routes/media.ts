import { unlink } from 'node:fs/promises';
import { Router } from 'express';
import type { Response } from 'express';
import type { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { PLATFORM_MEDIA_LIMITS } from '@sms/shared';
import type { StorageBackend } from '@sms/shared/storage';
import { socialProfiles, type Db } from '@sms/db';
import { createLogger } from '@sms/shared/logger';

import {
  processImageUpload,
  processVideoUpload,
  getMediaStatus,
  softDeleteMedia,
  retryTranscode,
} from '../services/media.service.js';
import { mediaUpload } from '../middleware/media-upload.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { validateUuidParam } from '../middleware/validation.js';

const VALID_PLATFORMS = new Set(Object.keys(PLATFORM_MEDIA_LIMITS));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const logger = createLogger('media-router');

interface MediaRouterDependencies {
  db: Db;
  storage: StorageBackend;
  transcodeQueue: Queue;
}

async function cleanupRejectedUpload(tempFilePath: string): Promise<void> {
  try {
    await unlink(tempFilePath);
  } catch (err) {
    logger.debug({ err, tempFilePath }, 'Temp file cleanup failed after upload rejection');
  }
}

async function rejectUpload(
  res: Response,
  file: { path: string },
  statusCode: number,
  payload: { error: string },
): Promise<void> {
  await cleanupRejectedUpload(file.path);
  res.status(statusCode).json(payload);
}

export function createMediaRouter({ db, storage, transcodeQueue }: MediaRouterDependencies) {
  const router = Router();

  router.post('/upload', requireAuth, mediaUpload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file provided.' });
      return;
    }

    const profileId = req.body.profileId as string;
    const platform = req.body.platform as string;
    const userId = req.session.userId!;

    if (!profileId || !UUID_PATTERN.test(profileId)) {
      await rejectUpload(res, file, 400, { error: 'A valid profileId is required.' });
      return;
    }

    if (!platform || !VALID_PLATFORMS.has(platform)) {
      await rejectUpload(res, file, 400, { error: `Platform must be one of: ${[...VALID_PLATFORMS].join(', ')}` });
      return;
    }

    const [ownedProfile] = await db
      .select({ id: socialProfiles.id })
      .from(socialProfiles)
      .where(and(eq(socialProfiles.id, profileId), eq(socialProfiles.userId, userId)))
      .limit(1);

    if (!ownedProfile) {
      await rejectUpload(res, file, 404, { error: 'Profile not found' });
      return;
    }

    const limits = PLATFORM_MEDIA_LIMITS[platform];
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');

    if (!isImage && !isVideo) {
      await rejectUpload(res, file, 400, { error: `${file.originalname} is not a supported file type.` });
      return;
    }

    // Per-platform size validation
    if (isImage) {
      const maxBytes = limits.maxImageSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        await rejectUpload(res, file, 400, {
          error: `${file.originalname} exceeds the ${limits.maxImageSizeMb} MB limit.`,
        });
        return;
      }

      if (!limits.allowedImageTypes.includes(file.mimetype)) {
        await rejectUpload(res, file, 400, { error: `${file.originalname} is not a supported file type.` });
        return;
      }
    }

    if (isVideo) {
      const maxBytes = limits.maxVideoSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        await rejectUpload(res, file, 400, {
          error: `${file.originalname} exceeds the ${limits.maxVideoSizeMb} MB limit.`,
        });
        return;
      }

      if (!limits.allowedVideoTypes.includes(file.mimetype)) {
        await rejectUpload(res, file, 400, { error: `${file.originalname} is not a supported file type.` });
        return;
      }
    }

    if (isImage) {
      const result = await processImageUpload({
        tempFilePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        userId,
        profileId,
        platform,
        storage,
        db,
      });
      res.status(201).json(result);
      return;
    }

    const result = await processVideoUpload({
      tempFilePath: file.path,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      userId,
      profileId,
      storage,
      db,
      transcodeQueue,
    });
    res.status(201).json(result);
  });

  router.get('/:id/status', requireAuth, async (req, res) => {
    const mediaId = validateUuidParam(req.params.id as string);
    const status = await getMediaStatus(db, req.session.userId!, mediaId);

    if (!status) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    res.json(status);
  });

  router.post('/:id/retry', requireAuth, async (req, res) => {
    const mediaId = validateUuidParam(req.params.id as string);
    const result = await retryTranscode(db, transcodeQueue, req.session.userId!, mediaId);
    res.json(result);
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    const mediaId = validateUuidParam(req.params.id as string);
    await softDeleteMedia(db, req.session.userId!, mediaId);
    res.status(204).send();
  });

  return router;
}
