import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { formatDistanceToNow, format } from 'date-fns';
import { Plus, ListOrdered, Search } from 'lucide-react';

import { useQueue, useQueues } from '../../hooks/use-queues';
import {
  useQueuePosts,
  useMovePostUp,
  useMovePostDown,
  useRemoveFromQueue,
  type QueuePost,
} from '../../hooks/use-queue-posts';
import { PostStatusBadge } from '../../components/posts/PostStatusBadge';
import { PostHistoryDialog } from '../../components/posts/PostHistoryDialog';
import { PostFullTextDialog } from '../../components/posts/PostFullTextDialog';
import { QueuePostActionsMenu } from '../../components/queues/QueuePostActionsMenu';
import { QueueStatusBadge } from '../../components/queues/QueueStatusBadge';
import { SpinnableVariantsDialog } from '../../components/queues/SpinnableVariantsDialog';
import { BulkActionsDropdown } from '../../components/bulk/BulkActionsDropdown';
import { CopyQueueDialog } from '../../components/bulk/CopyQueueDialog';
import { ModifyTextDialog } from '../../components/bulk/ModifyTextDialog';
import { PurgeQueueDialog } from '../../components/bulk/PurgeQueueDialog';
import { RandomizeQueueDialog } from '../../components/bulk/RandomizeQueueDialog';
import { RemoveDuplicatesDialog } from '../../components/bulk/RemoveDuplicatesDialog';
import {
  useBulkExport,
  useQueueCopy,
  useQueueDedupe,
  useQueueModifyText,
  useQueuePurge,
  useQueueRandomize,
} from '../../hooks/use-bulk-ops';
import type { PostStatus } from '@sms/shared';

import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { Input } from '../../components/ui/input';

import { cn } from '../../lib/utils';
import { renderHeadline } from '../../lib/headline-to-mark';

