import { useState, useMemo } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { formatDistanceToNow, format } from 'date-fns';
import { Plus, Search, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';

import { useQueues, useDeleteQueue, useCopyQueueConfig, type QueueListItem, type QueueFilters } from '../../hooks/use-queues';
import { QueueStatusBadge } from '../../components/queues/QueueStatusBadge';
import { QueueActionsMenu } from '../../components/queues/QueueActionsMenu';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';

function getPlatformIcon(platform?: string): string {
  if (platform === 'twitter') return '𝕏';
  return '';
}

export default function QueuesPage() {
  const navigate = useNavigate();
  const deleteQueueMutation = useDeleteQueue();

  const [filters, setFilters] = useState<QueueFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const [copyingQueueId, setCopyingQueueId] = useState<string | null>(null);

  const { data: queues, isLoading, isError, refetch } = useQueues(filters);

  const copyConfigQuery = useCopyQueueConfig(copyingQueueId ?? '');

  const hasActiveFilters = !!(filters.network || filters.status || searchInput);

  const filteredQueues = useMemo(() => {
    if (!queues || !searchInput) return queues ?? [];
    const lowerSearch = searchInput.toLowerCase();
    return queues.filter(q => q.name.toLowerCase().includes(lowerSearch));
  }, [queues, searchInput]);

  function handleDelete(queueId: string) {
    deleteQueueMutation.mutate(queueId, {
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to delete queue');
      },
    });
  }

  async function handleCopyConfig(queueId: string) {
    setCopyingQueueId(queueId);
    try {
      const { data } = await copyConfigQuery.refetch();
      if (data) {
        toast.success('Queue configuration copied. Create a new queue to use it.');
        navigate(`/queues/new?copyFrom=${queueId}`, { state: { copiedConfig: data } });
      }
    } catch {
      toast.error('Failed to copy queue configuration.');
    } finally {
      setCopyingQueueId(null);
    }
  }

  if (isError) {
    return (
      <main className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Queues</h1>
          <Button asChild>
            <Link to="/queues/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Queue
            </Link>
          </Button>
        </div>
        <div className="text-center py-12">
          <h2 className="text-lg font-semibold mb-2">Failed to load queues</h2>
          <p className="text-muted-foreground mb-4">Check your connection and try again.</p>
          <Button onClick={() => refetch()}>Try Again</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Queues</h1>
        <Button asChild>
          <Link to="/queues/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Queue
          </Link>
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filters.network ?? 'all'}
          onValueChange={(value) =>
            setFilters(prev => ({ ...prev, network: value === 'all' ? undefined : value }))
          }
        >
          <SelectTrigger className="w-[150px]" aria-label="Filter by network">
            <SelectValue placeholder="Network" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Networks</SelectItem>
            <SelectItem value="twitter">Twitter</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.status ?? 'all'}
          onValueChange={(value) =>
            setFilters(prev => ({ ...prev, status: value === 'all' ? undefined : value }))
          }
        >
          <SelectTrigger className="w-[150px]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="empty">Empty</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search queues..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            aria-label="Search queues"
          />
        </div>
      </div>

      {/* Data table */}
      {isLoading ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead style={{ width: 160 }}>Profile</TableHead>
                <TableHead style={{ width: 80 }}>Posts</TableHead>
                <TableHead style={{ width: 120 }}>Status</TableHead>
                <TableHead style={{ width: 140 }}>Last Published</TableHead>
                <TableHead style={{ width: 140 }}>Next Run</TableHead>
                <TableHead style={{ width: 48 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : filteredQueues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {hasActiveFilters ? (
            <>
              <h2 className="text-lg font-semibold mb-2">No matching queues</h2>
              <p className="text-sm text-muted-foreground">Try adjusting your filters.</p>
            </>
          ) : (
            <>
              <ListOrdered className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold mb-2">No queues yet</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Create a queue to schedule recurring posts on autopilot.
              </p>
              <Button asChild>
                <Link to="/queues/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Queue
                </Link>
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead style={{ width: 160 }}>Profile</TableHead>
                <TableHead style={{ width: 80 }}>Posts</TableHead>
                <TableHead style={{ width: 120 }}>Status</TableHead>
                <TableHead style={{ width: 140 }}>Last Published</TableHead>
                <TableHead style={{ width: 140 }}>Next Run</TableHead>
                <TableHead style={{ width: 48 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQueues.map((queue) => (
                <TableRow key={queue.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <NavLink
                      to={`/queues/${queue.id}/posts`}
                      className="text-sm font-medium hover:underline"
                    >
                      {queue.name}
                    </NavLink>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {getPlatformIcon(queue.profile?.platform)}{' '}
                      {queue.profile?.displayName ?? '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{queue.postCount}</span>
                  </TableCell>
                  <TableCell>
                    <QueueStatusBadge
                      isPaused={queue.isPaused}
                      postCount={queue.postCount}
                      seasonalStart={queue.seasonalStart}
                      seasonalEnd={queue.seasonalEnd}
                    />
                  </TableCell>
                  <TableCell>
                    {queue.lastPublishedAt ? (
                      <span
                        className="text-sm text-muted-foreground"
                        title={format(new Date(queue.lastPublishedAt), 'PPpp')}
                      >
                        {formatDistanceToNow(new Date(queue.lastPublishedAt), { addSuffix: true })}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <NextRunCell queue={queue} />
                  </TableCell>
                  <TableCell>
                    <QueueActionsMenu
                      queue={queue}
                      onDelete={() => handleDelete(queue.id)}
                      onCopyConfig={() => handleCopyConfig(queue.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}

function NextRunCell({ queue }: { queue: QueueListItem }) {
  if (queue.isPaused) {
    return <span className="text-sm text-muted-foreground">Paused</span>;
  }
  if (queue.postCount === 0) {
    return <span className="text-sm text-muted-foreground">Empty</span>;
  }
  if (queue.nextRunAt) {
    return (
      <span
        className="text-sm text-muted-foreground"
        title={format(new Date(queue.nextRunAt), 'PPpp')}
      >
        {formatDistanceToNow(new Date(queue.nextRunAt), { addSuffix: true })}
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground">-</span>;
}
