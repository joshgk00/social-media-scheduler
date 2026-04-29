import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import type { NotificationRow as NotificationRowData } from '@/hooks/use-notifications';

export interface NotificationDropdownContentProps {
  notifications: NotificationRowData[];
  unreadCount: number;
  isLoading?: boolean;
  onMarkRead?: (notificationId: string) => Promise<unknown> | unknown;
  onMarkAllRead?: () => Promise<unknown> | unknown;
}

function NotificationSkeletonRows() {
  return (
    <div className="space-y-3 px-4 py-3">
      {Array.from({ length: 4 }).map((_, skeletonIndex) => (
        <div key={skeletonIndex} className="flex gap-3" data-testid="notification-dropdown-skeleton-row">
          <Skeleton className="h-4 w-4 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotificationDropdownContent({
  notifications,
  unreadCount,
  isLoading = false,
  onMarkRead,
  onMarkAllRead,
}: NotificationDropdownContentProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Recent notifications</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => void onMarkAllRead?.()}
          disabled={unreadCount === 0}
        >
          Mark all read
        </Button>
      </div>

      <ScrollArea className="max-h-[400px]">
        {isLoading ? <NotificationSkeletonRows /> : null}
        {!isLoading && notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">You're all caught up</p>
          </div>
        ) : null}
        {!isLoading && notifications.length > 0 ? (
          <div className="divide-y divide-border">
            {notifications.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} onMarkRead={onMarkRead} />
            ))}
          </div>
        ) : null}
      </ScrollArea>

      <div className="border-t border-border px-4 py-2">
        <Button asChild variant="ghost" size="sm" className="h-8 w-full justify-between px-2">
          <a href="/notifications">
            View all notifications
            <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
