import { Bell } from 'lucide-react';
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

export interface NotificationBellProps {
  unreadCount?: number;
  recentNotifications?: NotificationBellRow[];
  isLoading?: boolean;
  onMarkRead?: (notificationId: string) => Promise<unknown> | unknown;
  onMarkAllRead?: () => Promise<unknown> | unknown;
}

function toNotificationRow(notification: NotificationBellRow): NotificationRow {
  return {
    eventType: 'publish_failed',
    severity: 'info',
    body: '',
    linkPath: null,
    payload: {},
    readAt: null,
    createdAt: new Date().toISOString(),
    ...notification,
  };
}

function NotificationBellView({
  unreadCount = 0,
  recentNotifications = [],
  isLoading = false,
  onMarkRead,
  onMarkAllRead,
}: Required<Pick<NotificationBellProps, 'unreadCount' | 'recentNotifications' | 'isLoading'>> &
  Pick<NotificationBellProps, 'onMarkRead' | 'onMarkAllRead'>) {
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const ariaLabel = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <DropdownMenu modal={false}>
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
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
              {badgeLabel}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-96 p-0">
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
  const notificationsQuery = useNotifications({ page: 1, pageSize: 10 });
  const markReadMutation = useMarkRead();
  const markAllReadMutation = useMarkAllRead();

  async function handleMarkRead(notificationId: string) {
    await markReadMutation.mutateAsync(notificationId);
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
