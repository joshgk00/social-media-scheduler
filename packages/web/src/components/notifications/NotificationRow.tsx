import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon';
import { X } from 'lucide-react';
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
  return Boolean(linkPath && linkPath.startsWith('/') && !linkPath.startsWith('//'));
}

function getErrorReportUrl(payload: Record<string, unknown>): string | null {
  const displayKind = payload.displayKind;
  const errorReportUrl = payload.errorReportUrl;
  return displayKind === 'bulk-op-failed' && typeof errorReportUrl === 'string' && errorReportUrl.length > 0
    ? errorReportUrl
    : null;
}

function actionLabel(notification: NotificationRowData): string {
  if (notification.severity === 'error') return 'View post';
  if (notification.severity === 'warning') return 'Reconnect';
  return 'Dismiss';
}

function NotificationRowView({
  notification,
  compact = false,
  onMarkRead,
  onNavigate,
}: NotificationRowProps & { onNavigate: (linkPath: string) => void }) {
  const isUnread = notification.readAt === null;

  async function handleAction() {
    try {
      if (isUnread) {
        await onMarkRead?.(notification.id);
      }

      const errorReportUrl = getErrorReportUrl(notification.payload);
      if (notification.severity === 'error' && errorReportUrl) {
        window.open(errorReportUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      if (notification.severity === 'error' && isSafeLinkPath(notification.linkPath)) {
        onNavigate(notification.linkPath);
        return;
      }

      if (notification.severity === 'warning') {
        onNavigate(isSafeLinkPath(notification.linkPath) ? notification.linkPath : '/profiles');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update notification');
    }
  }

  return (
    <div
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

      {notification.severity === 'info' ? (
        <IconButton
          icon={X}
          label={`Dismiss ${notification.title}`}
          className="h-7 w-7"
          onClick={() => void handleAction()}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0"
          onClick={() => void handleAction()}
        >
          {actionLabel(notification)}
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
