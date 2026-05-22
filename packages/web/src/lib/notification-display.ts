import type { NotificationRow } from '@/hooks/use-notifications';

export type PartialNotificationRow = Partial<NotificationRow> & Pick<NotificationRow, 'id' | 'title'>;

const BULK_ERROR_REPORT_PATTERN = /^\/media\/bulk-errors\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/errors\.csv$/i;

const bulkOperationLabels: Record<string, string> = {
  'bulk.csv-import-scheduled': 'Import',
  'bulk.csv-import-queue': 'Import',
  'bulk.queue-randomize': 'Randomize',
  'bulk.queue-purge': 'Purge queue',
  'bulk.queue-copy': 'Copy queue',
  'bulk.queue-text-modify': 'Modify text',
  'bulk.queue-dedupe': 'Remove duplicates',
  'bulk.profile-pause': 'Pause publishing',
  'bulk.profile-resume': 'Resume publishing',
  'bulk.profile-bulk-delete': 'Bulk delete',
  'bulk.profile-modify-tags': 'Modify tags',
};

function getStringPayloadValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

function getNumberPayloadValue(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeErrorReportUrl(value: string | null): string | null {
  if (!value) return null;

  let path = value;
  try {
    const url = new URL(value, window.location.origin);
    path = url.pathname;
  } catch {
    path = value;
  }

  path = path.replace(/\\/g, '/');
  if (BULK_ERROR_REPORT_PATTERN.test(path)) return path;

  const reportMatch = path.match(/(?:^|\/)bulk-errors\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/errors\.csv$/i);
  return reportMatch ? `/media/bulk-errors/${reportMatch[1]}/errors.csv` : null;
}

export function formatBulkNotification(notification: NotificationRow): NotificationRow {
  if (notification.eventType !== 'bulk_completed') return notification;

  const payload = notification.payload ?? {};
  const operation = getStringPayloadValue(payload, 'operation') ?? '';
  if (!operation) return notification;

  const operationLabel = bulkOperationLabels[operation] ?? 'Bulk operation';
  const successCount = getNumberPayloadValue(payload, 'successCount');
  const failureCount = getNumberPayloadValue(payload, 'failureCount');
  const errorReportUrl = normalizeErrorReportUrl(
    getStringPayloadValue(payload, 'errorReportUrl') ?? getStringPayloadValue(payload, 'errorReportPath'),
  );
  const displayKind = failureCount > 0 ? 'bulk-op-failed' : 'bulk-op-finished';

  return {
    ...notification,
    severity: failureCount > 0 ? 'warning' : 'info',
    title:
      failureCount > 0
        ? `${operationLabel} complete with ${failureCount} errors.`
        : `${operationLabel} complete: ${successCount} posts.`,
    body: failureCount > 0 ? 'Open the error report to review rows that need attention.' : notification.body,
    payload: {
      ...payload,
      displayKind,
      errorReportUrl,
    },
  };
}

export function toNotificationRow(notification: PartialNotificationRow): NotificationRow {
  return formatBulkNotification({
    eventType: 'publish_failed',
    severity: 'info',
    body: '',
    linkPath: null,
    payload: {},
    readAt: null,
    createdAt: new Date().toISOString(),
    ...notification,
  });
}
