import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Queue } from 'bullmq';

const mockProcessImageUpload = vi.fn();
const mockProcessVideoUpload = vi.fn();
const mockGetMediaStatus = vi.fn();
const mockSoftDeleteMedia = vi.fn();
const mockRetryTranscode = vi.fn();
const mockUnlink = vi.fn().mockResolvedValue(undefined);

vi.mock('node:fs/promises', () => ({
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

vi.mock('../../services/media.service.js', () => ({
  processImageUpload: (...args: unknown[]) => mockProcessImageUpload(...args),
  processVideoUpload: (...args: unknown[]) => mockProcessVideoUpload(...args),
  getMediaStatus: (...args: unknown[]) => mockGetMediaStatus(...args),
  softDeleteMedia: (...args: unknown[]) => mockSoftDeleteMedia(...args),
  retryTranscode: (...args: unknown[]) => mockRetryTranscode(...args),
}));

// Mock multer to simulate file uploads without real disk I/O.
// Real multer populates req.body from non-file fields and req.file from the
// file field. Our mock reads them from _mockFile and _mockBody injected
// by the withUpload helper.
vi.mock('../../middleware/media-upload.js', () => ({
  mediaUpload: {
    single: () => (req: any, _res: any, next: any) => {
      if (req._mockFile) {
        req.file = req._mockFile;
      }
      if (req._mockBody) {
        req.body = { ...req.body, ...req._mockBody };
      }
      next();
    },
  },
}));

vi.mock('../../middleware/auth-guard.js', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    next();
  },
}));

import { createMediaRouter } from '../../routes/media.js';

function createTestApp(authenticated = true) {
  const app = express();
  app.use(express.json());

  app.use((req: any, _res, next) => {
    if (authenticated) {
      req.session = { userId: 'test-user-id' };
    } else {
      req.session = {};
    }
    next();
  });

  const mockStorage = {
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(Buffer.from('data')),
    delete: vi.fn().mockResolvedValue(undefined),
    getUrl: vi.fn().mockImplementation((key: string) => `/media/${key}`),
    exists: vi.fn().mockResolvedValue(true),
  };

  const mockQueue: Queue = {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue;

  const createSelectChain = (rows: unknown[]) => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  });

  const mockDb: any = {
    select: vi.fn().mockReturnValue(createSelectChain([{ id: '550e8400-e29b-41d4-a716-446655440000' }])),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };

  const router = createMediaRouter({
    db: mockDb,
    storage: mockStorage,
    transcodeQueue: mockQueue,
  });

  app.use('/api/media', router);

  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode || 500).json({ error: err.message || 'Internal error' });
  });

  return { app, mockDb, mockStorage, mockQueue };
}

// Injects mock file and body fields into the request, simulating what real
// multer does for multipart/form-data uploads.
function withUpload(
  app: express.Express,
  file: Record<string, unknown>,
  body: Record<string, string>,
) {
  const wrappedApp = express();
  wrappedApp.use((req: any, _res, next) => {
    req._mockFile = file;
    req._mockBody = body;
    next();
  });
  wrappedApp.use(app);
  return wrappedApp;
}

