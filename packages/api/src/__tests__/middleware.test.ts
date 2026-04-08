import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

function createMockRedis() {
  return {
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockResolvedValue(Date.now().toString()),
  } as any;
}

function createMockSql() {
  return Object.assign(
    (strings: TemplateStringsArray) => Promise.resolve([{ '?column?': 1 }]),
    { end: vi.fn() },
  );
}

describe('Middleware', () => {
  beforeEach(() => {
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('responses include X-Request-Id header with UUID format', async () => {
    const app = createApp({ redis: createMockRedis(), sql: createMockSql() });
    const res = await request(app).get('/health');

    expect(res.headers['x-request-id']).toBeDefined();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(res.headers['x-request-id']).toMatch(uuidRegex);
  });

  it('responses include helmet security headers', async () => {
    const app = createApp({ redis: createMockRedis(), sql: createMockSql() });
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('GET requests are not blocked by CSRF middleware', async () => {
    const app = createApp({ redis: createMockRedis(), sql: createMockSql() });
    const res = await request(app).get('/health');

    expect(res.status).not.toBe(403);
  });

  it('POST requests without CSRF token return 403', async () => {
    const app = createApp({ redis: createMockRedis(), sql: createMockSql() });
    const res = await request(app)
      .post('/health')
      .send({ test: true });

    expect(res.status).toBe(403);
  });

  it('preserves existing X-Request-Id header from client', async () => {
    const app = createApp({ redis: createMockRedis(), sql: createMockSql() });
    const customId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', customId);

    expect(res.headers['x-request-id']).toBe(customId);
  });
});
