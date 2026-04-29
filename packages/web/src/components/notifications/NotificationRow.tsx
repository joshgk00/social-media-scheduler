import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { NotificationRow as NotificationRowData } from '@/hooks/use-notifications';

export interface NotificationRowProps {
  notification: NotificationRowData;
  onMarkRead?: (notificationId: string) => Promise<unknown> | unknown;
  onNavigate?: (linkPath: string) => void;
}

const severityIcons = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};

const severityClasses = {
  info: 'text-sky-600',
  warning: 'text-amber-600',
  error: 'text-destructive',
};

function isSafeLinkPath(linkPath: string | null): linkPath is string {
  return Boolean(linkPath && /^\/(?:posts|profiles|queues)(?:\/[a-z0-9-]+)?$/i.test(linkPath));
}

function NotificationRowView({ notification, onMarkRead, onNavigate }: NotificationRowProps & { onNavigate: (linkPath: string) => void }) {
  const SeverityIcon = severityIcons[notification.severity];
  const isUnread = notification.readAt === null;

  async function handleClick() {
    try {
      if (isUnread) {
        await onMarkRead?.(notification.id);
      }
      if (isSafeLinkPath(notification.linkPath)) {
        onNavigate(notification.linkPath);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not mark notification read');
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isUnread && 'bg-primary/5',
      )}
    >
      <SeverityIcon className={cn('mt-0.5 h-4 w-4 shrink-0', severityClasses[notification.severity])} />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-start justify-between gap-3">
          <span className="truncate text-sm font-medium text-foreground">{notification.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </span>
        </span>
        <span className="line-clamp-2 text-sm text-muted-foreground">{notification.body}</span>
      </span>
      {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
    </button>
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
