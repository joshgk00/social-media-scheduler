import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { LocalStorage } from '../storage/local-storage.js';
import { S3Storage } from '../storage/s3-storage.js';
import { createStorageBackend } from '../storage/index.js';

// Mock @aws-sdk/client-s3 before any imports that use it
const sendMock = vi.fn();
const s3ClientConstructorMock = vi.fn();
const s3ClientDestroyMock = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    constructor(public config: Record<string, unknown>) {
      s3ClientConstructorMock(config);
    }

    send = sendMock;
    destroy = s3ClientDestroyMock;
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: class { constructor(public params: Record<string, unknown>) { Object.assign(this, params); } },
    GetObjectCommand: class { constructor(public params: Record<string, unknown>) { Object.assign(this, params); } },
    DeleteObjectCommand: class { constructor(public params: Record<string, unknown>) { Object.assign(this, params); } },
    HeadObjectCommand: class { constructor(public params: Record<string, unknown>) { Object.assign(this, params); } },
  };
});

describe('LocalStorage', () => {
  let tmpDir: string;
  let storage: LocalStorage;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
    storage = new LocalStorage(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('save() writes a file and get() reads it back', async () => {
    const content = Buffer.from('hello world');
    await storage.save('test/file.txt', content, 'text/plain');

    const retrieved = await storage.get('test/file.txt');
    expect(retrieved).toEqual(content);
  });

  it('save() creates parent directories automatically', async () => {
    const content = Buffer.from('nested');
    await storage.save('deep/nested/dir/file.txt', content, 'text/plain');

    const retrieved = await storage.get('deep/nested/dir/file.txt');
    expect(retrieved).toEqual(content);
  });

  it('save() does not create content-type sidecar metadata', async () => {
    await storage.save('uploads/image.jpg', Buffer.from('image'), 'image/jpeg');

    await expect(fs.access(path.join(tmpDir, 'uploads/image.jpg.meta'))).rejects.toThrow();
  });

  it('delete() removes the file', async () => {
    const content = Buffer.from('to delete');
    await storage.save('deleteme.txt', content, 'text/plain');
    await storage.delete('deleteme.txt');

    const doesExist = await storage.exists('deleteme.txt');
    expect(doesExist).toBe(false);
  });

  it('delete() does not throw for nonexistent files', async () => {
    await expect(storage.delete('nonexistent.txt')).resolves.toBeUndefined();
  });

  it('exists() returns true for existing files', async () => {
    await storage.save('exists.txt', Buffer.from('yes'), 'text/plain');
    expect(await storage.exists('exists.txt')).toBe(true);
  });

  it('exists() returns false for missing files', async () => {
    expect(await storage.exists('nope.txt')).toBe(false);
  });

  it('getUrl() returns /media/{key}', () => {
    expect(storage.getUrl('profiles/123/image.jpg')).toBe('/media/profiles/123/image.jpg');
  });

  it('destroy() is a no-op lifecycle hook', async () => {
    await expect(storage.destroy()).resolves.toBeUndefined();
  });

  it('rejects path traversal attempts with ../', async () => {
    await expect(storage.save('../escape.txt', Buffer.from('bad'), 'text/plain')).rejects.toThrow();
    await expect(storage.get('../../etc/passwd')).rejects.toThrow();
    await expect(storage.delete('foo/../../bar')).rejects.toThrow();
    await expect(storage.exists('foo/../../../etc/shadow')).rejects.toThrow();
  });

  it('rejects absolute path keys', async () => {
    await expect(storage.save('/etc/passwd', Buffer.from('bad'), 'text/plain')).rejects.toThrow();
  });
});

describe('S3Storage', () => {
  let storage: S3Storage;

  beforeEach(() => {
    sendMock.mockReset();
    s3ClientConstructorMock.mockReset();
    s3ClientDestroyMock.mockReset();

    storage = new S3Storage({
      endpoint: 'http://minio:9000',
      bucket: 'test-bucket',
      accessKey: 'testkey',
      secretKey: 'testsecret',
    });
  });

  it('save() calls PutObjectCommand with correct params', async () => {
    sendMock.mockResolvedValueOnce({});
    const body = Buffer.from('s3 content');
    await storage.save('uploads/file.jpg', body, 'image/jpeg');

    expect(sendMock).toHaveBeenCalledOnce();
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.Bucket).toBe('test-bucket');
    expect(cmd.Key).toBe('uploads/file.jpg');
    expect(cmd.Body).toBe(body);
    expect(cmd.ContentType).toBe('image/jpeg');
  });

  it('get() calls GetObjectCommand and returns Buffer', async () => {
    const bodyContent = Buffer.from('retrieved');
    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield bodyContent;
      },
    };
    sendMock.mockResolvedValueOnce({ Body: mockStream });

    const result = await storage.get('uploads/file.jpg');
    expect(result).toEqual(bodyContent);

    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.Bucket).toBe('test-bucket');
    expect(cmd.Key).toBe('uploads/file.jpg');
  });

  it('delete() calls DeleteObjectCommand', async () => {
    sendMock.mockResolvedValueOnce({});
    await storage.delete('uploads/file.jpg');

    expect(sendMock).toHaveBeenCalledOnce();
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.Bucket).toBe('test-bucket');
    expect(cmd.Key).toBe('uploads/file.jpg');
  });

  it('getUrl() returns https://{endpoint}/{bucket}/{key}', () => {
    const url = storage.getUrl('uploads/file.jpg');
    expect(url).toBe('http://minio:9000/test-bucket/uploads/file.jpg');
  });

  it('exists() returns true when HeadObject succeeds', async () => {
    sendMock.mockResolvedValueOnce({});
    expect(await storage.exists('uploads/file.jpg')).toBe(true);
  });

  it('exists() returns false when HeadObject throws NotFound', async () => {
    const notFoundError = new Error('NotFound');
    notFoundError.name = 'NotFound';
    sendMock.mockRejectedValueOnce(notFoundError);
    expect(await storage.exists('uploads/missing.jpg')).toBe(false);
  });

  it('throws a clear error when the optional AWS SDK dependency cannot load', async () => {
    const storageWithoutSdk = new S3Storage(
      {
        endpoint: 'http://minio:9000',
        bucket: 'test-bucket',
        accessKey: 'testkey',
        secretKey: 'testsecret',
      },
      async () => {
        throw new Error('Cannot find package');
      },
    );

    await expect(storageWithoutSdk.exists('uploads/file.jpg')).rejects.toThrow(
      'S3 backend requires optional dependency "@aws-sdk/client-s3"',
    );
  });

  it('destroy() is a no-op before the S3 client is initialized', async () => {
    await expect(storage.destroy()).resolves.toBeUndefined();

    expect(s3ClientConstructorMock).not.toHaveBeenCalled();
    expect(s3ClientDestroyMock).not.toHaveBeenCalled();
  });

  it('destroy() destroys the initialized S3 client', async () => {
    sendMock.mockResolvedValueOnce({});
    await storage.exists('uploads/file.jpg');

    await storage.destroy();

    expect(s3ClientDestroyMock).toHaveBeenCalledOnce();
  });
});

