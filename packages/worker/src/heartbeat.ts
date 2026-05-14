import type { Redis } from 'ioredis';
import { createLogger } from '@sms/shared/logger';

const logger = createLogger('heartbeat');

const HEARTBEAT_KEY = 'worker:heartbeat';
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TTL_SECONDS = 120;

export function startHeartbeat(redis: Redis): NodeJS.Timeout {
  const tick = () => {
    redis.set(HEARTBEAT_KEY, Date.now().toString(), 'EX', HEARTBEAT_TTL_SECONDS)
      .catch((err) => {
        logger.error({ err }, 'Heartbeat write failed');
      });
  };
  tick();
  return setInterval(tick, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(intervalId: NodeJS.Timeout) {
  clearInterval(intervalId);
}
