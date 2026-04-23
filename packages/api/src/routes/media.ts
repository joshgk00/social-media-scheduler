import { Router } from 'express';
import type { Queue } from 'bullmq';
import { PLATFORM_MEDIA_LIMITS } from '@sms/shared';
import type { StorageBackend } from '@sms/shared/storage';
import type { Db } from '@sms/db';

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

interface MediaRouterDependencies {
  db: Db;
  storage: StorageBackend;
  transcodeQueue: Queue;
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

    if (!profileId || !UUID_PATTERN.test(profileId)) {
      res.status(400).json({ error: 'A valid profileId is required.' });
      return;
    }

    if (!platform || !VALID_PLATFORMS.has(platform)) {
      res.status(400).json({ error: `Platform must be one of: ${[...VALID_PLATFORMS].join(', ')}` });
      return;
    }

    const limits = PLATFORM_MEDIA_LIMITS[platform];
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');

    if (!isImage && !isVideo) {
      res.status(400).json({ error: `${file.originalname} is not a supported file type.` });
      return;
    }

    // Per-platform size validation
    if (isImage) {
      const maxBytes = limits.maxImageSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        res.status(400).json({
          error: `${file.originalname} exceeds the ${limits.maxImageSizeMb} MB limit.`,
        });
        return;
      }

      if (!limits.allowedImageTypes.includes(file.mimetype)) {
        res.status(400).json({ error: `${file.originalname} is not a supported file type.` });
        return;
      }
    }

    if (isVideo) {
      const maxBytes = limits.maxVideoSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        res.status(400).json({
          error: `${file.originalname} exceeds the ${limits.maxVideoSizeMb} MB limit.`,
        });
        return;
      }

      if (!limits.allowedVideoTypes.includes(file.mimetype)) {
        res.status(400).json({ error: `${file.originalname} is not a supported file type.` });
        return;
      }
    }

    if (isImage) {
      const result = await processImageUpload({
        tempFilePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
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
      profileId,
      storage,
      db,
      transcodeQueue,
    });
    res.status(201).json(result);
  });

  router.get('/:id/status', requireAuth, async (req, res) => {
    const mediaId = validateUuidParam(req.params.id as string);
    const status = await getMediaStatus(db, mediaId);

    if (!status) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    res.json(status);
  });

  router.post('/:id/retry', requireAuth, async (req, res) => {
    const mediaId = validateUuidParam(req.params.id as string);
    const result = await retryTranscode(db, transcodeQueue, mediaId);
    res.json(result);
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    const mediaId = validateUuidParam(req.params.id as string);
    await softDeleteMedia(db, mediaId);
    res.status(204).send();
  });

  return router;
}
