import type { PostStatus } from '@sms/shared';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

const STATUS_STYLES: Record<PostStatus, { bg: string; text: string; border: string; label: string }> = {
  draft: { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border', label: 'Draft' },
  scheduled: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20', label: 'Scheduled' },
  queued: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20', label: 'Queued' },
  publishing: { bg: 'bg-amber-400/10', text: 'text-amber-400', border: 'border-amber-400/20', label: 'Publishing' },
  published: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/20', label: 'Published' },
  failed: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/20', label: 'Failed' },
  auto_destructing: { bg: 'bg-amber-400/10', text: 'text-amber-400', border: 'border-amber-400/20', label: 'Deleting' },
  destroyed: { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border', label: 'Destroyed' },
};

interface PostStatusBadgeProps {
  status: PostStatus;
}

export function PostStatusBadge({ status }: PostStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? { bg: '', text: '', border: '', label: status };
  return (
    <Badge variant="outline" className={cn(style.bg, style.text, style.border, 'text-xs font-semibold')}>
      {style.label}
    </Badge>
  );
}