describe('media routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/media/upload', () => {
    it('returns 401 without session', async () => {
      const { app } = createTestApp(false);

      const response = await request(app)
        .post('/api/media/upload')
        .send({});

      expect(response.status).toBe(401);
    });

    it('with valid image returns 201 with id, thumbnailUrl, transcodeStatus=not_applicable', async () => {
      const { app } = createTestApp();

      mockProcessImageUpload.mockResolvedValue({
        id: 'media-uuid-1',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 5000,
        thumbnailUrl: '/media/thumb.jpg',
        transcodeStatus: 'not_applicable',
      });

      const wrappedApp = withUpload(
        app,
        {
          fieldname: 'file',
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 5000,
          path: '/tmp/photo.jpg',
        },
        {
          profileId: '550e8400-e29b-41d4-a716-446655440000',
          platform: 'twitter',
        },
      );

      const response = await request(wrappedApp)
        .post('/api/media/upload');

      expect(response.status).toBe(201);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: 'media-uuid-1',
          thumbnailUrl: '/media/thumb.jpg',
          transcodeStatus: 'not_applicable',
        }),
      );
      expect(mockProcessImageUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          profileId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      );
    });

    it('with valid video returns 201 with id, thumbnailUrl=null, transcodeStatus=pending', async () => {
      const { app } = createTestApp();

      mockProcessVideoUpload.mockResolvedValue({
        id: 'media-video-1',
        fileName: 'video.mp4',
        mimeType: 'video/mp4',
        fileSize: 10_000_000,
        thumbnailUrl: null,
        transcodeStatus: 'pending',
      });

      const wrappedApp = withUpload(
        app,
        {
          fieldname: 'file',
          originalname: 'video.mp4',
          mimetype: 'video/mp4',
          size: 10_000_000,
          path: '/tmp/video.mp4',
        },
        {
          profileId: '550e8400-e29b-41d4-a716-446655440000',
          platform: 'twitter',
        },
      );

      const response = await request(wrappedApp)
        .post('/api/media/upload');

      expect(response.status).toBe(201);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: 'media-video-1',
          thumbnailUrl: null,
          transcodeStatus: 'pending',
        }),
      );
      expect(mockProcessVideoUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          profileId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      );
    });

    it('returns 404 when the profile is not owned by the caller', async () => {
      const { app, mockDb } = createTestApp();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      });

      const wrappedApp = withUpload(
        app,
        {
          fieldname: 'file',
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 5000,
          path: '/tmp/photo.jpg',
        },
        {
          profileId: '550e8400-e29b-41d4-a716-446655440000',
          platform: 'twitter',
        },
      );

      const response = await request(wrappedApp)
        .post('/api/media/upload');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Profile not found');
      expect(mockUnlink).toHaveBeenCalledWith('/tmp/photo.jpg');
      expect(mockProcessImageUpload).not.toHaveBeenCalled();
      expect(mockProcessVideoUpload).not.toHaveBeenCalled();
    });

    it('with oversized file returns 400 with error message', async () => {
      const { app } = createTestApp();

      const wrappedApp = withUpload(
        app,
        {
          fieldname: 'file',
          originalname: 'huge.jpg',
          mimetype: 'image/jpeg',
          size: 10 * 1024 * 1024, // 10MB exceeds Twitter 5MB limit
          path: '/tmp/huge.jpg',
        },
        {
          profileId: '550e8400-e29b-41d4-a716-446655440000',
          platform: 'twitter',
        },
      );

      const response = await request(wrappedApp)
        .post('/api/media/upload');

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/exceeds.*limit/i);
    });

    it('with unsupported MIME type returns 400', async () => {
      const { app } = createTestApp();

      const wrappedApp = withUpload(
        app,
        {
          fieldname: 'file',
          originalname: 'file.exe',
          mimetype: 'application/x-executable',
          size: 1000,
          path: '/tmp/file.exe',
        },
        {
          profileId: '550e8400-e29b-41d4-a716-446655440000',
          platform: 'twitter',
        },
      );

      const response = await request(wrappedApp)
        .post('/api/media/upload');

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/not a supported file type/i);
    });
  });

  describe('GET /api/media/:id/status', () => {
    it('returns current transcode status', async () => {
      const { app } = createTestApp();

      mockGetMediaStatus.mockResolvedValue({
        id: 'media-1',
        transcodeStatus: 'processing',
        transcodeError: null,
      });

      const response = await request(app)
        .get('/api/media/550e8400-e29b-41d4-a716-446655440001/status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          transcodeStatus: 'processing',
        }),
      );
      expect(mockGetMediaStatus).toHaveBeenCalledWith(
        expect.anything(),
        'test-user-id',
        '550e8400-e29b-41d4-a716-446655440001',
      );
    });
  });

  describe('POST /api/media/:id/retry', () => {
    it('re-enqueues failed transcode and returns 200', async () => {
      const { app } = createTestApp();

      mockRetryTranscode.mockResolvedValue({
        id: 'media-1',
        transcodeStatus: 'pending',
      });

      const response = await request(app)
        .post('/api/media/550e8400-e29b-41d4-a716-446655440001/retry');

      expect(response.status).toBe(200);
      expect(response.body.transcodeStatus).toBe('pending');
      expect(mockRetryTranscode).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-user-id',
        '550e8400-e29b-41d4-a716-446655440001',
      );
    });

    it('returns 404 for non-failed media', async () => {
      const { app } = createTestApp();

      mockRetryTranscode.mockRejectedValue(
        Object.assign(new Error('Media not found or not in failed state'), { statusCode: 404 }),
      );

      const response = await request(app)
        .post('/api/media/550e8400-e29b-41d4-a716-446655440001/retry');

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/media/:id', () => {
    it('soft-deletes the media record', async () => {
      const { app } = createTestApp();

      mockSoftDeleteMedia.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/media/550e8400-e29b-41d4-a716-446655440001');

      expect(response.status).toBe(204);
      expect(mockSoftDeleteMedia).toHaveBeenCalledWith(
        expect.anything(),
        'test-user-id',
        '550e8400-e29b-41d4-a716-446655440001',
      );
    });
  });
});
