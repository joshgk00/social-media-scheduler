import { Loader2, Pause } from 'lucide-react';
import type { PostStatus } from '@sms/shared';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

interface StatusStyle {
  bg: string;
  text: string;
  border: string;
  label: string;
  withSpinner?: boolean;
  withPause?: boolean;
}

const STATUS_STYLES: Record<PostStatus, StatusStyle> = {
  draft: { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border', label: 'Draft' },
  scheduled: { bg: '', text: 'text-foreground', border: 'border-border', label: 'Scheduled' },
  queued: { bg: '', text: 'text-foreground', border: 'border-border', label: 'Queued' },
  paused: {
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/30',
    label: 'Paused',
    withPause: true,
  },
  publishing: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-border',
    label: 'Publishing',
    withSpinner: true,
  },
  published: {
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success/30',
    label: 'Published',
  },
  failed: {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    border: 'border-destructive/30',
    label: 'Failed',
  },
  auto_destructing: {
    bg: 'bg-destructive/10',
    text: 'text-destructive/80',
    border: 'border-destructive/20',
    label: 'Auto-destructing',
  },
  destroyed: {
    bg: 'bg-success/10',
    text: 'text-success/70',
    border: 'border-success/20',
    label: 'Destroyed',
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
  };
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
      {style.withSpinner && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
      {style.withPause && <Pause className="h-3 w-3" aria-hidden="true" />}
      {style.label}
    </Badge>
  );
}
