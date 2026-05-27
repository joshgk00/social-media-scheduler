import { requireEnv } from '../env.js';
import { LocalStorage } from './local-storage.js';
import { S3Storage } from './s3-storage.js';
import type { StorageBackend } from './storage-backend.js';

export { LocalStorage } from './local-storage.js';
export { S3Storage } from './s3-storage.js';
export type { S3StorageConfig } from './s3-storage.js';
export type { StorageBackend } from './storage-backend.js';

const SUPPORTED_BACKENDS = ['local', 's3'] as const;

export function createStorageBackend(): StorageBackend {
  const backend = process.env.MEDIA_STORAGE_BACKEND || 'local';

  if (backend === 's3') {
    return new S3Storage({
      endpoint: requireEnv('S3_ENDPOINT'),
      bucket: requireEnv('S3_BUCKET'),
      accessKey: requireEnv('S3_ACCESS_KEY'),
      secretKey: requireEnv('S3_SECRET_KEY'),
    });
  }

  if (backend !== 'local') {
    throw new Error(
      `Unsupported MEDIA_STORAGE_BACKEND: "${backend}". Valid values: ${SUPPORTED_BACKENDS.join(', ')}`,
    );
  }

  const mediaDir = process.env.MEDIA_DIR || './data/media';
  return new LocalStorage(mediaDir);
}
