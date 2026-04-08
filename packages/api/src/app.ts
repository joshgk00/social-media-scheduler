import express from 'express';
import cookieParser from 'cookie-parser';
import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';

import { correlationId } from './middleware/correlation-id.js';
import { httpLogger } from './middleware/logger.js';
import { securityHeaders } from './middleware/security-headers.js';
import { doubleCsrfProtection } from './middleware/csrf.js';
import { errorHandler } from './middleware/error-handler.js';
import { createHealthRouter } from './routes/health.js';

interface AppDependencies {
  redis: Redis;
  sql: Sql;
}

export function createApp({ redis, sql }: AppDependencies) {
  const app = express();

  app.use(correlationId);
  app.use(httpLogger);
  app.use(securityHeaders);
  app.use(express.json());
  app.use(cookieParser());
  app.use(doubleCsrfProtection);

  app.use(createHealthRouter({ redis, sql }));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}
