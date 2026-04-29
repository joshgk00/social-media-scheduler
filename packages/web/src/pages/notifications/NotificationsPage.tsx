import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import {
  useMarkRead,
  useNotifications,
  type NotificationRow as NotificationRowData,
  type NotificationsFilters,
} from '@/hooks/use-notifications';
import { NotificationFilterBar } from './components/NotificationFilterBar';

type TestNotificationRow = Partial<NotificationRowData> & Pick<NotificationRowData, 'id' | 'title'>;

export interface NotificationsPageProps {
  rows?: TestNotificationRow[];
  isLoading?: boolean;
  onMarkRead?: (notificationId: string) => Promise<unknown> | unknown;
}

function toNotificationRow(notification: TestNotificationRow): NotificationRowData {
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

function NotificationSkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, skeletonIndex) => (
        <TableRow key={skeletonIndex} data-testid="notification-skeleton-row">
          <TableCell><Skeleton className="h-5 w-full" /></TableCell>
          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function useIsNarrowViewport() {
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    function syncViewport() {
      setIsNarrowViewport(window.innerWidth < 768);
    }

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  return isNarrowViewport;
}

function NotificationMobileSkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, skeletonIndex) => (
        <div
          key={skeletonIndex}
          className="rounded-md border border-border p-4"
          data-testid="notification-skeleton-row"
        >
          <Skeleton className="mb-3 h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

function NotificationsPageView({
  rows,
  isLoading = false,
  onMarkRead,
  readStatus,
  onReadStatusChange,
  onNavigate,
  pagination,
}: {
  rows: NotificationRowData[];
  isLoading?: boolean;
  onMarkRead?: (notificationId: string) => Promise<unknown> | unknown;
  readStatus: 'all' | 'read' | 'unread';
  onReadStatusChange: (readStatus: 'all' | 'read' | 'unread') => void;
  onNavigate: (linkPath: string) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPreviousPage: () => void;
    onNextPage: () => void;
  };
}) {
  const isNarrowViewport = useIsNarrowViewport();

  async function handleMarkRead(notificationId: string) {
    try {
      await onMarkRead?.(notificationId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not mark notification read');
    }
  }

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
      </div>

      <NotificationFilterBar readStatus={readStatus} onReadStatusChange={onReadStatusChange} />

      {isNarrowViewport ? (
        <div className="space-y-3">
          {isLoading ? <NotificationMobileSkeletonRows /> : null}
          {!isLoading && rows.length === 0 ? (
            <div className="rounded-md border border-border px-4 py-12 text-center">
              <p className="font-medium text-foreground">You're all caught up</p>
              <p className="text-sm text-muted-foreground">We'll let you know when something needs your attention.</p>
            </div>
          ) : null}
          {!isLoading
            ? rows.map((notification) => (
                <div key={notification.id} className="overflow-hidden rounded-md border border-border">
                  <NotificationRow notification={notification} onMarkRead={handleMarkRead} onNavigate={onNavigate} />
                  <div className="grid grid-cols-2 gap-3 border-t border-border px-4 py-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Severity</p>
                      <p className="capitalize text-foreground">{notification.severity}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="text-foreground">{format(new Date(notification.createdAt), 'PPp')}</p>
                    </div>
                  </div>
                </div>
              ))
            : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Notification</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <NotificationSkeletonRows /> : null}
              {!isLoading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-12 text-center">
                    <p className="font-medium text-foreground">You're all caught up</p>
                    <p className="text-sm text-muted-foreground">
                      We'll let you know when something needs your attention.
                    </p>
                  </TableCell>
                </TableRow>
              ) : null}
              {!isLoading
                ? rows.map((notification) => (
                    <TableRow key={notification.id}>
                      <TableCell className="p-0">
                        <NotificationRow
                          notification={notification}
                          onMarkRead={handleMarkRead}
                          onNavigate={onNavigate}
                        />
                      </TableCell>
                      <TableCell className="capitalize">{notification.severity}</TableCell>
                      <TableCell>{format(new Date(notification.createdAt), 'PPp')}</TableCell>
                    </TableRow>
                  ))
                : null}
            </TableBody>
          </Table>
        </div>
      )}
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
  const markReadMutation = useMarkRead();
  const rows = notificationsQuery.data?.rows ?? [];
  const totalPages = notificationsQuery.data
    ? Math.max(1, Math.ceil(notificationsQuery.data.total / notificationsQuery.data.pageSize))
    : 1;
  const currentPage = notificationsQuery.data?.page ?? filters.page ?? 1;

  return (
    <NotificationsPageView
      rows={rows}
      isLoading={notificationsQuery.isLoading}
      onMarkRead={(notificationId) => markReadMutation.mutateAsync(notificationId)}
      readStatus={filters.readStatus ?? 'all'}
      onReadStatusChange={(readStatus) =>
        setFilters((previousFilters) => ({ ...previousFilters, readStatus, page: 1 }))
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
  const [readStatus, setReadStatus] = useState<'all' | 'read' | 'unread'>('all');

  return (
    <NotificationsPageView
      rows={(props.rows ?? []).map(toNotificationRow)}
      isLoading={props.isLoading ?? false}
      onMarkRead={props.onMarkRead}
      readStatus={readStatus}
      onReadStatusChange={setReadStatus}
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
