import session from 'express-session';
import type { RequestHandler } from 'express';
import { RedisStore } from 'connect-redis';
import type { Redis } from 'ioredis';

// connect-redis 9 expects the node-redis v4 API: client.set(key, val, { expiration: { type: 'EX', value: ttl } })
// ioredis uses: client.set(key, val, 'EX', ttl). This adapter translates calls.
function createNodeRedisAdapter(ioredis: Redis) {
  return {
    get: (key: string) => ioredis.get(key),
    set: (key: string, val: string, opts?: { expiration?: { type: string; value: number } }) => {
      if (opts?.expiration) {
        return ioredis.set(key, val, 'EX', opts.expiration.value);
      }
      return ioredis.set(key, val);
    },
    del: (keys: string[]) => ioredis.del(...keys),
    expire: (key: string, ttl: number) => ioredis.expire(key, ttl),
    scanIterator: (opts: { MATCH: string; COUNT: number }) => {
      let cursor = '0';
      return {
        async *[Symbol.asyncIterator]() {
          do {
            const [next, keys] = await ioredis.scan(cursor, 'MATCH', opts.MATCH, 'COUNT', opts.COUNT);
            cursor = next;
            yield keys;
          } while (cursor !== '0');
        },
      };
    },
    mGet: (keys: string[]) => ioredis.mget(...keys),
  };
}

export function createSessionMiddleware(redis: Redis, secret: string): RequestHandler {
  const store = new RedisStore({
    client: createNodeRedisAdapter(redis) as ConstructorParameters<typeof RedisStore>[0]['client'],
    prefix: 'sms:sess:',
  });

  return session({
    store,
    secret,
    resave: false,
    saveUninitialized: true,
    rolling: true,
    name: 'sms.sid',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    },
  });
}
