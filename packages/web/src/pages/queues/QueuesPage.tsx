import { useState, useMemo } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { formatDistanceToNow, format } from 'date-fns';
import { Plus, Search, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';

import { useQueryClient } from '@tanstack/react-query';
import { useQueues, useDeleteQueue, useToggleQueuePaused, type QueueListItem, type QueueFilters } from '../../hooks/use-queues';
import { apiClient } from '../../lib/api-client';
import { QueueActionsMenu } from '../../components/queues/QueueActionsMenu';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { Input } from '../../components/ui/input';
import { PageHeader } from '../../components/ui/page-header';
import { PlatformGlyph, type Platform } from '../../components/ui/platform-glyph';
import { Segmented } from '../../components/ui/segmented';
import { StatusPill } from '../../components/ui/pill';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { cadenceSummary, formatNextRun } from '../../lib/queue-schedule';

type StatusFilter = 'all' | 'active' | 'paused';

function normalizePlatform(platform?: string): Platform {
  if (platform === 'linkedin' || platform === 'facebook') return platform;
  return 'twitter';
}

export default function QueuesPage() {
  const navigate = useNavigate();
  const deleteQueueMutation = useDeleteQueue();
  const toggleQueuePausedMutation = useToggleQueuePaused();

  const [filters, setFilters] = useState<QueueFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const queryClient = useQueryClient();

  const { data: queues, isLoading, isError, refetch } = useQueues(filters);

  const hasActiveFilters = !!(filters.status || searchInput);

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

  function handleTogglePause(queue: QueueListItem) {
    toggleQueuePausedMutation.mutate(
      { id: queue.id, isPaused: !queue.isPaused },
      {
        onSuccess: () => {
          toast.success(queue.isPaused ? 'Queue resumed.' : 'Queue paused.');
        },
        onError: () => {
          toast.error("Couldn't update queue status.");
        },
      },
    );
  }

  async function handleCopyConfig(queueId: string) {
    try {
      const copiedQueueConfig = await queryClient.fetchQuery({
        queryKey: ['queues', queueId, 'config'],
        queryFn: () => apiClient.get(`/api/queues/${queueId}/config`),
      });
      toast.success('Queue configuration copied. Create a new queue to use it.');
      navigate(`/queues/new?copyFrom=${queueId}`, { state: { copiedConfig: copiedQueueConfig } });
    } catch {
      toast.error('Failed to copy queue configuration.');
    }
  }

  if (isError) {
    return (
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Queues"
          subtitle="Recurring publishing schedules that auto-fill from a backlog of queued posts."
          actions={<CreateQueueButton />}
        />
        <div className="text-center py-12">
          <h2 className="text-lg font-semibold mb-2">Failed to load queues</h2>
          <p className="text-muted-foreground mb-4">Check your connection and try again.</p>
          <Button onClick={() => refetch()}>Try Again</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Queues"
        subtitle="Recurring publishing schedules that auto-fill from a backlog of queued posts."
        actions={<CreateQueueButton />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-[360px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search queues..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            aria-label="Search queues"
          />
        </div>
        <Segmented
          label="Queue status"
          value={(filters.status ?? 'all') as StatusFilter}
          onChange={(value) => setFilters(prev => ({ ...prev, status: value === 'all' ? undefined : value }))}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
          ]}
        />
      </div>

      {isLoading ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead style={{ width: 160 }}>Profile</TableHead>
                <TableHead style={{ width: 190 }}>Cadence</TableHead>
                <TableHead style={{ width: 80 }}>Posts</TableHead>
                <TableHead style={{ width: 120 }}>Status</TableHead>
                <TableHead style={{ width: 140 }}>Next Run</TableHead>
                <TableHead style={{ width: 48 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : filteredQueues.length === 0 ? (
        <Card padded>
          {hasActiveFilters ? (
            <EmptyState
              icon={Search}
              title="No matching queues"
              body="Try adjusting your search or status filter."
            />
          ) : (
            <EmptyState
              icon={ListOrdered}
              title="No queues yet"
              body="Create a recurring schedule and append posts whenever your backlog is ready."
              action={<CreateQueueButton />}
            />
          )}
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead style={{ width: 160 }}>Profile</TableHead>
                <TableHead style={{ width: 190 }}>Cadence</TableHead>
                <TableHead style={{ width: 80 }}>Posts</TableHead>
                <TableHead style={{ width: 120 }}>Status</TableHead>
                <TableHead style={{ width: 140 }}>Next Run</TableHead>
                <TableHead style={{ width: 48 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQueues.map((queue) => (
                <TableRow key={queue.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <NavLink
                      to={`/queues/${queue.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {queue.name}
                    </NavLink>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last run{' '}
                      {queue.lastPublishedAt
                        ? formatDistanceToNow(new Date(queue.lastPublishedAt), { addSuffix: true })
                        : 'never'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2">
                      <PlatformGlyph platform={normalizePlatform(queue.profile?.platform)} size={12} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{queue.profile?.displayName ?? '-'}</p>
                        <p className="truncate mono text-xs text-muted-foreground">
                          @{queue.profile?.handle ?? queue.profile?.displayName ?? 'profile'}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="mono text-xs font-semibold text-foreground">
                      {cadenceSummary(queue).primary}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{cadenceSummary(queue).secondary}</p>
                  </TableCell>
                  <TableCell>
                    <span className="mono text-sm tabular-nums">{queue.postCount}</span>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={queue.isPaused ? 'paused' : 'active'} />
                  </TableCell>
                  <TableCell>
                    <NextRunCell queue={queue} />
                  </TableCell>
                  <TableCell>
                    <QueueActionsMenu
                      queue={queue}
                      onDelete={() => handleDelete(queue.id)}
                      onCopyConfig={() => handleCopyConfig(queue.id)}
                      onTogglePause={() => handleTogglePause(queue)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </main>
  );
}

function CreateQueueButton() {
  return (
    <Button asChild>
      <Link to="/queues/new">
        <Plus className="mr-2 h-4 w-4" />
        New queue
      </Link>
    </Button>
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
        {formatNextRun(queue.nextRunAt)}
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground">-</span>;
}
