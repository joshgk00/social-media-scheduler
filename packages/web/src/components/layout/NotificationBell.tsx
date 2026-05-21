import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationDropdownContent } from './NotificationDropdownContent';
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
  type NotificationRow,
} from '@/hooks/use-notifications';

export type NotificationBellRow = Partial<NotificationRow> & Pick<NotificationRow, 'id' | 'title'>;

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

export interface NotificationBellProps {
  unreadCount?: number;
  recentNotifications?: NotificationBellRow[];
  isLoading?: boolean;
  onMarkRead?: (notificationId: string) => Promise<unknown> | unknown;
  onMarkAllRead?: () => Promise<unknown> | unknown;
  onOpenChange?: (isOpen: boolean) => void;
}

function getStringPayloadValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

function getNumberPayloadValue(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatBulkNotification(notification: NotificationBellRow): NotificationBellRow {
  if (notification.eventType !== 'bulk_completed') return notification;

  const payload = notification.payload ?? {};
  const operation = getStringPayloadValue(payload, 'operation') ?? '';
  if (!operation) return notification;
  const operationLabel = bulkOperationLabels[operation] ?? 'Bulk operation';
  const successCount = getNumberPayloadValue(payload, 'successCount');
  const failureCount = getNumberPayloadValue(payload, 'failureCount');
  const errorReportUrl = getStringPayloadValue(payload, 'errorReportUrl') ?? getStringPayloadValue(payload, 'errorReportPath');
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

function toNotificationRow(notification: NotificationBellRow): NotificationRow {
  const formattedNotification = formatBulkNotification(notification);
  return {
    eventType: 'publish_failed',
    severity: 'info',
    body: '',
    linkPath: null,
    payload: {},
    readAt: null,
    createdAt: new Date().toISOString(),
    ...formattedNotification,
  };
}

function NotificationBellView({
  unreadCount = 0,
  recentNotifications = [],
  isLoading = false,
  onMarkRead,
  onMarkAllRead,
  onOpenChange,
}: Required<Pick<NotificationBellProps, 'unreadCount' | 'recentNotifications' | 'isLoading'>> &
  Pick<NotificationBellProps, 'onMarkRead' | 'onMarkAllRead' | 'onOpenChange'>) {
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const ariaLabel = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          aria-label={ariaLabel}
          aria-haspopup="menu"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-xs font-semibold leading-5 text-destructive-foreground">
              {badgeLabel}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <span className="sr-only" aria-live="polite">
        {ariaLabel}
      </span>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[380px] p-0">
        <NotificationDropdownContent
          notifications={recentNotifications.map(toNotificationRow)}
          unreadCount={unreadCount}
          isLoading={isLoading}
          onMarkRead={onMarkRead}
          onMarkAllRead={onMarkAllRead}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBellContainer() {
  const unreadCountQuery = useUnreadCount();
  const notificationsQuery = useNotifications({ page: 1, pageSize: 4 });
  const markReadMutation = useMarkRead();
  const markAllReadMutation = useMarkAllRead();
  const [lastObservedUnreadCount, setLastObservedUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    const unreadCount = unreadCountQuery.data?.count;
    if (unreadCount === undefined) return;

    if (lastObservedUnreadCount !== null && unreadCount > lastObservedUnreadCount) {
      void notificationsQuery.refetch();
    }
    setLastObservedUnreadCount(unreadCount);
  }, [lastObservedUnreadCount, notificationsQuery.refetch, unreadCountQuery.data?.count]);

  async function handleMarkRead(notificationId: string) {
    try {
      await markReadMutation.mutateAsync(notificationId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not mark notification read');
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllReadMutation.mutateAsync();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not mark notifications read');
    }
  }

  return (
    <NotificationBellView
      unreadCount={unreadCountQuery.data?.count ?? 0}
      recentNotifications={notificationsQuery.data?.rows ?? []}
      isLoading={notificationsQuery.isLoading}
      onMarkRead={handleMarkRead}
      onMarkAllRead={handleMarkAllRead}
      onOpenChange={(isOpen) => {
        if (isOpen) void notificationsQuery.refetch();
      }}
    />
  );
}

export function NotificationBell(props: NotificationBellProps) {
  if (props.unreadCount !== undefined || props.recentNotifications !== undefined) {
    return (
      <NotificationBellView
        unreadCount={props.unreadCount ?? 0}
        recentNotifications={props.recentNotifications ?? []}
        isLoading={props.isLoading ?? false}
        onMarkRead={props.onMarkRead}
        onMarkAllRead={props.onMarkAllRead}
      />
    );
  }

  return <NotificationBellContainer />;
}
