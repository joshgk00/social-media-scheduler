import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { PLATFORM_MEDIA_LIMITS } from '@sms/shared';

// Build a union of all allowed MIME types across all platforms.
// This is a first-pass filter; per-platform validation happens in the route handler.
const allAllowedTypes = new Set<string>();
for (const limits of Object.values(PLATFORM_MEDIA_LIMITS)) {
  for (const t of limits.allowedImageTypes) allAllowedTypes.add(t);
  for (const t of limits.allowedVideoTypes) allAllowedTypes.add(t);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}-${Date.now()}${ext}`);
  },
});

export const mediaUpload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB absolute max (Facebook video D-03)
  },
  fileFilter: (_req, file, cb) => {
    if (allAllowedTypes.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`${file.originalname} is not a supported file type.`));
    }
  },
});
