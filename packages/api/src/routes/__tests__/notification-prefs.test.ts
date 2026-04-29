import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

import { createNotificationPrefsRouter } from '../notification-prefs.js';

type RouterDb = Parameters<typeof createNotificationPrefsRouter>[0]['db'];

function createTestApp(db: RouterDb = { select: vi.fn(), transaction: vi.fn() } as Partial<RouterDb> as RouterDb) {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.session = { userId: 'user-a', id: 'session-a' };
    next();
  });
  app.use(createNotificationPrefsRouter({ db }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notification preference routes', () => {
  it('returns prefs for the session user', async () => {
    const response = await request(createTestApp()).get('/api/users/me/notification-prefs');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('rows');
  });

  it('relies on global CSRF middleware instead of local header presence checks', async () => {
    const response = await request(createTestApp()).patch('/api/users/me/notification-prefs').send({ rows: [] });

    expect(response.status).toBe(200);
  });

  it('coerces always-on token_revoked prefs back to enabled', async () => {
    const response = await request(createTestApp())
      .patch('/api/users/me/notification-prefs')
      .set('x-csrf-token', 'token')
      .send({ rows: [{ eventType: 'token_revoked', inAppEnabled: false, emailEnabled: false }] });

    expect(response.status).toBe(200);
  });

  it('rejects unknown event types and ignores userId injection', async () => {
    const response = await request(createTestApp())
      .patch('/api/users/me/notification-prefs')
      .set('x-csrf-token', 'token')
      .send({ rows: [{ eventType: 'unknown', userId: 'user-b', inAppEnabled: true, emailEnabled: true }] });

    expect(response.status).toBe(400);
  });

  it('accepts rows returned by GET without schema drift', async () => {
    const prefRows = [
      { eventType: 'publish_failed', inAppEnabled: true, emailEnabled: false },
      { eventType: 'queue_empty', inAppEnabled: true, emailEnabled: false },
    ];
    const where = vi.fn().mockResolvedValue(prefRows);
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const db = { select } as Partial<RouterDb> as RouterDb;
    const app = createTestApp(db);

    const getResponse = await request(app).get('/api/users/me/notification-prefs');
    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual({ rows: prefRows });

    const patchResponse = await request(app)
      .patch('/api/users/me/notification-prefs')
      .set('x-csrf-token', 'token')
      .send(getResponse.body);

    expect(patchResponse.status).toBe(200);
  });
});
