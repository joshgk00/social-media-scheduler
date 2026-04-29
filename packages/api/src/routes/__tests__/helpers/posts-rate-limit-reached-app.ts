import { randomUUID } from 'node:crypto';
import express from 'express';
import { JOB_NAMES } from '@sms/shared';

interface PostsRateLimitReachedTestAppInput {
  notificationQueue: {
    add: (
      name: string,
      payload: Record<string, unknown>,
      options: { jobId: string },
    ) => Promise<unknown>;
  };
  blockThresholdHit: boolean;
}

async function enqueueReached(
  notificationQueue: PostsRateLimitReachedTestAppInput['notificationQueue'],
): Promise<void> {
  const userId = '44444444-4444-4444-4444-444444444444';
  const profileId = '22222222-2222-2222-2222-222222222222';
  const billingMonth = '2026-04';
  await notificationQueue.add(
    JOB_NAMES.rateLimitReachedNotification,
    {
      kind: 'rate_limit_reached',
      userId,
      profileId,
      platform: 'twitter',
      currentUsage: 500,
      limit: 500,
      correlationId: randomUUID(),
      triggeredAt: new Date().toISOString(),
    },
    { jobId: `rate-limit-reached:${profileId}:${billingMonth}` },
  );
}

export function createPostsRateLimitReachedTestApp(
  input: PostsRateLimitReachedTestAppInput,
): express.Express {
  const app = express();
  app.use(express.json());

  app.post('/api/posts', async (_req, res) => {
    try {
      if (input.blockThresholdHit) {
        await enqueueReached(input.notificationQueue);
        res.status(409).json({
          code: 'twitter_budget_exceeded',
          budget: 500,
          currentCount: 500,
        });
        return;
      }
      res.status(201).json({ id: 'post-1' });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch('/api/posts/:id', async (_req, res) => {
    try {
      if (input.blockThresholdHit) {
        await enqueueReached(input.notificationQueue);
        res.status(409).json({
          code: 'twitter_budget_exceeded',
          budget: 500,
          currentCount: 500,
        });
        return;
      }
      res.json({ id: 'post-1' });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return app;
}
