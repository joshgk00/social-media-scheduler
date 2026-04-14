import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@sms/shared';
import { runMigrations, createDbClient } from '@sms/db';
import { requireEnv } from '@sms/shared/env';
import { logger } from './middleware/logger.js';
import { createApp } from './app.js';
import { createPublishQueueService } from './services/publish-queue.service.js';

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

  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));

  const publishQueueService = createPublishQueueService(redis);
  const notificationQueue = new Queue(QUEUE_NAMES.notification, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
      attempts: 3,
    },
  });

  const app = createApp({
    redis,
    sql,
    db,
    sessionSecret: SESSION_SECRET,
    publishQueueService,
    notificationQueue,
  });
  const port = parseInt(process.env.PORT || '3000', 10);

  app.listen(port, () => {
    logger.info({ port }, 'API server listening');
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    try { await publishQueueService.publishQueue.close(); } catch (err) { logger.error({ err }, 'Publish queue shutdown error'); }
    try { await notificationQueue.close(); } catch (err) { logger.error({ err }, 'Notification queue shutdown error'); }
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
