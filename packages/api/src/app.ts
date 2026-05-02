import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';
import type { Queue } from 'bullmq';
import type { Db } from '@sms/db';
import type { StorageBackend } from '@sms/shared/storage';

import { correlationId } from './middleware/correlation-id.js';
import { httpLogger } from './middleware/logger.js';
import { securityHeaders } from './middleware/security-headers.js';
import { createSessionMiddleware } from './middleware/session.js';
import { doubleCsrfProtection } from './middleware/csrf.js';
import { errorHandler } from './middleware/error-handler.js';
import { createHealthRouter } from './routes/health.js';
import { createSetupRouter } from './routes/setup.js';
import { createAuthRouter } from './routes/auth.js';
import { createRecoveryRouter } from './routes/recovery.js';
import { createSettingsRouter } from './routes/settings.js';
import { createProfilesRouter } from './routes/profiles.js';
import { createOAuthRouter } from './routes/oauth.js';
import { createPostsRouter } from './routes/posts.js';
import { createRateLimitRouter } from './routes/rate-limit.js';
import { createTagsRouter } from './routes/tags.js';
import { createSnippetsRouter } from './routes/snippets.js';
import { createCalendarRouter } from './routes/calendar.js';
import { createQueuesRouter } from './routes/queues.js';
import { createAdminRouter } from './routes/admin.js';
import { createMediaRouter } from './routes/media.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createNotificationPrefsRouter } from './routes/notification-prefs.js';
import { createEmailLogsRouter } from './routes/email-logs.js';
import { createSystemRouter } from './routes/system.js';
import type { PublishQueueService } from './services/publish-queue.service.js';
import type { BulkOpsQueueService } from './services/bulk-ops-queue.service.js';
import { createBulkImportRouter } from './routes/bulk-import.js';
interface AppDependencies {
  redis: Redis;
  sql: Sql;
  db: Db;
  sessionSecret: string;
  // Optional so existing tests that don't exercise the publish/admin paths can
  // keep constructing the app without stubbing BullMQ. Production wiring in
  // `index.ts` always supplies all three.
  publishQueueService?: PublishQueueService;
  bulkOpsQueueService?: BulkOpsQueueService;
  notificationQueue?: Queue;
  storage?: StorageBackend;
  transcodeQueue?: Queue;
}

export function createApp({
  redis,
  sql,
  db,
  sessionSecret,
  publishQueueService,
  bulkOpsQueueService,
  notificationQueue,
  storage,
  transcodeQueue,
}: AppDependencies) {
  const app = express();

  app.use(correlationId);
  app.use(httpLogger);
  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(createSessionMiddleware(redis, sessionSecret));

  // Bull-Board mounts BEFORE csrf protection so the dashboard's own POSTs
  // (retry, promote, clean) are not blocked by the double-submit token check.
  // The admin router applies `requireAuth` itself, so the path is still
  // session-authenticated. Documented accepted risk T-04-04-07 in the plan
  // threat model — acceptable because the app is single-user and the path
  // is an operator tool, not a user-facing mutation surface.
  if (publishQueueService && notificationQueue) {
    app.use(createAdminRouter({
      publishQueue: publishQueueService.publishQueue,
      notificationQueue,
      bulkOpsQueue: bulkOpsQueueService?.bulkOpsQueue,
    }));
  }

  app.use(doubleCsrfProtection);

  app.use(createSetupRouter({ db }));
  app.use(createAuthRouter({ db }));
  app.use(createRecoveryRouter({ db, redis }));
  app.use(createSettingsRouter({ db, redis }));

  app.use(createProfilesRouter({ db }));
  app.use(createOAuthRouter({ db, redis }));
  if (bulkOpsQueueService) {
    app.use('/api/bulk-import', createBulkImportRouter({ db, bulkOpsQueueService }));
  }
  app.use(createPostsRouter({ db, publishQueueService, bulkOpsQueueService, notificationQueue }));
  app.use(createRateLimitRouter({ db }));
  app.use(createTagsRouter({ db }));
  app.use(createSnippetsRouter({ db }));
  app.use(createCalendarRouter({ db }));
  app.use(createNotificationsRouter({ db }));
  app.use(createNotificationPrefsRouter({ db }));
  app.use(createEmailLogsRouter({ db }));
  app.use(createSystemRouter());
  app.use('/api/queues', createQueuesRouter({ db, bulkOpsQueueService }));

  if (storage && transcodeQueue) {
    app.use('/api/media', createMediaRouter({ db, storage, transcodeQueue }));
  }

  const mediaDir = process.env.MEDIA_DIR || './data/media';
  app.use('/media', express.static(mediaDir));
  app.use('/avatars', express.static(path.join(mediaDir, 'avatars')));

  app.use(createHealthRouter({ redis, sql }));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}
