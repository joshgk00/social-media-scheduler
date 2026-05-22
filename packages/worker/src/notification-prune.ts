import { and, isNotNull, lt } from 'drizzle-orm';
import { notifications } from '@sms/db';
import { createLogger } from '@sms/shared/logger';
import type { createWorkerDb } from './db.js';

const logger = createLogger('notification-prune');

export const NOTIFICATION_READ_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const NOTIFICATION_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function buildReadNotificationPruneCondition(now = new Date()) {
  const olderThan = new Date(now.getTime() - NOTIFICATION_READ_RETENTION_MS);
  return and(
    isNotNull(notifications.readAt),
    lt(notifications.readAt, olderThan),
  );
}

export async function pruneReadNotifications(
  db: ReturnType<typeof createWorkerDb>['db'],
  now = new Date(),
): Promise<number> {
  const deletedRows = await db
    .delete(notifications)
    .where(buildReadNotificationPruneCondition(now))
    .returning({ id: notifications.id });

  if (deletedRows.length > 0) {
    logger.info({ deleted: deletedRows.length }, 'Pruned read notifications older than 90 days');
  }

  return deletedRows.length;
}

export function startNotificationPruneScheduler(db: ReturnType<typeof createWorkerDb>['db']) {
  const interval = setInterval(() => {
    pruneReadNotifications(db).catch((err) => logger.error({ err }, 'Notification prune failed'));
  }, NOTIFICATION_PRUNE_INTERVAL_MS);

  pruneReadNotifications(db).catch((err) => logger.error({ err }, 'Initial notification prune failed'));
  logger.info('Notification prune scheduler registered: every 24 hours');
  return interval;
}
