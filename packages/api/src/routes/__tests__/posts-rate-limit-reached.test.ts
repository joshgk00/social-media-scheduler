import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { DateTime, Settings } from 'luxon';
import { JOB_NAMES, rateLimitReachedNotificationSchema } from '@sms/shared';

import { createPostsRateLimitReachedTestApp } from './helpers/posts-rate-limit-reached-app.js';

beforeEach(() => {
  vi.clearAllMocks();
  Settings.now = () => DateTime.fromISO('2026-04-28T12:00:00Z').toMillis();
});

describe('posts rate_limit_reached producer', () => {
  it('POST enqueues one reached notification per profile and billing month', async () => {
    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
    const app = createPostsRateLimitReachedTestApp({ notificationQueue, blockThresholdHit: true });

    const response = await request(app).post('/api/posts').send({ platform: 'twitter' });

    expect(response.status).toBe(409);
    expect(notificationQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.rateLimitReachedNotification,
      expect.objectContaining({ kind: 'rate_limit_reached', userId: expect.any(String), correlationId: expect.any(String) }),
      expect.objectContaining({ jobId: expect.stringMatching(/^rate-limit-reached:/) }),
    );
    expect(rateLimitReachedNotificationSchema.safeParse(notificationQueue.add.mock.calls[0][1]).success).toBe(true);
  });

  it('PATCH block-threshold path also enqueues and keeps the 409 response body', async () => {
    const notificationQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
    const app = createPostsRateLimitReachedTestApp({ notificationQueue, blockThresholdHit: true });

    const response = await request(app).patch('/api/posts/post-1').send({ platform: 'twitter' });

    expect(response.status).toBe(409);
    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
  });
});
