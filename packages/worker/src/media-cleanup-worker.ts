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
import { and, asc, gt, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { postMedia } from '@sms/db';
import { QUEUE_NAMES, JOB_NAMES } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { StorageBackend } from '@sms/shared/storage';
import type { WorkerDb } from './db.js';

const logger = createLogger('media-cleanup-worker');

const SOFT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ORPHAN_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const MEDIA_CLEANUP_BATCH_SIZE = 200;

type MediaCleanupRow = Pick<
  typeof postMedia.$inferSelect,
  'id' | 'filePath' | 'thumbnailPath'
>;

interface StorageCleanupMessages {
  fileFailure: string;
  thumbnailFailure: string;
}

async function deleteStorageFiles(
  storage: StorageBackend,
  row: MediaCleanupRow,
  logError: (metadata: Record<string, unknown>, message: string) => void,
  messages: StorageCleanupMessages,
): Promise<void> {
  try {
    await storage.delete(row.filePath);
  } catch (storageErr) {
    logError(
      { err: storageErr, mediaId: row.id, filePath: row.filePath },
      messages.fileFailure,
    );
  }

  if (row.thumbnailPath) {
    try {
      await storage.delete(row.thumbnailPath);
    } catch (storageErr) {
      logError(
        { err: storageErr, mediaId: row.id, thumbnailPath: row.thumbnailPath },
        messages.thumbnailFailure,
      );
    }
  }
}

async function deleteMediaRows(
  db: WorkerDb,
  rows: MediaCleanupRow[],
  logError: (metadata: Record<string, unknown>, message: string) => void,
  failureMessage: string,
): Promise<boolean> {
  if (rows.length === 0) {
    return false;
  }

  const mediaIds = rows.map((row) => row.id);

  try {
    await db.delete(postMedia).where(inArray(postMedia.id, mediaIds));
    return true;
  } catch (dbErr) {
    logError(
      { err: dbErr, mediaIds },
      failureMessage,
    );
    return false;
  }
}

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
      let expiredCursor: string | undefined;
      let deletedExpiredCount = 0;

      while (true) {
        const expiredMedia = await deps.db.select()
          .from(postMedia)
          .where(expiredCursor === undefined
            ? and(
              isNotNull(postMedia.deletedAt),
              lt(postMedia.deletedAt, thirtyDaysAgo),
            )
            : and(
              isNotNull(postMedia.deletedAt),
              lt(postMedia.deletedAt, thirtyDaysAgo),
              gt(postMedia.id, expiredCursor),
            ))
          .orderBy(asc(postMedia.id))
          .limit(MEDIA_CLEANUP_BATCH_SIZE);

        if (expiredMedia.length === 0) {
          break;
        }

        const lastExpired = expiredMedia[expiredMedia.length - 1];
        expiredCursor = lastExpired.id;

        const rowsDeleted = await deleteMediaRows(
          deps.db,
          expiredMedia,
          (metadata, message) => jobLogger.error(metadata, message),
          'Failed to delete media rows from database, continuing',
        );

        if (!rowsDeleted) {
          continue;
        }

        deletedExpiredCount += expiredMedia.length;

        for (const row of expiredMedia) {
          await deleteStorageFiles(
            deps.storage,
            row,
            (metadata, message) => jobLogger.error(metadata, message),
            {
              fileFailure: 'Failed to delete file from storage, continuing',
              thumbnailFailure: 'Failed to delete thumbnail from storage, continuing',
            },
          );
          jobLogger.info(
            { mediaId: row.id, filePath: row.filePath },
            'Permanently deleted soft-deleted media',
          );
        }
      }

      // 2. Clean up orphaned uploads older than 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - ORPHAN_THRESHOLD_MS);
      let orphanCursor: string | undefined;
      let deletedOrphanCount = 0;

      while (true) {
        const orphans = await deps.db.select()
          .from(postMedia)
          .where(orphanCursor === undefined
            ? and(
              isNull(postMedia.postId),
              isNull(postMedia.deletedAt),
              lt(postMedia.createdAt, twentyFourHoursAgo),
            )
            : and(
              isNull(postMedia.postId),
              isNull(postMedia.deletedAt),
              lt(postMedia.createdAt, twentyFourHoursAgo),
              gt(postMedia.id, orphanCursor),
            ))
          .orderBy(asc(postMedia.id))
          .limit(MEDIA_CLEANUP_BATCH_SIZE);

        if (orphans.length === 0) {
          break;
        }

        const lastOrphan = orphans[orphans.length - 1];
        orphanCursor = lastOrphan.id;

        const rowsDeleted = await deleteMediaRows(
          deps.db,
          orphans,
          (metadata, message) => jobLogger.error(metadata, message),
          'Failed to delete orphan media rows from database, continuing',
        );

        if (!rowsDeleted) {
          continue;
        }

        deletedOrphanCount += orphans.length;

        for (const orphan of orphans) {
          await deleteStorageFiles(
            deps.storage,
            orphan,
            (metadata, message) => jobLogger.error(metadata, message),
            {
              fileFailure: 'Failed to delete orphan file from storage, continuing',
              thumbnailFailure: 'Failed to delete orphan thumbnail from storage, continuing',
            },
          );
        }
      }

      jobLogger.info(
        { orphanCount: deletedOrphanCount },
        'Cleaned up orphaned uploads',
      );

      jobLogger.info(
        { deletedExpired: deletedExpiredCount, deletedOrphans: deletedOrphanCount },
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
