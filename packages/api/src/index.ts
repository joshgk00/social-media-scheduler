import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

import { Redis } from 'ioredis';
import { runMigrations, createDbClient } from '@sms/db';
import { requireEnv } from '@sms/shared/env';
import { logger } from './middleware/logger.js';
import { createApp } from './app.js';

const DATABASE_URL = requireEnv('DATABASE_URL');
const REDIS_URL = requireEnv('REDIS_URL');
requireEnv('ENCRYPTION_KEY');
requireEnv('CSRF_SECRET');
const SESSION_SECRET = requireEnv('SESSION_SECRET');

async function main() {
  logger.info('Running database migrations...');
  await runMigrations(DATABASE_URL);
  logger.info('Migrations complete');

  const { sql, db } = createDbClient(DATABASE_URL);

  const redis = new Redis(REDIS_URL);
  redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));

  const app = createApp({ redis, sql, db, sessionSecret: SESSION_SECRET });
  const port = parseInt(process.env.PORT || '3000', 10);

  app.listen(port, () => {
    logger.info({ port }, 'API server listening');
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    try { await redis.quit(); } catch (err) { logger.error({ err }, 'Redis shutdown error'); }
    try { await sql.end(); } catch (err) { logger.error({ err }, 'Database shutdown error'); }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start API server');
  process.exit(1);
});
