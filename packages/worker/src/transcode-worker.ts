// BullMQ Worker consuming the 'transcode' queue. Downloads the uploaded
// video from the storage backend, transcodes it to H.264 720p MP4 via
// ffmpeg, and saves the result back to storage.
//
// D-06: Output is H.264 MP4 at 720p via transcode.service.ts.
// D-09 / MEDIA-04: 5-minute timeout on the ffmpeg child process.
// T-06-10: concurrency:1 limits resource usage; lockDuration > timeout
//          prevents BullMQ from marking the job as stalled during transcode.
// T-06-12: Temp files cleaned up in finally block.

import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { writeFile, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { postMedia } from '@sms/db';
import { QUEUE_NAMES } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { StorageBackend } from '@sms/shared/storage';
import type { WorkerDb } from './db.js';
import { transcodeVideo } from './transcode.service.js';

const logger = createLogger('transcode-worker');

export interface TranscodeJobPayload {
  mediaId: string;
  inputKey: string;
  profileId: string;
}

export interface TranscodeWorkerDeps {
  redis: Redis;
  db: WorkerDb;
  storage: StorageBackend;
}

export function createTranscodeWorker(
  deps: TranscodeWorkerDeps,
): Worker<TranscodeJobPayload> {
  const worker = new Worker<TranscodeJobPayload>(
    QUEUE_NAMES.transcode,
    async (job: Job<TranscodeJobPayload>) => {
      const jobLogger = logger.child({
        mediaId: job.data.mediaId,
        jobId: job.id,
      });

      const inputPath = path.join(tmpdir(), `${randomUUID()}_input`);
      const outputPath = path.join(tmpdir(), `${randomUUID()}.mp4`);

      try {
        // Mark as processing
        await deps.db
          .update(postMedia)
          .set({ transcodeStatus: 'processing' })
          .where(eq(postMedia.id, job.data.mediaId));

        jobLogger.info('Downloading original from storage');
        const inputBuffer = await deps.storage.get(job.data.inputKey);
        await writeFile(inputPath, inputBuffer);

        jobLogger.info('Starting ffmpeg transcode');
        await transcodeVideo(inputPath, outputPath);

        const outputStats = await stat(outputPath);
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const outputKey = `media/${job.data.profileId}/${year}/${month}/${randomUUID()}.mp4`;

        jobLogger.info({ outputKey, fileSize: outputStats.size }, 'Saving transcoded output');
        await deps.storage.save(
          outputKey,
          createReadStream(outputPath),
          'video/mp4',
        );

        await deps.db
          .update(postMedia)
          .set({
            filePath: outputKey,
            fileSize: outputStats.size,
            mimeType: 'video/mp4',
            transcodeStatus: 'completed',
            transcodeError: null,
          })
          .where(eq(postMedia.id, job.data.mediaId));

        jobLogger.info('Transcode completed');
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        jobLogger.error({ err }, 'Transcode failed');

        await deps.db
          .update(postMedia)
          .set({
            transcodeStatus: 'failed',
            transcodeError: errorMessage.slice(0, 1000),
          })
          .where(eq(postMedia.id, job.data.mediaId))
          .catch((dbErr) => {
            jobLogger.error(
              { err: dbErr },
              'Failed to update transcode_status to failed',
            );
          });

        throw err;
      } finally {
        // T-06-12: Clean up temp files regardless of outcome
        await unlink(inputPath).catch((err) => jobLogger.warn({ err, path: inputPath }, 'Temp file cleanup failed'));
        await unlink(outputPath).catch((err) => jobLogger.warn({ err, path: outputPath }, 'Temp file cleanup failed'));
      }
    },
    {
      connection: deps.redis,
      concurrency: 1,
      lockDuration: 360_000,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, mediaId: job?.data?.mediaId, err },
      'Transcode job failed',
    );
  });

  worker.on('completed', (job) => {
    logger.info(
      { jobId: job?.id, mediaId: job?.data?.mediaId },
      'Transcode job completed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Transcode worker error event');
  });

  return worker;
}
