import session from 'express-session';
import type { RequestHandler } from 'express';
import { RedisStore } from 'connect-redis';
import type { Redis } from 'ioredis';

export function createSessionMiddleware(redis: Redis, secret: string): RequestHandler {
  const store = new RedisStore({
    // connect-redis 9 types target node-redis; ioredis is runtime-compatible
    // but TypeScript types don't align. Cast is intentional per RESEARCH.md
    // Open Question 2 resolution. Runtime behavior verified by middleware tests
    // in Plan 04 Task 3.
    client: redis as ConstructorParameters<typeof RedisStore>[0]['client'],
    prefix: 'sms:sess:',
  });

  return session({
    store,
    secret,
    resave: false,
    saveUninitialized: false,
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
