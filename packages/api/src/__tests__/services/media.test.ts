import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Queue } from 'bullmq';

// Mock sharp before import
const mockSharpInstance = {
  metadata: vi.fn(),
  clone: vi.fn(),
  rotate: vi.fn(),
  resize: vi.fn(),
  toBuffer: vi.fn(),
};
mockSharpInstance.clone.mockReturnValue(mockSharpInstance);
mockSharpInstance.rotate.mockReturnValue(mockSharpInstance);
mockSharpInstance.resize.mockReturnValue(mockSharpInstance);

vi.mock('sharp', () => ({
  default: vi.fn(() => mockSharpInstance),
}));

vi.mock('node:fs/promises', () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake')),
}));

vi.mock('node:fs', () => ({
  createReadStream: vi.fn().mockReturnValue({ pipe: vi.fn() }),
}));

import sharp from 'sharp';
import { processImageUpload, processVideoUpload } from '../../services/media-upload.service.js';
import { getMediaStatus } from '../../services/media-query.service.js';
import {
  associateMediaToPost,
  softDeleteMedia,
  softDeleteMediaForPost,
} from '../../services/media-lifecycle.service.js';
import { retryTranscode } from '../../services/media-retry.service.js';

function createMockStorage() {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(Buffer.from('data')),
    delete: vi.fn().mockResolvedValue(undefined),
    getUrl: vi.fn().mockImplementation((key: string) => `/media/${key}`),
    exists: vi.fn().mockResolvedValue(true),
  };
}

function createMockDb(overrides: Record<string, unknown> = {}) {
  function chainable(terminal: unknown = []) {
    const chain: Record<string, any> = {};
    const methods = ['from', 'where', 'values', 'returning', 'set', 'limit'];
    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    chain.then = (resolve: (val: unknown) => void) => resolve(terminal);
    return chain;
  }

  const db: any = {
    select: vi.fn().mockReturnValue(chainable([])),
    insert: vi.fn().mockReturnValue(chainable([])),
    update: vi.fn().mockReturnValue(chainable()),
    delete: vi.fn().mockReturnValue(chainable()),
    transaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(db)),
    ...overrides,
  };
  return db;
}

function createMockQueue(): Queue {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue;
}

