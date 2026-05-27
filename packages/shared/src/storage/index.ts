import { requireEnv } from '../env.js';
import { LocalStorage } from './local-storage.js';
import type { S3Storage, S3StorageConfig } from './s3-storage.js';
import type { StorageBackend } from './storage-backend.js';

export { LocalStorage } from './local-storage.js';
export { S3Storage } from './s3-storage.js';
export type { S3StorageConfig } from './s3-storage.js';
export type { StorageBackend } from './storage-backend.js';

const SUPPORTED_BACKENDS = ['local', 's3'] as const;

class LazyS3Storage implements StorageBackend {
  private storagePromise?: Promise<S3Storage>;

  constructor(private readonly config: S3StorageConfig) {}

  private getStorage(): Promise<S3Storage> {
    this.storagePromise ??= import('./s3-storage.js').then(
      ({ S3Storage }) => new S3Storage(this.config),
    );
    return this.storagePromise;
  }

  async save(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string): Promise<void> {
    const storage = await this.getStorage();
    return storage.save(key, data, contentType);
  }

  async get(key: string): Promise<Buffer> {
    const storage = await this.getStorage();
    return storage.get(key);
  }

  async delete(key: string): Promise<void> {
    const storage = await this.getStorage();
    return storage.delete(key);
  }

  getUrl(key: string): string {
    return `${this.config.endpoint}/${this.config.bucket}/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    const storage = await this.getStorage();
    return storage.exists(key);
  }

  async destroy(): Promise<void> {
    if (!this.storagePromise) {
      return;
    }

    const storage = await this.storagePromise;
    await storage.destroy?.();
  }
}

export function createStorageBackend(): StorageBackend {
  const backend = process.env.MEDIA_STORAGE_BACKEND || 'local';

  if (backend === 's3') {
    return new LazyS3Storage({
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
