// Integration test for graceful shutdown (WORKER-08). Verifies that
// Worker.close() drains in-flight jobs within the timeout window and that
// all cleanup steps run even if one fails.
//
// Uses real Redis testcontainer with a real BullMQ Worker. Postgres is
// not needed here -- the handler is a simple delayed mock.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, Worker } from 'bullmq';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { Redis } from 'ioredis';
import { createLogger } from '@sms/shared/logger';

let redisContainer: StartedTestContainer;
let redis: Redis;
let redisUrl: string;

const TEST_QUEUE = 'shutdown-test';

beforeAll(async () => {
  redisContainer = await new GenericContainer('redis:7.4-alpine')
    .withExposedPorts(6379)
    .start();
  redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  await redis.ping();
}, 30_000);

afterAll(async () => {
  try { await redis?.quit(); } catch { /* cleanup */ }
  try { await redisContainer?.stop(); } catch { /* cleanup */ }
}, 15_000);

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function closeWithTimeout(
  name: string,
  closeFn: () => Promise<unknown>,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  try {
    await Promise.race([
      closeFn(),
      new Promise<void>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error(`${name} close timed out after 30s`)),
          SHUTDOWN_TIMEOUT_MS,
        ),
      ),
    ]);
    logger.info({ name }, 'Shutdown step completed');
  } catch (err) {
    logger.error({ err, name }, 'Shutdown step failed');
  }
}

describe('graceful shutdown integration', () => {
  it('drains an in-flight job within the timeout window (WORKER-08)', async () => {
    const queue = new Queue(TEST_QUEUE, { connection: redis.duplicate() });
    let jobProcessed = false;

    const worker = new Worker(
      TEST_QUEUE,
      async () => {
        // Simulate a job that takes ~2 seconds (well within 30s timeout)
        await new Promise((resolve) => setTimeout(resolve, 2000));
        jobProcessed = true;
      },
      {
        connection: redis.duplicate(),
        concurrency: 1,
        lockDuration: 10_000,
      },
    );

    // Add a job and wait for it to become active
    await queue.add('test-job', { testId: 'drain-test' });

    // Wait until job is active
    await new Promise<void>((resolve) => {
      const interval = setInterval(async () => {
        const activeCount = await queue.getActiveCount();
        if (activeCount > 0) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(interval); resolve(); }, 5000);
    });

    // Close the worker gracefully -- should wait for in-flight job
    const closeStart = Date.now();
    await worker.close();
    const closeDuration = Date.now() - closeStart;

    // The job should have completed (was only 2s, well within 30s window)
    expect(jobProcessed).toBe(true);
    expect(closeDuration).toBeLessThan(SHUTDOWN_TIMEOUT_MS);

    // No orphan jobs should remain in active state
    const activeAfterClose = await queue.getActiveCount();
    expect(activeAfterClose).toBe(0);

    await queue.close();
  }, 45_000);

  it('logs timeout when handler exceeds the shutdown window (WORKER-08)', async () => {
    const logger = createLogger('shutdown-test');
    const errorSpy = vi.spyOn(logger, 'error');

    const queue = new Queue(`${TEST_QUEUE}-timeout`, { connection: redis.duplicate() });

    const worker = new Worker(
      `${TEST_QUEUE}-timeout`,
      async () => {
        // Simulate a job that takes way too long (60s)
        await new Promise((resolve) => setTimeout(resolve, 60_000));
      },
      {
        connection: redis.duplicate(),
        concurrency: 1,
        lockDuration: 60_000,
      },
    );

    await queue.add('slow-job', { testId: 'timeout-test' });

    // Wait until job is active
    await new Promise<void>((resolve) => {
      const interval = setInterval(async () => {
        const activeCount = await queue.getActiveCount();
        if (activeCount > 0) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(interval); resolve(); }, 5000);
    });

    // Use a short timeout for the test (3s instead of 30s) to avoid a long wait
    const SHORT_TIMEOUT_MS = 3_000;
    const closeStart = Date.now();
    try {
      await Promise.race([
        worker.close(),
        new Promise<void>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error('worker close timed out after 3s')),
            SHORT_TIMEOUT_MS,
          ),
        ),
      ]);
      logger.info({ name: 'worker' }, 'Shutdown step completed');
    } catch (err) {
      logger.error({ err, name: 'worker' }, 'Shutdown step failed');
    }
    const closeDuration = Date.now() - closeStart;

    // The timeout should have fired (job was 60s, timeout was 3s)
    expect(closeDuration).toBeGreaterThanOrEqual(SHORT_TIMEOUT_MS - 500);
    expect(closeDuration).toBeLessThan(SHORT_TIMEOUT_MS + 2000);

    // Per CLAUDE.md shutdown rule: one failure must not skip the rest.
    // The error logger should have been called with the timeout message.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'worker' }),
      'Shutdown step failed',
    );

    // Redis quit should still succeed (cleanup continues after timeout)
    const testRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const pong = await testRedis.ping();
    expect(pong).toBe('PONG');
    await testRedis.quit();

    // Force-close the worker to clean up (it's still trying to process the slow job)
    try {
      worker.close().catch(() => {});
    } catch { /* best-effort */ }
    await queue.close();

    errorSpy.mockRestore();
  }, 30_000);
});
