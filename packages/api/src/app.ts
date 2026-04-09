import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';
import type { Db } from '@sms/db';

import { correlationId } from './middleware/correlation-id.js';
import { httpLogger } from './middleware/logger.js';
import { securityHeaders } from './middleware/security-headers.js';
import { createSessionMiddleware } from './middleware/session.js';
import { doubleCsrfProtection } from './middleware/csrf.js';
import { errorHandler } from './middleware/error-handler.js';
import { createHealthRouter } from './routes/health.js';
import { createSetupRouter } from './routes/setup.js';
import { createAuthRouter } from './routes/auth.js';
import { createRecoveryRouter } from './routes/recovery.js';
import { createSettingsRouter } from './routes/settings.js';
import { createProfilesRouter } from './routes/profiles.js';
import { createPostsRouter } from './routes/posts.js';
import { createTagsRouter } from './routes/tags.js';

interface AppDependencies {
  redis: Redis;
  sql: Sql;
  db: Db;
  sessionSecret: string;
}

export function createApp({ redis, sql, db, sessionSecret }: AppDependencies) {
  const app = express();

  app.use(correlationId);
  app.use(httpLogger);
  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(createSessionMiddleware(redis, sessionSecret));
  app.use(doubleCsrfProtection);

  app.use(createSetupRouter({ db }));
  app.use(createAuthRouter({ db }));
  app.use(createRecoveryRouter({ db, redis }));
  app.use(createSettingsRouter({ db, redis }));

  app.use(createProfilesRouter({ db }));
  app.use(createPostsRouter({ db }));
  app.use(createTagsRouter({ db }));

  const mediaDir = process.env.MEDIA_DIR || './data/media';
  app.use('/avatars', express.static(path.join(mediaDir, 'avatars')));

  app.use(createHealthRouter({ redis, sql }));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}
