import { formatDistanceToNow } from 'date-fns';
import { useEffect, useRef, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon';
import { ExternalLink, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotificationRow as NotificationRowData } from '@/hooks/use-notifications';

export interface NotificationRowProps {
  notification: NotificationRowData;
  compact?: boolean;
  onMarkRead?: (notificationId: string) => Promise<unknown> | unknown;
  onNavigate?: (linkPath: string) => void;
}

const severityDotClass: Record<NotificationRowData['severity'], string> = {
  error: 'bg-[var(--status-danger)]',
  warning: 'bg-[var(--status-warning)]',
  info: 'bg-[var(--status-info)]',
};

function isSafeLinkPath(linkPath: string | null): linkPath is string {
  // Match route prefixes exactly; uppercase prefixes would miss the router and 404.
  const safeEntityPath = /^\/(?:posts|profiles|queues|notifications)(?:\/[a-zA-Z0-9-]+)?$/;
  const safeBulkOpPath = /^\/posts\?bulkOp=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return Boolean(linkPath && (safeEntityPath.test(linkPath) || safeBulkOpPath.test(linkPath)));
}

function getErrorReportUrl(payload: Record<string, unknown>): string | null {
  const displayKind = payload.displayKind;
  const errorReportUrl = payload.errorReportUrl;
  return displayKind === 'bulk-op-failed' && typeof errorReportUrl === 'string' && errorReportUrl.length > 0
    ? errorReportUrl
    : null;
}

function actionLabel(notification: NotificationRowData): string {
  if (getErrorReportUrl(notification.payload)) return 'Open report';
  if (notification.severity === 'info' && isSafeLinkPath(notification.linkPath)) return 'View';
  if (notification.severity === 'error') return 'View post';
  if (notification.severity === 'warning') return 'Reconnect';
  return 'Dismiss';
}

function focusAdjacentNotificationAction(
  row: HTMLDivElement | null,
  mountedRef: RefObject<boolean>,
) {
  window.setTimeout(() => {
    if (!mountedRef.current) return;

    const rows = Array.from(
      document.querySelectorAll<HTMLDivElement>('[data-notification-row]'),
    );
    const rowIndex = row ? rows.indexOf(row) : -1;
    const candidates =
      rowIndex >= 0
        ? [rows[rowIndex + 1], rows[rowIndex - 1]]
        : rows;
    const nextAction = candidates
      .filter(Boolean)
      .map((candidate) =>
        candidate.querySelector<HTMLElement>('[data-notification-action]'),
      )
      .find(Boolean);

    nextAction?.focus();
  }, 0);
}

function NotificationRowView({
  notification,
  compact = false,
  onMarkRead,
  onNavigate,
}: NotificationRowProps & { onNavigate: (linkPath: string) => void }) {
  const isUnread = notification.readAt === null;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const errorReportUrl = getErrorReportUrl(notification.payload);
  const safeLinkPath = isSafeLinkPath(notification.linkPath) ? notification.linkPath : null;

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  async function handleAction() {
    try {
      if (isUnread) {
        await onMarkRead?.(notification.id);
      }

      if (errorReportUrl) {
        window.open(errorReportUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      if (safeLinkPath) {
        onNavigate(safeLinkPath);
        return;
      }

      if (notification.severity === 'warning') {
        onNavigate('/profiles');
        return;
      }

      if (notification.severity === 'info') {
        focusAdjacentNotificationAction(rowRef.current, mountedRef);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update notification');
    }
  }

  return (
    <div
      ref={rowRef}
      data-notification-row
      className={cn(
        'grid grid-cols-[auto_1fr_auto_auto] items-start gap-3 px-3 py-3',
        compact ? 'gap-2 px-3 py-2.5' : 'px-4 py-3',
      )}
    >
      <span
        className={cn('mt-[5px] h-2 w-2 rounded-full', severityDotClass[notification.severity])}
        aria-label={`${notification.severity} severity`}
      />

      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className={cn('truncate text-[13px] text-foreground', isUnread ? 'font-semibold' : 'font-normal')}>
            {notification.title}
          </p>
          {isUnread ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-accent)]" aria-label="Unread" />
          ) : null}
        </div>
        {notification.body ? (
          <p className={cn('line-clamp-2 text-xs text-muted-foreground', compact && 'line-clamp-1')}>
            {notification.body}
          </p>
        ) : null}
      </div>

      <time
        dateTime={notification.createdAt}
        className="shrink-0 whitespace-nowrap pt-0.5 text-right text-[11px] text-muted-foreground"
      >
        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
      </time>

      {notification.severity === 'info' && !safeLinkPath ? (
        <IconButton
          icon={X}
          label={`Dismiss ${notification.title}`}
          data-notification-action
          className="h-7 w-7"
          onClick={() => void handleAction()}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-notification-action
          className="h-7 shrink-0"
          onClick={() => void handleAction()}
        >
          {actionLabel(notification)}
          {errorReportUrl ? <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" /> : null}
        </Button>
      )}
    </div>
  );
}

function NotificationRowContainer(props: Omit<NotificationRowProps, 'onNavigate'>) {
  const navigate = useNavigate();
  return <NotificationRowView {...props} onNavigate={navigate} />;
}

export function NotificationRow(props: NotificationRowProps) {
  if (props.onNavigate) {
    return <NotificationRowView {...props} onNavigate={props.onNavigate} />;
  }

  return <NotificationRowContainer {...props} />;
}