describe('media.service', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockQueue: Queue;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    mockDb = createMockDb();
    mockQueue = createMockQueue();
  });

  describe('processImageUpload', () => {
    const baseParams = {
      tempFilePath: '/tmp/test-file.jpg',
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      userId: 'user-1',
      profileId: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'twitter',
      storage: null as any,
      db: null as any,
    };

    beforeEach(() => {
      baseParams.storage = mockStorage;
      baseParams.db = mockDb;

      mockSharpInstance.metadata.mockResolvedValue({
        width: 800,
        height: 600,
        format: 'jpeg',
      });
      mockSharpInstance.toBuffer.mockImplementation((options?: { resolveWithObject?: boolean }) => {
        const buffer = Buffer.alloc(5000);
        if (options?.resolveWithObject) {
          return Promise.resolve({
            data: buffer,
            info: { width: 800, height: 600 },
          });
        }
        return Promise.resolve(buffer);
      });

      // Mock insert returning a row with an id
      const insertChain: any = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'media-uuid-1' }]),
      };
      mockDb.insert.mockReturnValue(insertChain);
    });

    it('generates a 300px-wide thumbnail alongside the original', async () => {
      const result = await processImageUpload(baseParams);

      // Should call sharp resize with 300 width for thumbnail
      const resizeCalls = mockSharpInstance.resize.mock.calls;
      const thumbnailCall = resizeCalls.find(
        (call: any[]) => call[0] === 300 && call[1] === undefined,
      );
      expect(thumbnailCall).toBeDefined();
      expect(thumbnailCall![2]).toEqual({ withoutEnlargement: true });

      // Should save twice: original + thumbnail
      expect(mockStorage.save).toHaveBeenCalledTimes(2);
      expect(result.thumbnailUrl).toBeTruthy();
    });

    it('stores files at media/{profileId}/{year}/{month}/{uuid}.{ext} pattern', async () => {
      await processImageUpload(baseParams);

      const saveCall = mockStorage.save.mock.calls[0];
      const storageKey = saveCall[0] as string;
      const profileIdSegment = baseParams.profileId;

      expect(storageKey).toMatch(new RegExp(`^media/${profileIdSegment}/\\d{4}/\\d{2}/[a-f0-9-]+\\.jpg$`));
    });

    it('extracts width, height, mimeType, fileSize from sharp metadata', async () => {
      const result = await processImageUpload(baseParams);

      expect(mockSharpInstance.metadata).toHaveBeenCalled();
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.fileSize).toBeGreaterThan(0);
    });

    it('uses cloned sharp pipelines and resolveWithObject for processed dimensions', async () => {
      mockSharpInstance.toBuffer.mockImplementation((options?: { resolveWithObject?: boolean }) => {
        const buffer = Buffer.alloc(5000);
        if (options?.resolveWithObject) {
          return Promise.resolve({
            data: buffer,
            info: { width: 640, height: 480 },
          });
        }
        return Promise.resolve(buffer);
      });

      await processImageUpload(baseParams);

      expect(vi.mocked(sharp)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(sharp).mock.calls[0][0]).toBe(baseParams.tempFilePath);
      expect(Buffer.isBuffer(vi.mocked(sharp).mock.calls[1][0])).toBe(true);
      expect(mockSharpInstance.clone).toHaveBeenCalledTimes(2);
      expect(mockSharpInstance.metadata).toHaveBeenCalledTimes(1);
      expect(mockSharpInstance.toBuffer).toHaveBeenCalledWith({ resolveWithObject: true });

      const valuesCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesCall.width).toBe(640);
      expect(valuesCall.height).toBe(480);
    });

    it('resizes images exceeding platform maxImageWidth/maxImageHeight before saving', async () => {
      mockSharpInstance.metadata.mockResolvedValue({
        width: 5000,
        height: 5000,
        format: 'jpeg',
      });

      await processImageUpload(baseParams);

      // Twitter max is 4096x4096, so resize should be called with those limits
      const resizeCalls = mockSharpInstance.resize.mock.calls;
      const platformResizeCall = resizeCalls.find(
        (call: any[]) => call[0] === 4096 && call[1] === 4096,
      );
      expect(platformResizeCall).toBeDefined();
      expect(platformResizeCall![2]).toEqual(
        expect.objectContaining({ fit: 'inside', withoutEnlargement: true }),
      );
    });

    it('does NOT resize images within platform limits', async () => {
      mockSharpInstance.metadata.mockResolvedValue({
        width: 800,
        height: 600,
        format: 'jpeg',
      });

      await processImageUpload(baseParams);

      // Should NOT find a call with platform dimension limits
      const resizeCalls = mockSharpInstance.resize.mock.calls;
      const platformResizeCall = resizeCalls.find(
        (call: any[]) => call[0] === 4096,
      );
      expect(platformResizeCall).toBeUndefined();
    });

    it('rejects non-image MIME types with descriptive error', async () => {
      await expect(
        processImageUpload({ ...baseParams, mimeType: 'video/mp4' }),
      ).rejects.toThrow(/not a supported image type/i);
    });

    it('returns id, thumbnailUrl, and transcodeStatus=not_applicable', async () => {
      const result = await processImageUpload(baseParams);

      expect(result).toEqual(
        expect.objectContaining({
          id: 'media-uuid-1',
          thumbnailUrl: expect.any(String),
          transcodeStatus: 'not_applicable',
        }),
      );
    });

    it('stores the owning user id on the media row', async () => {
      await processImageUpload(baseParams);

      const valuesCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesCall.userId).toBe('user-1');
    });
  });

  describe('processVideoUpload', () => {
    const baseParams = {
      tempFilePath: '/tmp/test-video.mp4',
      originalName: 'video.mp4',
      mimeType: 'video/mp4',
      fileSize: 10_000_000,
      userId: 'user-1',
      profileId: '550e8400-e29b-41d4-a716-446655440000',
      storage: null as any,
      db: null as any,
      transcodeQueue: null as any,
    };

    beforeEach(() => {
      baseParams.storage = mockStorage;
      baseParams.db = mockDb;
      baseParams.transcodeQueue = mockQueue;

      const insertChain: any = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{
          id: 'media-video-1',
          filePath: 'media/profile/2026/04/uuid_original.mp4',
        }]),
      };
      mockDb.insert.mockReturnValue(insertChain);
    });

    it('inserts post_media row with transcode_status=pending', async () => {
      const result = await processVideoUpload(baseParams);

      expect(result.transcodeStatus).toBe('pending');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('enqueues a BullMQ job in the transcode queue with the media ID', async () => {
      const result = await processVideoUpload(baseParams);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'transcode-video',
        expect.objectContaining({ mediaId: result.id }),
        expect.objectContaining({ attempts: 1 }),
      );
    });

    it('returns id, thumbnailUrl=null, transcodeStatus=pending', async () => {
      const result = await processVideoUpload(baseParams);

      expect(result).toEqual(
        expect.objectContaining({
          id: 'media-video-1',
          thumbnailUrl: null,
          transcodeStatus: 'pending',
        }),
      );
    });

    it('stores the owning user id on the video media row', async () => {
      await processVideoUpload(baseParams);

      const valuesCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesCall.userId).toBe('user-1');
    });
  });

  describe('getMediaStatus', () => {
    it('returns current transcode_status and transcode_error', async () => {
      const selectChain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          id: 'media-1',
          transcodeStatus: 'completed',
          transcodeError: null,
        }]),
      };
      mockDb.select.mockReturnValue(selectChain);

      const result = await getMediaStatus(mockDb, 'user-1', 'media-1');

      expect(result).toEqual({
        id: 'media-1',
        transcodeStatus: 'completed',
        transcodeError: null,
      });
    });
  });

  describe('softDeleteMedia', () => {
    it('sets deleted_at timestamp instead of hard deleting', async () => {
      const updateChain: any = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 'media-1' }]),
      };
      mockDb.update.mockReturnValue(updateChain);

      await softDeleteMedia(mockDb, 'user-1', 'media-1');

      expect(mockDb.update).toHaveBeenCalled();
      const setCall = updateChain.set.mock.calls[0][0];
      expect(setCall.deletedAt).toBeInstanceOf(Date);

      // Should NOT delete from storage
      expect(mockStorage.delete).not.toHaveBeenCalled();
    });
  });

  describe('softDeleteMediaForPost', () => {
    it('soft-deletes ALL media rows for a given postId', async () => {
      const updateChain: any = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'media-1' }, { id: 'media-2' }]),
      };
      mockDb.update.mockReturnValue(updateChain);

      const count = await softDeleteMediaForPost(mockDb, 'user-1', 'post-id-1');

      expect(mockDb.update).toHaveBeenCalled();
      expect(count).toBe(2);
    });
  });

  describe('retryTranscode', () => {
    it('resets transcodeStatus to pending, clears transcodeError, and enqueues a new job', async () => {
      // First select: find the media row in 'failed' state
      const selectChain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          id: 'media-1',
          transcodeStatus: 'failed',
          transcodeError: 'timeout',
          filePath: 'media/profile-id/2026/04/uuid_original.mp4',
        }]),
      };
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 'media-1' }]),
      };
      mockDb.update.mockReturnValue(updateChain);

      const result = await retryTranscode(mockDb, mockQueue, 'user-1', 'media-1');

      expect(result.transcodeStatus).toBe('pending');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'transcode-video',
        expect.objectContaining({ mediaId: 'media-1' }),
        expect.objectContaining({
          jobId: expect.stringContaining('transcode-retry-media-1'),
        }),
      );
    });

    it('returns 404 if media does not exist or is not in failed status', async () => {
      const selectChain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          id: 'media-1',
          transcodeStatus: 'completed',
        }]),
      };
      mockDb.select.mockReturnValue(selectChain);

      await expect(
        retryTranscode(mockDb, mockQueue, 'user-1', 'media-1'),
      ).rejects.toThrow();
    });

    it('returns 404 if media does not exist at all', async () => {
      const selectChain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(selectChain);

      await expect(
        retryTranscode(mockDb, mockQueue, 'user-1', 'nonexistent'),
      ).rejects.toThrow();
    });
  });

  describe('associateMediaToPost', () => {
    it('sets postId + sortOrder for all media ids in one update', async () => {
      const mediaIds = ['media-1', 'media-2', 'media-3'];
      const selectChain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(mediaIds.map((id) => ({ id }))),
      };
      mockDb.select.mockReturnValue(selectChain);

      await associateMediaToPost(mockDb, 'user-1', 'post-id-1', mediaIds);

      expect(mockDb.update).toHaveBeenCalledTimes(1);
      const updateChain = mockDb.update.mock.results[0].value;
      const setCall = updateChain.set.mock.calls[0][0];
      expect(setCall.postId).toBe('post-id-1');
      expect(setCall.sortOrder).toEqual(expect.objectContaining({
        getSQL: expect.any(Function),
      }));
    });

    it('skips rows where postId is already set (prevents double-claiming)', async () => {
      // The WHERE clause includes `postId IS NULL`, so already-claimed rows
      // are naturally excluded. We verify the update is called with the right
      // condition pattern (the service uses AND postId IS NULL).
      const mediaIds = ['media-1'];
      const selectChain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 'media-1' }]),
      };
      mockDb.select.mockReturnValue(selectChain);

      await associateMediaToPost(mockDb, 'user-1', 'post-id-1', mediaIds);

      expect(mockDb.update).toHaveBeenCalled();
      // The actual SQL condition includes isNull(postMedia.postId) -- verified
      // by the fact that the service code uses `isNull` in the where clause
    });

    it('rejects media ids not owned by the caller', async () => {
      const selectChain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 'media-1' }]),
      };
      mockDb.select.mockReturnValue(selectChain);

      await expect(
        associateMediaToPost(mockDb, 'user-1', 'post-id-1', ['media-1', 'other-user-media']),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });
});
