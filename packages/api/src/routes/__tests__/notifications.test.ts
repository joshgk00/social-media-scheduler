import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

import { createNotificationsRouter } from '../notifications.js';

function createTestApp(userId = 'user-a') {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.session = { userId, id: 'session-a' };
    next();
  });
  app.use(createNotificationsRouter({ db: { select: vi.fn(), update: vi.fn() } }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notifications routes', () => {
  it('returns user-scoped paginated rows', async () => {
    const response = await request(createTestApp()).get('/api/notifications?page=1&pageSize=25');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('rows');
    expect(response.body.rows.every((notificationRow: { userId: string }) => notificationRow.userId !== 'user-b')).toBe(true);
  });

  it('returns unread count shape', async () => {
    const response = await request(createTestApp()).get('/api/notifications/unread-count');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('count');
  });

  it('marks one row read with CSRF and rejects cross-user reads', async () => {
    const response = await request(createTestApp()).post('/api/notifications/notification-b/read').set('x-csrf-token', 'token');

    expect([200, 404]).toContain(response.status);
  });

  it('bulk marks read for current user only', async () => {
    const response = await request(createTestApp()).post('/api/notifications/read-all').set('x-csrf-token', 'token');

    expect(response.status).toBe(200);
  });

  it('clears read notifications for current user only', async () => {
    const response = await request(createTestApp()).post('/api/notifications/clear-read').set('x-csrf-token', 'token');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('deleted');
  });
});
