import { Router } from 'express';
import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';

interface CheckStatus {
  status: 'ok' | 'error';
  message?: string;
}

interface WorkerCheck {
  alive: boolean;
  lastHeartbeat: string | null;
}

interface HealthDependencies {
  redis: Redis;
  sql: Sql;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]);
}

const HEALTH_CHECK_TIMEOUT = 3000;

export function createHealthRouter({ redis, sql }: HealthDependencies) {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const [pgResult, redisResult, heartbeatResult] = await Promise.allSettled([
      withTimeout(sql`SELECT 1`, HEALTH_CHECK_TIMEOUT, 'postgres'),
      withTimeout(redis.ping(), HEALTH_CHECK_TIMEOUT, 'redis'),
      withTimeout(redis.get('worker:heartbeat'), HEALTH_CHECK_TIMEOUT, 'heartbeat'),
    ]);

    const postgres: CheckStatus =
      pgResult.status === 'fulfilled' ? { status: 'ok' } : { status: 'error', message: pgResult.reason?.message };

    const redisCheck: CheckStatus =
      redisResult.status === 'fulfilled' && redisResult.value === 'PONG'
        ? { status: 'ok' }
        : { status: 'error', message: redisResult.status === 'rejected' ? redisResult.reason?.message : undefined };

    const worker: WorkerCheck = (() => {
      if (heartbeatResult.status !== 'fulfilled') return { alive: false, lastHeartbeat: null };
      const heartbeatMs = heartbeatResult.value ? Number(heartbeatResult.value) : NaN;
      const valid = Number.isFinite(heartbeatMs);
      return {
        alive: valid ? Date.now() - heartbeatMs < 60_000 : false,
        lastHeartbeat: valid ? new Date(heartbeatMs).toISOString() : null,
      };
    })();

    const checks = {
      postgres,
      redis: redisCheck,
      worker,
      pendingJobs: 0,
      lastPublish: null,
    };

    const allOk = postgres.status === 'ok' && redisCheck.status === 'ok' && worker.alive;

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  return router;
}
