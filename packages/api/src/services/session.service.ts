import type { Redis } from 'ioredis';

export const SESSION_PREFIX = 'sms:sess:';

// Redis SCAN is O(N) over all keys matching the prefix. For a single-user app
// with at most a handful of concurrent sessions, this is efficient. For a
// multi-user app, a per-user session index set would be needed.

export async function invalidateOtherSessions(redis: Redis, currentSessionId: string): Promise<number> {
  let deleted = 0;
  const stream = redis.scanStream({ match: `${SESSION_PREFIX}*`, count: 100 });

  for await (const keys of stream) {
    const toDelete = (keys as string[]).filter(
      (key) => key !== `${SESSION_PREFIX}${currentSessionId}`,
    );
    if (toDelete.length > 0) {
      deleted += await redis.del(...toDelete);
    }
  }

  return deleted;
}

export async function invalidateAllSessions(redis: Redis): Promise<number> {
  let deleted = 0;
  const stream = redis.scanStream({ match: `${SESSION_PREFIX}*`, count: 100 });

  for await (const keys of stream) {
    const batch = keys as string[];
    if (batch.length > 0) {
      deleted += await redis.del(...batch);
    }
  }

  return deleted;
}
