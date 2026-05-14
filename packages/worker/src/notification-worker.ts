import { Worker, UnrecoverableError, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Transporter } from 'nodemailer';
import { JOB_NAMES, QUEUE_NAMES } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { WorkerDb } from './db.js';
import {
  handleAutoDestructFailed,
} from './notifications/handlers/auto-destruct-failed.handler.js';
import { handleBulkCompleted } from './notifications/handlers/bulk-completed.handler.js';
import type {
  NotificationHandlerContext,
  NotificationJob,
} from './notifications/handlers/common.js';
import { handlePublishFailed } from './notifications/handlers/publish-failed.handler.js';
import { handleQueueEmpty } from './notifications/handlers/queue-empty.handler.js';
import { handleRateLimitReached } from './notifications/handlers/rate-limit-reached.handler.js';
import { handleRateLimitWarn } from './notifications/handlers/rate-limit-warn.handler.js';
import { handleTokenExpiringSoon } from './notifications/handlers/token-expiring-soon.handler.js';
import { handleTokenReauthRequired } from './notifications/handlers/token-reauth-required.handler.js';
import { handleTokenRefreshFailed } from './notifications/handlers/token-refresh-failed.handler.js';
import { handleTokenRevoked } from './notifications/handlers/token-revoked.handler.js';

const logger = createLogger('notification-worker');

export interface HandlerContext extends NotificationHandlerContext {
  db: WorkerDb;
  transporter: Transporter | null;
  smtpFrom: string | null;
  appBaseUrl: string;
}

export interface NotificationWorkerDeps extends Omit<Partial<HandlerContext>, 'db'> {
  db?: NotificationHandlerContext['db'] | Record<string, unknown>;
  redis: Redis | Record<string, unknown>;
  smtp?: NotificationHandlerContext['smtp'];
}

export type NotificationWorkerRuntime = Worker & {
  process: (job: NotificationJob<unknown>) => Promise<void>;
};

export const NOTIFICATION_WORKER_CONFIG = {
  defaultConcurrency: 2,
} as const;

async function dispatchNotificationJob(
  job: NotificationJob<unknown>,
  ctx: NotificationHandlerContext,
): Promise<void> {
  switch (job.name) {
    case JOB_NAMES.publishFailedNotification:
      return handlePublishFailed(job, ctx);
    case JOB_NAMES.rateLimitWarnNotification:
      return handleRateLimitWarn(job, ctx);
    case JOB_NAMES.rateLimitReachedNotification:
      return handleRateLimitReached(job, ctx);
    case JOB_NAMES.queueEmptyNotification:
      return handleQueueEmpty(job, ctx);
    case JOB_NAMES.autoDestructFailedNotification:
      return handleAutoDestructFailed(job, ctx);
    case JOB_NAMES.tokenExpiringSoon:
      return handleTokenExpiringSoon(job, ctx);
    case JOB_NAMES.tokenReauthRequired:
      return handleTokenReauthRequired(job, ctx);
    case JOB_NAMES.tokenRevoked:
      return handleTokenRevoked(job, ctx);
    case JOB_NAMES.tokenRefreshFailed:
      return handleTokenRefreshFailed(job, ctx);
    case 'bulk-completed':
      return handleBulkCompleted(job, ctx);
    default:
      throw new UnrecoverableError(`Unknown notification job: ${job.name}`);
  }
}

function canCreateBullMqWorker(redis: Redis | Record<string, unknown>): redis is Redis {
  return typeof (redis as { duplicate?: unknown }).duplicate === 'function';
}

export function createNotificationWorker(deps: NotificationWorkerDeps): NotificationWorkerRuntime {
  const concurrency = Number.parseInt(
    process.env.NOTIFICATION_WORKER_CONCURRENCY ?? String(NOTIFICATION_WORKER_CONFIG.defaultConcurrency),
    10,
  );
  const ctx: NotificationHandlerContext = {
    db: deps.db as NotificationHandlerContext['db'],
    store: deps.store,
    prefs: deps.prefs,
    smtp: deps.smtp,
    transporter: deps.transporter ?? null,
    smtpFrom: deps.smtpFrom ?? null,
    appBaseUrl: deps.appBaseUrl,
  };

  if (!canCreateBullMqWorker(deps.redis)) {
    return {
      process: (job: NotificationJob<unknown>) => dispatchNotificationJob(job, ctx),
    } as unknown as NotificationWorkerRuntime;
  }

  const worker = new Worker(
    QUEUE_NAMES.notification,
    (job: Job) => dispatchNotificationJob(job, ctx),
    { connection: deps.redis, concurrency },
  );

  worker.on('error', (err) => logger.error({ err }, 'Notification worker error'));
  worker.on('failed', (job, err) => {
    logger.warn(
      { err, jobId: job?.id, jobName: job?.name, attemptsMade: job?.attemptsMade },
      'Notification job failed',
    );
  });

  return Object.assign(worker, {
    process: (job: NotificationJob<unknown>) => dispatchNotificationJob(job, ctx),
  }) as NotificationWorkerRuntime;
}
