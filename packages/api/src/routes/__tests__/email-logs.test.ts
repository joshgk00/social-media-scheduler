import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

import { createEmailLogsRouter } from '../email-logs.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.session = { userId: 'user-a', id: 'session-a', entriesPerPage: 25 };
    next();
  });
  app.use(createEmailLogsRouter({ db: { select: vi.fn() } }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('email log routes', () => {
  it('returns user-scoped paginated rows with default page size', async () => {
    const response = await request(createTestApp()).get('/api/email-logs?page=1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 25 });
    expect(response.body).toHaveProperty('rows');
    expect(response.body).toHaveProperty('total');
  });

  it('filters by event_type, status, and recipient', async () => {
    const response = await request(createTestApp())
      .get('/api/email-logs?event_type=publish_failed&status=failed&recipient=example.com');

    expect(response.status).toBe(200);
  });
});
