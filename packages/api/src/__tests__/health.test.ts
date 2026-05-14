import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { RequestHandler } from 'express';
import { createMockRedis } from './helpers/mock-redis.js';

vi.mock('../middleware/csrf.js', () => ({
  doubleCsrfProtection: ((_req: any, _res: any, next: any) => next()) as RequestHandler,
  generateCsrfToken: (_req: any, _res: any) => 'test-csrf-token',
}));

function createMockSql(healthy = true) {
  if (healthy) {
    return Object.assign(
      (strings: TemplateStringsArray) => Promise.resolve([{ '?column?': 1 }]),
      { end: vi.fn() },
    );
  }
  return Object.assign(
    (strings: TemplateStringsArray) => Promise.reject(new Error('connection refused')),
    { end: vi.fn() },
  );
}

function createTestApp(redisOverrides: Record<string, any> = {}, healthySql = true) {
  // Default get returns a fresh worker heartbeat so baseline-healthy tests pass
  // without each test having to spell it out. Individual tests override as needed.
  return createApp({
    redis: createMockRedis({
      get: vi.fn().mockResolvedValue(Date.now().toString()),
      ...redisOverrides,
    }),
    sql: createMockSql(healthySql),
    db: {} as any,
    sessionSecret: 'test-secret-that-is-long-enough-for-session',
  });
}

describe('GET /health', () => {
  beforeEach(() => {
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('returns 200 with JSON body containing status, timestamp, and checks', async () => {
    const app = createTestApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('checks');
  });

  it('response checks contains postgres, redis, worker, pendingJobs, lastPublish', async () => {
    const app = createTestApp();
    const res = await request(app).get('/health');

    expect(res.body.checks).toHaveProperty('postgres');
    expect(res.body.checks).toHaveProperty('redis');
    expect(res.body.checks).toHaveProperty('worker');
    expect(res.body.checks).toHaveProperty('pendingJobs');
    expect(res.body.checks).toHaveProperty('lastPublish');
  });

  it('returns healthy status when all dependencies are up and worker heartbeat is fresh', async () => {
    const freshHeartbeat = Date.now().toString();
    const app = createTestApp({ get: vi.fn().mockResolvedValue(freshHeartbeat) });
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('returns 503 degraded when any dependency is down', async () => {
    const app = createTestApp({
      ping: vi.fn().mockRejectedValue(new Error('Redis down')),
      get: vi.fn().mockRejectedValue(new Error('Redis down')),
    });
    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
  });

  it('returns degraded when postgres is down but redis is up', async () => {
    const app = createTestApp({}, false);
    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.postgres.status).toBe('error');
    expect(res.body.checks.redis.status).toBe('ok');
  });

  it('returns degraded when worker heartbeat is stale (>60s old)', async () => {
    const staleTime = (Date.now() - 120_000).toString();
    const app = createTestApp({ get: vi.fn().mockResolvedValue(staleTime) });
    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.worker.alive).toBe(false);
    expect(res.body.checks.worker.lastHeartbeat).toBeTruthy();
  });

  it('returns degraded when worker heartbeat is null (never set)', async () => {
    const app = createTestApp({ get: vi.fn().mockResolvedValue(null) });
    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.worker.alive).toBe(false);
    expect(res.body.checks.worker.lastHeartbeat).toBeNull();
  });

  it('worker check handles redis.get failure gracefully', async () => {
    const app = createTestApp({
      get: vi.fn().mockRejectedValue(new Error('Redis get failed')),
    });
    const res = await request(app).get('/health');

    expect(res.body.checks.worker.alive).toBe(false);
    expect(res.body.checks.worker.lastHeartbeat).toBeNull();
  });
});
