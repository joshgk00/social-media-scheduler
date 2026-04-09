import { Redis } from 'ioredis';
import { createLogger } from '@sms/shared/logger';
import { requireEnv } from '@sms/shared/env';
import { startHeartbeat, stopHeartbeat } from './heartbeat.js';

const logger = createLogger('worker');

async function main() {
  const REDIS_URL = requireEnv('REDIS_URL');

  const redis = new Redis(REDIS_URL);
  redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
  await redis.ping();

  const heartbeatInterval = startHeartbeat(redis);
  logger.info('Worker started, heartbeat active');

  const shutdown = async () => {
    logger.info('Worker shutting down...');
    stopHeartbeat(heartbeatInterval);
    try { await redis.quit(); } catch (err) { logger.error({ err }, 'Redis shutdown error'); }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start worker');
  process.exit(1);
});
