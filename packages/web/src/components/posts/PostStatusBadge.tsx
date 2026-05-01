import {
  CalendarClock,
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  Pause,
  TimerOff,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { PostStatus } from '@sms/shared';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

interface StatusStyle {
  bg: string;
  text: string;
  border: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  withSpinner?: boolean;
}

const STATUS_STYLES: Record<PostStatus, StatusStyle> = {
  draft: { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border', label: 'Draft', Icon: FileText },
  scheduled: { bg: '', text: 'text-foreground', border: 'border-border', label: 'Scheduled', Icon: CalendarClock },
  queued: { bg: '', text: 'text-foreground', border: 'border-border', label: 'Queued', Icon: Circle },
  paused: {
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/30',
    label: 'Paused',
    Icon: Pause,
  },
  publishing: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-border',
    label: 'Publishing',
    Icon: Loader2,
    withSpinner: true,
  },
  published: {
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success/30',
    label: 'Published',
    Icon: CheckCircle2,
  },
  failed: {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    border: 'border-destructive/30',
    label: 'Failed',
    Icon: XCircle,
  },
  auto_destructing: {
    bg: 'bg-destructive/10',
    text: 'text-destructive/80',
    border: 'border-destructive/20',
    label: 'Auto-destructing',
    Icon: TimerOff,
  },
  destroyed: {
    bg: 'bg-success/10',
    text: 'text-success/70',
    border: 'border-success/20',
    label: 'Destroyed',
    Icon: Trash2,
  },
};

interface PostStatusBadgeProps {
  status: PostStatus;
}

export function PostStatusBadge({ status }: PostStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? {
    bg: '',
    text: '',
    border: '',
    label: status,
    Icon: Circle,
  };
  const { Icon } = style;
  return (
    <Badge
      variant="outline"
      className={cn(
        style.bg,
        style.text,
        style.border,
        'text-xs font-semibold inline-flex items-center gap-1',
      )}
    >
      <Icon className={cn('h-3 w-3', style.withSpinner && 'animate-spin')} aria-hidden="true" />
      {style.label}
    </Badge>
  );
}