describe('createStorageBackend', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    sendMock.mockReset();
    s3ClientConstructorMock.mockReset();
    s3ClientDestroyMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns LocalStorage when MEDIA_STORAGE_BACKEND is unset', () => {
    delete process.env.MEDIA_STORAGE_BACKEND;
    const backend = createStorageBackend();
    expect(backend).toBeInstanceOf(LocalStorage);
    expect(s3ClientConstructorMock).not.toHaveBeenCalled();
  });

  it('returns LocalStorage when MEDIA_STORAGE_BACKEND is "local"', () => {
    process.env.MEDIA_STORAGE_BACKEND = 'local';
    const backend = createStorageBackend();
    expect(backend).toBeInstanceOf(LocalStorage);
    expect(s3ClientConstructorMock).not.toHaveBeenCalled();
  });

  it('returns an S3 backend without initializing AWS SDK until it is used', async () => {
    process.env.MEDIA_STORAGE_BACKEND = 's3';
    process.env.S3_ENDPOINT = 'http://minio:9000';
    process.env.S3_BUCKET = 'media';
    process.env.S3_ACCESS_KEY = 'key';
    process.env.S3_SECRET_KEY = 'secret';
    const backend = createStorageBackend();
    expect(backend.getUrl('uploads/file.jpg')).toBe('http://minio:9000/media/uploads/file.jpg');
    expect(s3ClientConstructorMock).not.toHaveBeenCalled();

    sendMock.mockResolvedValueOnce({});
    expect(await backend.exists('uploads/file.jpg')).toBe(true);
    expect(s3ClientConstructorMock).toHaveBeenCalledOnce();
  });

  it('destroy() on a lazy S3 backend does not initialize AWS SDK before use', async () => {
    process.env.MEDIA_STORAGE_BACKEND = 's3';
    process.env.S3_ENDPOINT = 'http://minio:9000';
    process.env.S3_BUCKET = 'media';
    process.env.S3_ACCESS_KEY = 'key';
    process.env.S3_SECRET_KEY = 'secret';
    const backend = createStorageBackend();

    await backend.destroy?.();

    expect(s3ClientConstructorMock).not.toHaveBeenCalled();
    expect(s3ClientDestroyMock).not.toHaveBeenCalled();
  });

  it('throws when MEDIA_STORAGE_BACKEND is "s3" but S3_ENDPOINT is missing', () => {
    process.env.MEDIA_STORAGE_BACKEND = 's3';
    delete process.env.S3_ENDPOINT;
    process.env.S3_BUCKET = 'media';
    process.env.S3_ACCESS_KEY = 'key';
    process.env.S3_SECRET_KEY = 'secret';
    expect(() => createStorageBackend()).toThrow('S3_ENDPOINT');
  });
});
