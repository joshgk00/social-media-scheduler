import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../middleware/error-handler.js';
import { correlationId } from '../middleware/correlation-id.js';
import { AppError } from '@sms/shared';

function createTestApp() {
  const app = express();
  app.use(correlationId);
  return app;
}

describe('errorHandler middleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns AppError message and statusCode regardless of environment', async () => {
    process.env.NODE_ENV = 'production';
    const app = createTestApp();
    app.get('/fail', (_req, _res, next) => {
      next(new AppError('Profile not found', 404));
    });
    app.use(errorHandler);

    const res = await request(app).get('/fail');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Profile not found');
  });

  it('returns AppError subclass message and statusCode', async () => {
    class TestServiceError extends AppError {
      constructor(message: string, statusCode: number) {
        super(message, statusCode);
      }
    }

    const app = createTestApp();
    app.get('/fail', (_req, _res, next) => {
      next(new TestServiceError('This post was modified elsewhere.', 409));
    });
    app.use(errorHandler);

    const res = await request(app).get('/fail');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This post was modified elsewhere.');
  });

  it('includes AppError subclass code when present', async () => {
    class TestServiceError extends AppError {
      public readonly code = 'profile_delete_failed';
    }

    const app = createTestApp();
    app.get('/fail', (_req, _res, next) => {
      next(new TestServiceError('Could not delete profile.', 500));
    });
    app.use(errorHandler);

    const res = await request(app).get('/fail');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      error: 'Could not delete profile.',
      code: 'profile_delete_failed',
    });
  });

  it('returns 500 for generic errors', async () => {
    const app = createTestApp();
    app.get('/fail', (_req, _res, next) => {
      next(new Error('something broke'));
    });
    app.use(errorHandler);

    const res = await request(app).get('/fail');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('correlationId');
  });

  it('returns custom status code from err.status', async () => {
    const app = createTestApp();
    app.get('/fail', (_req, _res, next) => {
      const err: any = new Error('not found');
      err.status = 404;
      next(err);
    });
    app.use(errorHandler);

    const res = await request(app).get('/fail');

    expect(res.status).toBe(404);
  });

  it('returns custom status code from err.statusCode', async () => {
    const app = createTestApp();
    app.get('/fail', (_req, _res, next) => {
      const err: any = new Error('bad request');
      err.statusCode = 400;
      next(err);
    });
    app.use(errorHandler);

    const res = await request(app).get('/fail');

    expect(res.status).toBe(400);
  });

  it('hides error details in production for non-AppError', async () => {
    process.env.NODE_ENV = 'production';
    const app = createTestApp();
    app.get('/fail', (_req, _res, next) => {
      next(new Error('sensitive internal detail'));
    });
    app.use(errorHandler);

    const res = await request(app).get('/fail');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.error).not.toContain('sensitive internal detail');
  });

  it('shows error message in development for non-AppError', async () => {
    process.env.NODE_ENV = 'development';
    const app = createTestApp();
    app.get('/fail', (_req, _res, next) => {
      next(new Error('descriptive dev error'));
    });
    app.use(errorHandler);

    const res = await request(app).get('/fail');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('descriptive dev error');
  });

  it('includes correlationId in response', async () => {
    const app = createTestApp();
    app.get('/fail', (_req, _res, next) => {
      next(new Error('oops'));
    });
    app.use(errorHandler);

    const customId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app)
      .get('/fail')
      .set('X-Request-Id', customId);

    expect(res.body.correlationId).toBe(customId);
  });

  it('logs request method and route alongside correlationId (gh#54 acceptance)', async () => {
    const logSpy = vi.spyOn(await import('../middleware/logger.js').then(m => m.logger), 'error');
    const app = createTestApp();
    app.patch('/api/profiles/:id', (_req, _res, next) => {
      next(new Error('boom'));
    });
    app.use(errorHandler);

    const customId = '550e8400-e29b-41d4-a716-446655440000';
    await request(app)
      .patch('/api/profiles/abc-123')
      .set('X-Request-Id', customId);

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: customId,
        method: 'PATCH',
        route: '/api/profiles/abc-123',
        err: expect.any(Error),
      }),
      'Unhandled error',
    );
    logSpy.mockRestore();
  });

});
