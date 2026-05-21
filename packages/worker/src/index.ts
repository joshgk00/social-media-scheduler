// Worker entrypoint. Wires together:
//   1. The Phase 1 heartbeat loop (liveness signal for Bull-Board + monitoring)
//   2. The Phase 4 publish worker (BullMQ Worker consuming the publish queue)
//   3. The Phase 4 scanner (reconciliation loop that re-enqueues due posts)
//   4. The Phase 5 queue scanner (evaluates active queues on 60s tick)
//   5. The Phase 5 auto-destruct worker (delayed deletion of published posts)
//   6. The Phase 6 transcode worker (async video transcoding via ffmpeg)
//   7. The Phase 9 notification worker (in-app and email notifications)
//
// All construction happens inside `main()` so env vars are read at runtime
// and no module-level side effects leak into tests (CLAUDE.md convention).
//
// Graceful shutdown on SIGTERM/SIGINT drains each resource inside its own
// try/catch with a 30-second timeout — one failing close must not prevent
// the others from running (CLAUDE.md shutdown rule, D-07).

import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { createLogger } from '@sms/shared/logger';
import { requireEnv } from '@sms/shared/env';
import { validateEncryptionKey } from '@sms/shared/encryption';
import { QUEUE_NAMES } from '@sms/shared';
import { createStorageBackend } from '@sms/shared/storage';
import { createTokenVault } from '@sms/shared/tokens';
import { startHeartbeat, stopHeartbeat } from './heartbeat.js';
import { createWorkerDb } from './db.js';
import { createPublishWorker } from './publish-worker.js';
import { createTranscodeWorker } from './transcode-worker.js';
import { createMediaCleanupWorker, startMediaCleanupScheduler } from './media-cleanup-worker.js';
import { startScanner } from './scanner.js';
import { startQueueScanner } from './queue-scanner.js';
import { createAutoDestructWorker } from './auto-destruct-worker.js';
import { startTokenRefreshScanner } from './token-refresh-scanner.js';
import { createTokenRefreshWorker } from './token-refresh-worker.js';
import { createNotificationWorker } from './notification-worker.js';
import { buildSmtpTransporter } from './notifications/smtp.js';
import { createBulkOpsWorker } from './bulk-ops-worker.js';

