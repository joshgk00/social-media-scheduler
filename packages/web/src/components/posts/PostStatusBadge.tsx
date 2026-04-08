import type { PostStatus } from '@sms/shared';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<PostStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  queued: { label: 'Queued', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  publishing: { label: 'Publishing', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  published: { label: 'Published', className: 'bg-green-100 text-green-700 border-green-200' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700 border-red-200' },
  auto_destructing: { label: 'Auto-destructing', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  destroyed: { label: 'Destroyed', className: 'bg-gray-200 text-gray-500 border-gray-300' },
};

interface PostStatusBadgeProps {
  status: PostStatus;
}

export function PostStatusBadge({ status }: PostStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' };
  return (
    <Badge variant="outline" className={cn('font-medium', config.className)}>
      {config.label}
    </Badge>
  );
}
