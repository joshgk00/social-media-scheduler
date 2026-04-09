import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import session from 'express-session';
import { createSessionMiddleware } from '../middleware/session.js';
import { createMockRedis } from './helpers/mock-redis.js';

// To test session config, we inspect the middleware by creating a test app
// and verifying the session behavior

describe('createSessionMiddleware', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    mockRedis = createMockRedis();
  });

  it('session has rolling: true (sliding window resets maxAge on each request)', async () => {
    const middleware = createSessionMiddleware(mockRedis, 'test-secret-long-enough-for-session');

    // Create a minimal app to verify rolling behavior
    const app = express();
    app.use(middleware);
    app.get('/test', (req, res) => {
      req.session.userId = 'test-user';
      res.json({ sessionId: req.sessionID });
    });

    const agent = request.agent(app);
    const res1 = await agent.get('/test');
    expect(res1.status).toBe(200);

    // Second request should get a set-cookie header because rolling: true
    // resends the cookie with updated maxAge on each request
    const res2 = await agent.get('/test');
    expect(res2.status).toBe(200);
    // Rolling sessions will set a new cookie on each response
    expect(res2.headers['set-cookie']).toBeDefined();
  });

  it('session cookie is named sms.sid', async () => {
    const middleware = createSessionMiddleware(mockRedis, 'test-secret-long-enough-for-session');

    const app = express();
    app.use(middleware);
    app.get('/test', (req, res) => {
      req.session.userId = 'test-user';
      res.json({ ok: true });
    });

    const res = await request(app).get('/test');
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieString = Array.isArray(cookies) ? cookies[0] : cookies;
    expect(cookieString).toContain('sms.sid=');
  });

  it('session cookie maxAge is 24 hours (86400000 ms)', async () => {
    const middleware = createSessionMiddleware(mockRedis, 'test-secret-long-enough-for-session');

    const app = express();
    app.use(middleware);
    app.get('/test', (req, res) => {
      req.session.userId = 'test-user';
      // Read the cookie config
      const maxAge = req.session.cookie.maxAge;
      res.json({ maxAge });
    });

    const res = await request(app).get('/test');
    expect(res.body.maxAge).toBe(86400000);
  });

  it('session cookie httpOnly is true', async () => {
    const middleware = createSessionMiddleware(mockRedis, 'test-secret-long-enough-for-session');

    const app = express();
    app.use(middleware);
    app.get('/test', (req, res) => {
      req.session.userId = 'test-user';
      res.json({ httpOnly: req.session.cookie.httpOnly });
    });

    const res = await request(app).get('/test');
    expect(res.body.httpOnly).toBe(true);

    // Also verify HttpOnly flag in the Set-Cookie header
    const cookies = res.headers['set-cookie'];
    const cookieString = Array.isArray(cookies) ? cookies[0] : cookies;
    expect(cookieString).toContain('HttpOnly');
  });

  it('session cookie sameSite is strict', async () => {
    const middleware = createSessionMiddleware(mockRedis, 'test-secret-long-enough-for-session');

    const app = express();
    app.use(middleware);
    app.get('/test', (req, res) => {
      req.session.userId = 'test-user';
      res.json({ sameSite: req.session.cookie.sameSite });
    });

    const res = await request(app).get('/test');
    expect(res.body.sameSite).toBe('strict');

    const cookies = res.headers['set-cookie'];
    const cookieString = Array.isArray(cookies) ? cookies[0] : cookies;
    expect(cookieString).toContain('SameSite=Strict');
  });

  it('session prefix is sms:sess: (Redis key prefix)', async () => {
    const middleware = createSessionMiddleware(mockRedis, 'test-secret-long-enough-for-session');

    const app = express();
    app.use(middleware);
    app.get('/test', (req, res) => {
      req.session.userId = 'test-user';
      res.json({ sessionId: req.sessionID });
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);

    // Check that Redis set was called with the correct prefix
    const setCalls = mockRedis.set.mock.calls;
    expect(setCalls.length).toBeGreaterThan(0);
    const key = setCalls[0][0] as string;
    expect(key).toMatch(/^sms:sess:/);
  });

  it('session destroy function is available and callable', async () => {
    const middleware = createSessionMiddleware(mockRedis, 'test-secret-long-enough-for-session');

    const app = express();
    app.use(middleware);

    let destroyCalled = false;
    app.get('/test', (req, res) => {
      req.session.userId = 'test-user';
      // Verify destroy is a function on the session object
      expect(typeof req.session.destroy).toBe('function');
      destroyCalled = true;
      res.json({ hasDestroy: typeof req.session.destroy === 'function' });
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body.hasDestroy).toBe(true);
    expect(destroyCalled).toBe(true);
  });

  it('session persists userId across requests (session store is functional)', async () => {
    const middleware = createSessionMiddleware(mockRedis, 'test-secret-long-enough-for-session');

    const app = express();
    app.use(middleware);
    app.get('/login', (req, res) => {
      req.session.userId = 'test-user';
      res.json({ loggedIn: true });
    });
    app.get('/check', (req, res) => {
      res.json({ userId: req.session.userId || null });
    });

    const agent = request.agent(app);

    // Login to create session
    const loginRes = await agent.get('/login');
    expect(loginRes.body.loggedIn).toBe(true);

    // Verify session persists across requests
    const check = await agent.get('/check');
    expect(check.body.userId).toBe('test-user');
  });
});