const logger = createLogger('worker');

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function main() {
  const REDIS_URL = requireEnv('REDIS_URL');
  const DATABASE_URL = requireEnv('DATABASE_URL');
  const ENCRYPTION_KEY = requireEnv('ENCRYPTION_KEY');
  const tokenVault = createTokenVault(validateEncryptionKey(ENCRYPTION_KEY));

  // BullMQ requires `maxRetriesPerRequest: null` on the ioredis connection
  // used by Worker/Queue instances (RESEARCH.md Pitfall 1). The heartbeat
  // from Phase 1 doesn't need it, but a shared connection keeps the Redis
  // client count low and avoids split-brain during shutdown.
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
  await redis.ping();

  const { db, pgClient } = createWorkerDb(DATABASE_URL);

  const heartbeatInterval = startHeartbeat(redis);

  const publishQueue = new Queue(QUEUE_NAMES.publish, { connection: redis });
  const bulkOpsQueue = new Queue(QUEUE_NAMES.bulkOps, { connection: redis });
  const notificationQueue = new Queue(QUEUE_NAMES.notification, {
    connection: redis,
  });

  const publishWorker = createPublishWorker({
    redis,
    db,
    notificationQueue,
    vault: tokenVault,
  });
  const { scannerQueue, scannerWorker } = await startScanner(
    redis,
    db,
    publishQueue,
  );

  const autoDestructQueue = new Queue(QUEUE_NAMES.autoDestruct, {
    connection: redis,
  });
  const { queueScannerQueue, queueScannerWorker } = await startQueueScanner(
    redis,
    db,
    publishQueue,
    notificationQueue,
  );
  const autoDestructWorker = createAutoDestructWorker({
    redis,
    db,
    notificationQueue,
    vault: tokenVault,
  });

  const storage = createStorageBackend();
  const transcodeWorker = createTranscodeWorker({ redis, db, storage });

  const { cleanupQueue } = await startMediaCleanupScheduler(redis);
  const mediaCleanupWorker = createMediaCleanupWorker({ redis, db, storage });

  const { tokenRefreshQueue } = await startTokenRefreshScanner({ redis });
  const tokenRefreshWorker = createTokenRefreshWorker({
    redis,
    db,
    notificationQueue,
    vault: tokenVault,
  });

  const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  if (appBaseUrl === 'http://localhost:5173') {
    logger.warn('APP_BASE_URL not set - using dev default; emails will link to localhost');
  }

  const { transporter, smtpFrom } = buildSmtpTransporter();
  const notificationWorker = createNotificationWorker({
    redis,
    db,
    transporter,
    smtpFrom,
    appBaseUrl,
  });
  const bulkOpsWorker = createBulkOpsWorker({
    redis,
    db,
    publishQueue,
    bulkOpsQueue,
    notificationQueue,
    storageRoot: process.env.MEDIA_DIR || './data/media',
    appBaseUrl,
  });
  logger.info(
    { concurrency: process.env.NOTIFICATION_WORKER_CONCURRENCY ?? '2' },
    'Notification worker started',
  );

  logger.info(
    'Worker fully started: heartbeat + publish worker + scanner + queue scanner + auto-destruct worker + transcode worker + media cleanup worker + token-refresh scanner/worker + notification worker + bulk-ops worker active',
  );

  const closeWithTimeout = async (
    name: string,
    closeFn: () => Promise<unknown>,
  ): Promise<void> => {
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
  };

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, 'Worker shutting down');

    try {
      stopHeartbeat(heartbeatInterval);
    } catch (err) {
      logger.error({ err }, 'Heartbeat stop error');
    }

    // Close order: workers first (stop accepting jobs, drain in-flight),
    // then queues (stop new enqueues), then DB, then Redis. Each in its
    // own try/catch so one failure does not skip the rest.
    await closeWithTimeout('notificationWorker', () => notificationWorker.close());
    await closeWithTimeout('bulkOpsWorker', () => bulkOpsWorker.close());
    await closeWithTimeout('tokenRefreshWorker', () => tokenRefreshWorker.close());
    await closeWithTimeout('mediaCleanupWorker', () => mediaCleanupWorker.close());
    await closeWithTimeout('transcodeWorker', () => transcodeWorker.close());
    await closeWithTimeout('autoDestructWorker', () => autoDestructWorker.close());
    await closeWithTimeout('queueScannerWorker', () => queueScannerWorker.close());
    await closeWithTimeout('publishWorker', () => publishWorker.close());
    await closeWithTimeout('scannerWorker', () => scannerWorker.close());
    await closeWithTimeout('autoDestructQueue', () => autoDestructQueue.close());
    await closeWithTimeout('queueScannerQueue', () => queueScannerQueue.close());
    await closeWithTimeout('publishQueue', () => publishQueue.close());
    await closeWithTimeout('bulkOpsQueue', () => bulkOpsQueue.close());
    await closeWithTimeout('scannerQueue', () => scannerQueue.close());
    await closeWithTimeout('cleanupQueue', () => cleanupQueue.close());
    await closeWithTimeout('tokenRefreshQueue', () => tokenRefreshQueue.close());
    await closeWithTimeout('notificationQueue', () => notificationQueue.close());
    if (transporter) {
      await closeWithTimeout('smtpTransporter', () => Promise.resolve(transporter.close()));
    }
    await closeWithTimeout('pgClient', () => pgClient.end({ timeout: 5 }));

    try {
      await redis.quit();
    } catch (err) {
      logger.error({ err }, 'Redis quit error');
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((err) =>
      logger.error({ err }, 'Shutdown handler error'),
    );
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((err) =>
      logger.error({ err }, 'Shutdown handler error'),
    );
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start worker');
  process.exit(1);
});
