import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createMockRedis } from './helpers/mock-redis.js';

function createMockSql() {
  return Object.assign(
    (strings: TemplateStringsArray) => Promise.resolve([{ '?column?': 1 }]),
    { end: vi.fn() },
  );
}

function createTestApp() {
  return createApp({
    redis: createMockRedis({
      get: vi.fn().mockResolvedValue(Date.now().toString()),
    }),
    sql: createMockSql(),
    db: {} as any,
    sessionSecret: 'test-secret-that-is-long-enough-for-session',
  });
}

describe('Middleware', () => {
  beforeEach(() => {
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('responses include X-Request-Id header with UUID format', async () => {
    const app = createTestApp();
    const res = await request(app).get('/health');

    expect(res.headers['x-request-id']).toBeDefined();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(res.headers['x-request-id']).toMatch(uuidRegex);
  });

  it('responses include helmet security headers', async () => {
    const app = createTestApp();
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('GET requests are not blocked by CSRF middleware', async () => {
    const app = createTestApp();
    const res = await request(app).get('/health');

    expect(res.status).not.toBe(403);
  });

  it('POST requests without CSRF token return 403', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/health')
      .send({ test: true });

    expect(res.status).toBe(403);
  });

  it('preserves existing X-Request-Id header from client', async () => {
    const app = createTestApp();
    const customId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', customId);

    expect(res.headers['x-request-id']).toBe(customId);
  });
});

describe('trust proxy (issue #50)', () => {
  beforeEach(() => {
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  // Express stores `trust proxy` as a settings key. The exact value depends
  // on how it's set: `1` becomes a function that trusts one hop and the
  // setting key `'trust proxy fn'` becomes truthy. We assert the setting
  // exists rather than coupling to the internal representation.
  it('enables `trust proxy` so X-Forwarded-Proto is honored behind a reverse proxy', () => {
    const app = createTestApp();
    // Express normalizes any non-false `trust proxy` setting into a function
    // and stores the original at `'trust proxy'` plus the resolved fn at
    // `'trust proxy fn'`. Both must be set when trust-proxy is enabled.
    expect(app.get('trust proxy')).not.toBe(false);
    expect(app.get('trust proxy fn')).toBeDefined();
    expect(typeof app.get('trust proxy fn')).toBe('function');
  });

  it('trust-proxy fn accepts the immediately-upstream proxy', () => {
    // Express stores trust-proxy as a compiled function `(addr, hopIdx) => boolean`.
    // With `app.set('trust proxy', 1)`, the function trusts ONE hop — i.e.
    // returns true at hopIdx=0 regardless of the address, so req.protocol /
    // req.secure / req.ip are read from X-Forwarded-* headers set by the
    // first proxy upstream of Express. This is the API behavior on which
    // the session and CSRF cookie-secure logic depends; without trust proxy
    // configured, this function would always return false.
    const app = createTestApp();
    const trustFn = app.get('trust proxy fn') as (
      addr: string,
      hopIdx: number,
    ) => boolean;
    expect(typeof trustFn).toBe('function');
    expect(trustFn('10.0.0.1', 0)).toBe(true);
    // Past the first hop, trust is denied — guards against header spoofing
    // through additional unknown proxies.
    expect(trustFn('10.0.0.1', 1)).toBe(false);
  });
});
