import { describe, it, expect } from 'vitest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';

// Create fresh limiter instances per test to avoid shared state.
// These mirror the config in packages/api/src/middleware/rate-limiter.ts.
function createTestLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many failed attempts. Try again in 15 minutes.' },
    skipSuccessfulRequests: true,
  });
}

// Rate limiters have skipSuccessfulRequests: true, so the test endpoint
// must return a non-2xx status for requests to count toward the limit.
function createLimiterApp(limiter: ReturnType<typeof rateLimit>) {
  const app = express();
  app.use(limiter);
  app.post('/test', (_req, res) => {
    res.status(401).json({ error: 'Invalid credentials' });
  });
  app.get('/test-ok', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('rate limiter (loginLimiter/recoveryLimiter config)', () => {
  it('passes through when under limit', async () => {
    const app = createLimiterApp(createTestLimiter());
    const res = await request(app).post('/test');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('blocks after max (5) failed requests within window', async () => {
    const limiter = createTestLimiter();
    const app = createLimiterApp(limiter);

    // 5 failed requests count toward the limit
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/test');
      expect(res.status).toBe(401);
    }

    // 6th request should be blocked
    const blocked = await request(app).post('/test');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('Too many failed attempts. Try again in 15 minutes.');
  });

  it('does not count successful requests toward limit (skipSuccessfulRequests)', async () => {
    const limiter = createTestLimiter();
    const app = createLimiterApp(limiter);

    // 10 successful requests (2xx) should not count
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/test-ok');
      expect(res.status).toBe(200);
    }

    // First failed request should still work (under limit)
    const res = await request(app).post('/test');
    expect(res.status).toBe(401);
  });
});
