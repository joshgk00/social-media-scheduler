import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

import { createSystemRouter } from '../system.js';

const smtpEnv = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'sender@example.com',
  SMTP_PASS: 'secret',
  SMTP_FROM: 'Social Media Scheduler <sender@example.com>',
} as const;

function createTestApp(isAuthenticated = true) {
  const app = express();
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.session = isAuthenticated ? { userId: 'user-a', id: 'session-a' } : {};
    next();
  });
  app.use(createSystemRouter());
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const envKey of Object.keys(smtpEnv)) {
    delete process.env[envKey];
  }
});

describe('system smtp status route', () => {
  it('requires authentication', async () => {
    const response = await request(createTestApp(false)).get('/api/system/smtp-status');

    expect(response.status).toBe(401);
  });

  it('returns configured true without leaking SMTP host', async () => {
    Object.assign(process.env, smtpEnv);

    const response = await request(createTestApp()).get('/api/system/smtp-status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ configured: true });
    expect(JSON.stringify(response.body)).not.toContain(smtpEnv.SMTP_HOST);
  });

  it('returns configured false when any SMTP env var is missing', async () => {
    Object.assign(process.env, smtpEnv);
    delete process.env.SMTP_PASS;

    const response = await request(createTestApp()).get('/api/system/smtp-status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ configured: false });
  });
});
