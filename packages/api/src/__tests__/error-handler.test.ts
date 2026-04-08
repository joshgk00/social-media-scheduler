import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../middleware/error-handler.js';
import { correlationId } from '../middleware/correlation-id.js';

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

  it('hides error details in production', async () => {
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

  it('shows error message in development', async () => {
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
});
