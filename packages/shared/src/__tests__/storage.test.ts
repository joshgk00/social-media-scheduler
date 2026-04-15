import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { LocalStorage } from '../storage/local-storage.js';
import { S3Storage } from '../storage/s3-storage.js';
import { createStorageBackend } from '../storage/index.js';

// Mock @aws-sdk/client-s3 before any imports that use it
vi.mock('@aws-sdk/client-s3', () => {
  const sendMock = vi.fn();
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: sendMock, destroy: vi.fn() })),
    PutObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'PutObject' })),
    GetObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'GetObject' })),
    DeleteObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'DeleteObject' })),
    HeadObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'HeadObject' })),
    __sendMock: sendMock,
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
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const sdk = await import('@aws-sdk/client-s3');
    sendMock = (sdk as unknown as { __sendMock: ReturnType<typeof vi.fn> }).__sendMock;
    sendMock.mockReset();

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
});

describe('createStorageBackend', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns LocalStorage when MEDIA_STORAGE_BACKEND is unset', () => {
    delete process.env.MEDIA_STORAGE_BACKEND;
    const backend = createStorageBackend();
    expect(backend).toBeInstanceOf(LocalStorage);
  });

  it('returns LocalStorage when MEDIA_STORAGE_BACKEND is "local"', () => {
    process.env.MEDIA_STORAGE_BACKEND = 'local';
    const backend = createStorageBackend();
    expect(backend).toBeInstanceOf(LocalStorage);
  });

  it('returns S3Storage when MEDIA_STORAGE_BACKEND is "s3" and env vars set', () => {
    process.env.MEDIA_STORAGE_BACKEND = 's3';
    process.env.S3_ENDPOINT = 'http://minio:9000';
    process.env.S3_BUCKET = 'media';
    process.env.S3_ACCESS_KEY = 'key';
    process.env.S3_SECRET_KEY = 'secret';
    const backend = createStorageBackend();
    expect(backend).toBeInstanceOf(S3Storage);
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
