import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createPostsRouter } from '../../routes/posts.js';
import { InvalidIdempotencyKeyError } from '../../services/bulk-operation.factory.js';

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440012';

describe('posts bulk operation routes', () => {
  it('returns 400 when a posts bulk operation has an invalid idempotency key', async () => {
    const bulkOperationFactory = {
      findExistingBulkOperation: vi.fn(),
      startBulkOperation: vi.fn().mockRejectedValue(new InvalidIdempotencyKeyError()),
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as typeof req & { session: { userId: string } }).session = { userId: USER_ID };
      next();
    });
    app.use(createPostsRouter({
      db: {} as never,
      bulkOperationFactory: bulkOperationFactory as never,
    }));

    const response = await request(app)
      .post('/api/posts/bulk-pause')
      .set('Idempotency-Key', 'not-a-uuid')
      .send({
        profileId: PROFILE_ID,
        scope: 'scheduled-posts',
        filter: { status: 'scheduled' },
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid Idempotency-Key header' });
    expect(bulkOperationFactory.startBulkOperation).toHaveBeenCalledTimes(1);
  });
});
