// BullMQ Worker consuming the 'media-cleanup' queue. Runs weekly on
// Sunday at 3:00 AM UTC (D-14) to permanently delete:
//
//   1. Soft-deleted files older than 30 days (deletedAt < 30 days ago)
//   2. Orphaned uploads with no postId older than 24 hours
//
// Both storage backend files and database rows are removed. Storage
// deletion errors are caught and logged — one unreachable file must
// not prevent cleanup of the rest (T-06-16).

import { Worker, Queue, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { and, isNotNull, isNull, lt, eq } from 'drizzle-orm';
import { postMedia } from '@sms/db';
import { QUEUE_NAMES, JOB_NAMES } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { StorageBackend } from '@sms/shared/storage';
import type { WorkerDb } from './db.js';

const logger = createLogger('media-cleanup-worker');

const SOFT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ORPHAN_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface MediaCleanupWorkerDeps {
  redis: Redis;
  db: WorkerDb;
  storage: StorageBackend;
}

export function createMediaCleanupWorker(
  deps: MediaCleanupWorkerDeps,
): Worker {
  const worker = new Worker(
    QUEUE_NAMES.mediaCleanup,
    async (_job: Job) => {
      const jobLogger = logger.child({ queue: QUEUE_NAMES.mediaCleanup });

      // 1. Permanently delete soft-deleted files older than 30 days
      const thirtyDaysAgo = new Date(Date.now() - SOFT_DELETE_RETENTION_MS);
      const expiredMedia = await deps.db.select()
        .from(postMedia)
        .where(and(
          isNotNull(postMedia.deletedAt),
          lt(postMedia.deletedAt, thirtyDaysAgo),
        ));

      for (const row of expiredMedia) {
        try {
          await deps.db.delete(postMedia).where(eq(postMedia.id, row.id));
        } catch (dbErr) {
          jobLogger.error(
            { err: dbErr, mediaId: row.id },
            'Failed to delete media row from database, continuing',
          );
          continue;
        }

        try {
          await deps.storage.delete(row.filePath);
        } catch (storageErr) {
          jobLogger.error(
            { err: storageErr, mediaId: row.id, filePath: row.filePath },
            'Failed to delete file from storage, continuing',
          );
        }

        if (row.thumbnailPath) {
          try {
            await deps.storage.delete(row.thumbnailPath);
          } catch (storageErr) {
            jobLogger.error(
              { err: storageErr, mediaId: row.id, thumbnailPath: row.thumbnailPath },
              'Failed to delete thumbnail from storage, continuing',
            );
          }
        }

        jobLogger.info(
          { mediaId: row.id, filePath: row.filePath },
          'Permanently deleted soft-deleted media',
        );
      }

      // 2. Clean up orphaned uploads older than 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - ORPHAN_THRESHOLD_MS);
      const orphans = await deps.db.select()
        .from(postMedia)
        .where(and(
          isNull(postMedia.postId),
          isNull(postMedia.deletedAt),
          lt(postMedia.createdAt, twentyFourHoursAgo),
        ));

      for (const orphan of orphans) {
        try {
          await deps.db.delete(postMedia).where(eq(postMedia.id, orphan.id));
        } catch (dbErr) {
          jobLogger.error(
            { err: dbErr, mediaId: orphan.id },
            'Failed to delete orphan media row from database, continuing',
          );
          continue;
        }

        try {
          await deps.storage.delete(orphan.filePath);
        } catch (storageErr) {
          jobLogger.error(
            { err: storageErr, mediaId: orphan.id, filePath: orphan.filePath },
            'Failed to delete orphan file from storage, continuing',
          );
        }

        if (orphan.thumbnailPath) {
          try {
            await deps.storage.delete(orphan.thumbnailPath);
          } catch (storageErr) {
            jobLogger.error(
              { err: storageErr, mediaId: orphan.id, thumbnailPath: orphan.thumbnailPath },
              'Failed to delete orphan thumbnail from storage, continuing',
            );
          }
        }
      }

      jobLogger.info(
        { orphanCount: orphans.length },
        'Cleaned up orphaned uploads',
      );

      jobLogger.info(
        { deletedExpired: expiredMedia.length, deletedOrphans: orphans.length },
        'Media cleanup job completed',
      );
    },
    {
      connection: deps.redis,
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, err },
      'Media cleanup job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Media cleanup worker error event');
  });

  return worker;
}

export async function startMediaCleanupScheduler(
  redis: Redis,
): Promise<{ cleanupQueue: Queue }> {
  const cleanupQueue = new Queue(QUEUE_NAMES.mediaCleanup, {
    connection: redis,
  });

  await cleanupQueue.upsertJobScheduler(
    JOB_NAMES.mediaCleanupScheduler,
    { pattern: '0 3 * * 0', tz: 'UTC' },
    { name: JOB_NAMES.mediaCleanup, data: {} },
  );

  logger.info('Media cleanup scheduler registered: every Sunday at 3:00 AM UTC');

  return { cleanupQueue };
}