export default function QueuePostsPage() {
  const { id: queueId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: queue, isLoading: isQueueLoading } = useQueue(queueId ?? '');
  const { data: queues } = useQueues();
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const {
    data: queuePosts,
    isLoading: isPostsLoading,
    isError,
  } = useQueuePosts(queueId ?? '', {
    search: searchInput.trim() || undefined,
    searchScope: 'queue',
  });

  const moveUpMutation = useMovePostUp(queueId ?? '');
  const moveDownMutation = useMovePostDown(queueId ?? '');
  const removeMutation = useRemoveFromQueue(queueId ?? '');
  const bulkExportMutation = useBulkExport();
  const queueCopyMutation = useQueueCopy(queueId ?? '');
  const queueDedupeMutation = useQueueDedupe(queueId ?? '');
  const queueModifyTextMutation = useQueueModifyText(queueId ?? '');
  const queuePurgeMutation = useQueuePurge(queueId ?? '');
  const queueRandomizeMutation = useQueueRandomize(queueId ?? '');

  const [historyPostId, setHistoryPostId] = useState<string | null>(null);
  const [fullTextPost, setFullTextPost] = useState<{
    text: string;
    isThread: boolean;
  } | null>(null);
  const [variantsPost, setVariantsPost] = useState<{
    text: string;
  } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [dedupeOpen, setDedupeOpen] = useState(false);
  const [modifyTextOpen, setModifyTextOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [randomizeOpen, setRandomizeOpen] = useState(false);

  const isLoading = isQueueLoading || isPostsLoading;
  const cursorPosition = queue?.cursorPosition ?? 0;
  const isRecycling = queue?.isRecycling ?? false;
  const totalPosts = queuePosts?.length ?? 0;
  const sameProfileTargetQueues = (queues ?? [])
    .filter((targetQueue) => targetQueue.profileId === queue?.profileId && targetQueue.id !== queueId)
    .map((targetQueue) => ({ id: targetQueue.id, name: targetQueue.name }));

  function closeQueueBulkDialogs() {
    setCopyOpen(false);
    setDedupeOpen(false);
    setModifyTextOpen(false);
    setPurgeOpen(false);
    setRandomizeOpen(false);
  }

  function getRowClassName(post: QueuePost): string {
    const isPublishing = post.status === 'publishing';
    const isPublished = post.status === 'published';
    const isCursor = post.queuePosition === cursorPosition;

    return cn(
      'transition-colors hover:bg-muted/50',
      isCursor && 'border-l-2 border-primary',
      isPublished && !isRecycling && 'opacity-60',
      isPublishing && 'opacity-75',
    );
  }

  function isReorderDisabled(post: QueuePost): boolean {
    if (post.status === 'publishing') return true;
    if (post.status === 'published' && !isRecycling) return true;
    if (post.status !== 'queued') return true;
    return false;
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmedSearch = searchInput.trim();
      setSearchParams(trimmedSearch ? { search: trimmedSearch } : {}, { replace: true });
    }, 250);

    return () => clearTimeout(timer);
  }, [searchInput, setSearchParams]);

  if (isError) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Queue Posts</h1>
        <div className="text-center py-12">
          <h2 className="text-lg font-semibold mb-2">Failed to load posts</h2>
          <p className="text-muted-foreground">
            Check your connection and try again.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {isQueueLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              `${queue?.name ?? 'Queue'} -- Posts`
            )}
          </h1>
          {queue && (
            <QueueStatusBadge
              isPaused={queue.isPaused}
              postCount={totalPosts}
              seasonalStart={queue.seasonalStart}
              seasonalEnd={queue.seasonalEnd}
            />
          )}
        </div>
        <Button asChild>
          <Link to={`/posts/new?queueId=${queueId}`}>
            <Plus className="mr-2 h-4 w-4" />
            Add Post
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search posts..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="pl-9"
            aria-label="Search posts"
          />
        </div>
        <div className="flex justify-end">
          <BulkActionsDropdown
            view="queue"
            selectionCount={totalPosts}
            onRandomize={() => setRandomizeOpen(true)}
            onPurge={() => setPurgeOpen(true)}
            onCopy={() => setCopyOpen(true)}
            onModifyText={() => setModifyTextOpen(true)}
            onDedupe={() => setDedupeOpen(true)}
            onExport={() => bulkExportMutation.mutate({ path: `/api/queues/${queueId}/posts.csv`, filename: 'queue-posts.csv' })}
          />
        </div>
      </div>

      {/* Queue metadata */}
      {queue && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {queue.nextRunAt && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    Next run:{' '}
                    {formatDistanceToNow(new Date(queue.nextRunAt), {
                      addSuffix: true,
                    })}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <span>{format(new Date(queue.nextRunAt), 'PPpp')}</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}

      {/* Posts table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : totalPosts === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ListOrdered className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-1">
            No posts in this queue
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Add posts to start publishing on schedule.
          </p>
          <Button asChild>
            <Link to={`/posts/new?queueId=${queueId}`}>
              <Plus className="mr-2 h-4 w-4" />
              Add Post
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: 60 }}>Position</TableHead>
                <TableHead style={{ width: 80 }}>Reorder</TableHead>
                <TableHead>Text</TableHead>
                <TableHead style={{ width: 100 }}>Status</TableHead>
                <TableHead style={{ width: 60 }}>Spin</TableHead>
                <TableHead style={{ width: 100 }}>Auto-Destruct</TableHead>
                <TableHead style={{ width: 48 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {queuePosts?.map((post, index) => {
                const position = post.queuePosition ?? 0;
                const isCursor = position === cursorPosition;
                const isDisabled = isReorderDisabled(post);
                const isFirst = index === 0;
                const isLast = index === (queuePosts.length - 1);

                return (
                  <TableRow key={post.id} className={getRowClassName(post)}>
                    <TableCell>
                      <div
                        className="flex items-center gap-1"
                        aria-label={
                          isCursor
                            ? `Position ${position} (next to publish)`
                            : `Position ${position}`
                        }
                      >
                        <span className="text-sm font-medium">{position}</span>
                        {isCursor && (
                          <span className="text-xs text-primary font-semibold">
                            Next
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={isDisabled || isFirst}
                          onClick={() => moveUpMutation.mutate(post.id)}
                          aria-label={`Move post to position ${position - 1}`}
                          aria-disabled={isDisabled || isFirst}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="m18 15-6-6-6 6" />
                          </svg>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={isDisabled || isLast}
                          onClick={() => moveDownMutation.mutate(post.id)}
                          aria-label={`Move post to position ${position + 1}`}
                          aria-disabled={isDisabled || isLast}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm line-clamp-2">
                        {post.headline ? renderHeadline(post.headline) : post.text}
                      </span>
                    </TableCell>
                    <TableCell>
                      <PostStatusBadge
                        status={post.status as PostStatus}
                      />
                    </TableCell>
                    <TableCell>
                      {post.hasSpinnableText && (
                        <Badge variant="outline" className="text-xs">
                          Spin
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {post.autoDestructAfter ?? '--'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <QueuePostActionsMenu
                        post={post}
                        queueId={queueId ?? ''}
                        isRecycling={isRecycling}
                        cursorPosition={cursorPosition}
                        isFirst={isFirst}
                        isLast={isLast}
                        onMoveUp={() => moveUpMutation.mutate(post.id)}
                        onMoveDown={() => moveDownMutation.mutate(post.id)}
                        onDelete={() => removeMutation.mutate(post.id)}
                        onViewVariants={() =>
                          setVariantsPost({ text: post.text })
                        }
                        onViewHistory={() => setHistoryPostId(post.id)}
                        onViewFullText={() =>
                          setFullTextPost({
                            text: post.text,
                            isThread: false,
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PostHistoryDialog
        postId={historyPostId}
        onOpenChange={(isOpen) => !isOpen && setHistoryPostId(null)}
      />

      <PostFullTextDialog
        post={fullTextPost}
        onOpenChange={(isOpen) => !isOpen && setFullTextPost(null)}
      />

      {variantsPost && (
        <SpinnableVariantsDialog
          postText={variantsPost.text}
          open={!!variantsPost}
          onOpenChange={(isOpen) => !isOpen && setVariantsPost(null)}
        />
      )}

      <RandomizeQueueDialog
        open={randomizeOpen}
        onOpenChange={setRandomizeOpen}
        queueName={queue?.name ?? 'Queue'}
        postCount={totalPosts}
        isPending={queueRandomizeMutation.isPending}
        onConfirm={() => queueRandomizeMutation.mutate(undefined, { onSuccess: closeQueueBulkDialogs })}
      />

      <PurgeQueueDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        queueName={queue?.name ?? 'Queue'}
        postCount={totalPosts}
        isPending={queuePurgeMutation.isPending}
        onConfirm={() =>
          queuePurgeMutation.mutate(
            { typedConfirmation: queue?.name ?? 'Queue' },
            { onSuccess: closeQueueBulkDialogs },
          )
        }
      />

      <CopyQueueDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        sourceQueueName={queue?.name ?? 'Queue'}
        postCount={totalPosts}
        queues={sameProfileTargetQueues}
        isPending={queueCopyMutation.isPending}
        onConfirm={(input) => queueCopyMutation.mutate(input, { onSuccess: closeQueueBulkDialogs })}
      />

      <ModifyTextDialog
        open={modifyTextOpen}
        onOpenChange={setModifyTextOpen}
        queueName={queue?.name ?? 'Queue'}
        postCount={totalPosts}
        isPending={queueModifyTextMutation.isPending}
        onConfirm={(input) => queueModifyTextMutation.mutate(input, { onSuccess: closeQueueBulkDialogs })}
      />

      <RemoveDuplicatesDialog
        open={dedupeOpen}
        onOpenChange={setDedupeOpen}
        queueName={queue?.name ?? 'Queue'}
        isPending={queueDedupeMutation.isPending}
        onConfirm={() => queueDedupeMutation.mutate(undefined, { onSuccess: closeQueueBulkDialogs })}
      />
    </main>
  );
}
