import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { CheckCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { formatBulkNotification, toNotificationRow, type PartialNotificationRow } from '@/lib/notification-display';
import {
  useClearRead,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
  type NotificationRow as NotificationRowData,
  type NotificationsFilters,
} from '@/hooks/use-notifications';
import { NotificationFilterBar } from './components/NotificationFilterBar';

type ReadStatus = 'all' | 'read' | 'unread';
type TypeFilter = 'all' | 'error' | 'warning' | 'info';
type TestNotificationRow = PartialNotificationRow;

export interface NotificationsPageProps {
  rows?: TestNotificationRow[];
  isLoading?: boolean;
  onMarkRead?: (notificationId: string) => Promise<unknown> | unknown;
  onMarkAllRead?: () => Promise<unknown> | unknown;
  onClearRead?: () => Promise<unknown> | unknown;
}

function NotificationSkeletonRows() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 8 }).map((_, skeletonIndex) => (
        <div
          key={skeletonIndex}
          className="grid grid-cols-[auto_1fr_auto_auto] items-start gap-3 px-4 py-3"
          data-testid="notification-skeleton-row"
        >
          <Skeleton className="mt-[5px] h-2 w-2 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

function NotificationsPageView({
  rows,
  isLoading = false,
  onMarkRead,
  onMarkAllRead,
  onClearRead,
  unreadCountOverride,
  readStatus,
  type,
  onReadStatusChange,
  onTypeChange,
  onNavigate,
  pagination,
}: {
  rows: NotificationRowData[];
  isLoading?: boolean;
  onMarkRead?: (notificationId: string) => Promise<unknown> | unknown;
  onMarkAllRead?: () => Promise<unknown> | unknown;
  onClearRead?: () => Promise<unknown> | unknown;
  unreadCountOverride?: number;
  readStatus: ReadStatus;
  type: TypeFilter;
  onReadStatusChange: (readStatus: ReadStatus) => void;
  onTypeChange: (type: TypeFilter) => void;
  onNavigate: (linkPath: string) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPreviousPage: () => void;
    onNextPage: () => void;
  };
}) {
  const pageUnreadCount = useMemo(
    () => rows.filter((notification) => notification.readAt === null).length,
    [rows],
  );
  const unreadCount = unreadCountOverride ?? pageUnreadCount;

  async function handleMarkAllRead() {
    try {
      await onMarkAllRead?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not mark notifications read');
    }
  }

  async function handleClearRead() {
    try {
      await onClearRead?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not clear read notifications');
    }
  }

  return (
    <main className="space-y-5">
      <PageHeader
        title="Notifications"
        subtitle="Failures, token health, and queue events that need operator attention."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleMarkAllRead()}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              Mark all read
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleClearRead()}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Clear read
            </Button>
          </div>
        }
      />

      <NotificationFilterBar
        readStatus={readStatus}
        type={type}
        onReadStatusChange={onReadStatusChange}
        onTypeChange={onTypeChange}
      />

      <Card className="overflow-hidden">
        {isLoading ? <NotificationSkeletonRows /> : null}

        {!isLoading && rows.length === 0 ? (
          <div className="px-4 py-12">
            <EmptyState
              icon={CheckCheck}
              title="You're all caught up"
              body="We'll let you know when something needs your attention."
            />
          </div>
        ) : null}

        {!isLoading && rows.length > 0 ? (
          <div className="divide-y divide-border">
            {rows.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onMarkRead={onMarkRead}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
      </Card>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2" aria-label="Notifications pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.currentPage <= 1}
            onClick={pagination.onPreviousPage}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
            Page {pagination.currentPage} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.currentPage >= pagination.totalPages}
            onClick={pagination.onNextPage}
          >
            Next
          </Button>
        </div>
      ) : null}
    </main>
  );
}

function NotificationsPageContainer() {
  const [filters, setFilters] = useState<NotificationsFilters>({ page: 1 });
  const navigate = useNavigate();
  const notificationsQuery = useNotifications(filters);
  const unreadCountQuery = useUnreadCount();
  const markReadMutation = useMarkRead();
  const markAllReadMutation = useMarkAllRead();
  const clearReadMutation = useClearRead();
  const rows = (notificationsQuery.data?.rows ?? []).map(formatBulkNotification);
  const totalPages = notificationsQuery.data
    ? Math.max(1, Math.ceil(notificationsQuery.data.total / notificationsQuery.data.pageSize))
    : 1;
  const currentPage = notificationsQuery.data?.page ?? filters.page ?? 1;

  return (
    <NotificationsPageView
      rows={rows}
      isLoading={notificationsQuery.isLoading}
      onMarkRead={(notificationId) => markReadMutation.mutateAsync(notificationId)}
      onMarkAllRead={() => markAllReadMutation.mutateAsync()}
      onClearRead={() => clearReadMutation.mutateAsync()}
      unreadCountOverride={unreadCountQuery.data?.count ?? 0}
      readStatus={filters.readStatus ?? 'all'}
      type={filters.type ?? 'all'}
      onReadStatusChange={(readStatus) =>
        setFilters((previousFilters) => ({ ...previousFilters, readStatus, page: 1 }))
      }
      onTypeChange={(type) =>
        setFilters((previousFilters) => ({ ...previousFilters, type, page: 1 }))
      }
      onNavigate={navigate}
      pagination={notificationsQuery.data ? {
        currentPage,
        totalPages,
        onPreviousPage: () =>
          setFilters((previousFilters) => ({ ...previousFilters, page: currentPage - 1 })),
        onNextPage: () =>
          setFilters((previousFilters) => ({ ...previousFilters, page: currentPage + 1 })),
      } : undefined}
    />
  );
}

function NotificationsPageControlled(props: NotificationsPageProps) {
  const [readStatus, setReadStatus] = useState<ReadStatus>('all');
  const [type, setType] = useState<TypeFilter>('all');

  return (
    <NotificationsPageView
      rows={(props.rows ?? []).map(toNotificationRow)}
      isLoading={props.isLoading ?? false}
      onMarkRead={props.onMarkRead}
      onMarkAllRead={props.onMarkAllRead}
      onClearRead={props.onClearRead}
      readStatus={readStatus}
      type={type}
      onReadStatusChange={setReadStatus}
      onTypeChange={setType}
      onNavigate={() => undefined}
    />
  );
}

export function NotificationsPage(props: NotificationsPageProps) {
  if (props.rows !== undefined || props.isLoading !== undefined) {
    return <NotificationsPageControlled {...props} />;
  }

  return <NotificationsPageContainer />;
}

export default NotificationsPage;
