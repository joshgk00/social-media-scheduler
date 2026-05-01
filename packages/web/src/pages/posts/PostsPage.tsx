import { useState, useEffect, useMemo, Fragment } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type Row,
  type RowSelectionState,
} from '@tanstack/react-table';
import { formatDistanceToNow, format } from 'date-fns';
import { Plus, ChevronDown, ChevronRight, Search, AlertCircle, Image, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { POST_STATUSES, DELETABLE_STATES, type PostQueryInput, type PostStatus } from '@sms/shared';

import { usePosts, useDeletePost, type Post, type PostFilters } from '../../hooks/use-posts';
import { useTags } from '../../hooks/use-tags';
import { useProfiles } from '../../hooks/use-profiles';
import { useAuth } from '../../hooks/use-auth';
import { apiClient } from '../../lib/api-client';
import { PostStatusBadge } from '../../components/posts/PostStatusBadge';
import { PostActionsMenu } from '../../components/posts/PostActionsMenu';
import { PostErrorCell } from '../../components/posts/PostErrorCell';
import { PollingIndicator } from '../../components/posts/PollingIndicator';
import { PostHistoryDialog } from '../../components/posts/PostHistoryDialog';
import { PostFullTextDialog } from '../../components/posts/PostFullTextDialog';
import { BulkActionsDropdown } from '../../components/bulk/BulkActionsDropdown';
import { BulkDeleteDialog } from '../../components/bulk/BulkDeleteDialog';
import { BulkPauseResumeDialog } from '../../components/bulk/BulkPauseResumeDialog';
import { ModifyTagsDialog } from '../../components/bulk/ModifyTagsDialog';
import { SelectionSummaryBar } from '../../components/bulk/SelectionSummaryBar';
import {
  useBulkDelete,
  useBulkExport,
  useBulkModifyTags,
  useBulkPause,
  useBulkResume,
} from '../../hooks/use-bulk-ops';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

function ExpandedPostRow({ post }: { post: Post }) {
  return (
    <div className="px-4 py-3 space-y-3 bg-muted/30">
      <div>
        <span className="text-sm font-semibold">Full Text</span>
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{post.text}</p>
      </div>
      {post.notes && (
        <div>
          <span className="text-sm font-semibold">Notes</span>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{post.notes}</p>
        </div>
      )}
      {post.status === 'failed' && post.failureReason && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 border border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <span className="text-sm font-semibold text-destructive">Failure Reason</span>
            <p className="text-sm text-destructive/80">{post.failureReason}</p>
          </div>
        </div>
      )}
      <div>
        <span className="text-sm font-semibold">Publish History</span>
        {post.publishedAt ? (
          <p className="text-sm text-muted-foreground">
            Published {format(new Date(post.publishedAt), 'PPp')}
            {post.platformPostId && ` (ID: ${post.platformPostId})`}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No publish history yet</p>
        )}
      </div>
    </div>
  );
}

export default function PostsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useAuth();
  const { data: tags } = useTags();
  const { data: profiles } = useProfiles();
  const deletePostMutation = useDeletePost();
  const bulkDeleteMutation = useBulkDelete();
  const bulkExportMutation = useBulkExport();
  const bulkModifyTagsMutation = useBulkModifyTags();
  const bulkPauseMutation = useBulkPause();
  const bulkResumeMutation = useBulkResume();

  const [filters, setFilters] = useState<PostFilters>({
    page: 1,
    limit: user?.entriesPerPage ?? 25,
  });
  const [searchInput, setSearchInput] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [historyPostId, setHistoryPostId] = useState<string | null>(null);
  const [fullTextPost, setFullTextPost] = useState<{ text: string; isThread: boolean } | null>(null);
  const [retryingPostIds, setRetryingPostIds] = useState<Set<string>>(new Set());
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkModifyTagsOpen, setBulkModifyTagsOpen] = useState(false);
  const [bulkPauseResumeMode, setBulkPauseResumeMode] = useState<'pause' | 'resume' | null>(null);

  function handleRetry(postId: string) {
    if (retryingPostIds.has(postId)) return;
    setRetryingPostIds(prev => new Set(prev).add(postId));
    apiClient
      .retryPost(postId)
      .then(() => {
        toast.success('Retrying post. Watch the status column for updates.');
        queryClient.invalidateQueries({ queryKey: ['posts'] });
      })
      .catch((retryError: Error) => {
        toast.error(`Couldn't retry post. ${retryError.message ?? ''}`.trim());
      })
      .finally(() => {
        setRetryingPostIds(prev => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
      });
  }

  useEffect(() => {
    if (user?.entriesPerPage && user.entriesPerPage !== filters.limit) {
      setFilters(prev => ({ ...prev, limit: user.entriesPerPage }));
    }
  }, [user?.entriesPerPage]); // eslint-disable-line react-hooks/exhaustive-deps -- only sync when entriesPerPage changes

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput || undefined, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: postsResponse, isLoading, isError, refetch, dataUpdatedAt } = usePosts(filters);

  const hasActiveFilters = !!(filters.status || filters.profileId || filters.tagId || filters.search);
  const totalPages = postsResponse ? Math.ceil(postsResponse.total / postsResponse.limit) : 0;

  if (isError) {
    return (
      <main className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Posts</h1>
          <Button asChild>
            <Link to="/posts/new">
              <Plus className="mr-2 h-4 w-4" />
              New Post
            </Link>
          </Button>
        </div>
        <div className="text-center py-12">
          <h2 className="text-lg font-semibold mb-2">Failed to load posts</h2>
          <p className="text-muted-foreground mb-4">An error occurred while loading your posts.</p>
          <Button onClick={() => refetch()}>Try Again</Button>
        </div>
      </main>
    );
  }

  function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    deletePostMutation.mutate(deleteTargetId, {
      onSuccess: () => {
        setIsDeleteDialogOpen(false);
        setDeleteTargetId(null);
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to delete post');
      },
    });
  }

  const columns = useMemo<ColumnDef<Post>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all posts on this page"
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() ? 'indeterminate' : false)}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select post ${row.original.id}`}
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        />
      ),
      size: 44,
    },
    {
      id: 'expander',
      header: () => null,
      cell: ({ row }: { row: Row<Post> }) => (
        <button
          onClick={row.getToggleExpandedHandler()}
          className="p-1 rounded hover:bg-muted"
          aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
        >
          {row.getIsExpanded() ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      ),
      size: 40,
    },
    {
      accessorKey: 'text',
      header: 'Text',
      cell: ({ row }: { row: Row<Post> }) => {
        const textPreview = row.original.text.length > 80
          ? `${row.original.text.slice(0, 80)}...`
          : row.original.text;
        const mediaCount = (row.original as Post & { mediaCount?: number }).mediaCount ?? 0;
        const hasTranscodingMedia = (row.original as Post & { hasTranscodingMedia?: boolean }).hasTranscodingMedia ?? false;
        return (
          <div>
            <span className="text-sm line-clamp-2">{textPreview}</span>
            {mediaCount > 0 && (
              <span className="inline-flex items-center gap-1 mt-1 text-xs text-muted-foreground" title={hasTranscodingMedia ? `${mediaCount} file(s), transcoding in progress` : `${mediaCount} file(s)`}>
                {hasTranscodingMedia ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-label="Media transcoding in progress" />
                ) : (
                  <Image className="h-3.5 w-3.5" />
                )}
                {mediaCount}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'profile',
      header: 'Profile',
      cell: ({ row }: { row: Row<Post> }) => {
        const profile = row.original.profile;
        if (!profile) return <span className="text-sm text-muted-foreground">-</span>;
        return (
          <span className="text-sm">@{profile.handle}</span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: { row: Row<Post> }) => (
        <PostStatusBadge status={row.original.status as PostStatus} />
      ),
    },
    {
      accessorKey: 'scheduledAt',
      header: 'Scheduled',
      cell: ({ row }: { row: Row<Post> }) => {
        const scheduledAt = row.original.scheduledAt;
        if (!scheduledAt) return <span className="text-sm text-muted-foreground">-</span>;
        const scheduledDate = new Date(scheduledAt);
        return (
          <div className="text-sm" title={format(scheduledDate, 'PPpp')}>
            {formatDistanceToNow(scheduledDate, { addSuffix: true })}
          </div>
        );
      },
    },
    {
      accessorKey: 'tags',
      header: 'Tags',
      cell: ({ row }: { row: Row<Post> }) => {
        const postTags = row.original.tags;
        if (!postTags?.length) return null;
        return (
          <div className="flex gap-1 flex-wrap">
            {postTags.map(tag => (
              <Badge
                key={tag.id}
                variant="outline"
                className="text-xs"
                style={{ borderColor: tag.color, color: tag.color }}
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: 'error',
      header: 'Error',
      cell: ({ row }: { row: Row<Post> }) => (
        <PostErrorCell failureReason={row.original.failureReason} />
      ),
    },
    {
      id: 'actions',
      header: () => null,
      cell: ({ row }: { row: Row<Post> }) => (
        <PostActionsMenu
          post={row.original}
          onEdit={() => navigate(`/posts/${row.original.id}/edit`)}
          onDelete={() => {
            if (DELETABLE_STATES.includes(row.original.status as PostStatus)) {
              setDeleteTargetId(row.original.id);
              setIsDeleteDialogOpen(true);
            }
          }}
          onRetry={() => handleRetry(row.original.id)}
          onViewHistory={() => setHistoryPostId(row.original.id)}
          onViewFullText={() =>
            setFullTextPost({ text: row.original.text, isThread: row.original.isThread })
          }
        />
      ),
      size: 50,
    },
  ], [navigate]); // eslint-disable-line react-hooks/exhaustive-deps -- state setters and handleRetry are stable via closure

  const table = useReactTable({
    data: postsResponse?.posts ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowId: (post) => post.id,
    getRowCanExpand: () => true,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
    manualPagination: true,
    pageCount: totalPages,
  });

  const selectedCount = Object.keys(rowSelection).length;
  const selectedPostIds = Object.keys(rowSelection);
  const selectedPosts = postsResponse?.posts.filter((post) => selectedPostIds.includes(post.id)) ?? [];
  const selectedProfileId = filters.profileId ?? selectedPosts.find((post) => post.profileId)?.profileId ?? profiles?.[0]?.id;

  function clearBulkSelection() {
    setRowSelection({});
    setBulkDeleteOpen(false);
    setBulkModifyTagsOpen(false);
    setBulkPauseResumeMode(null);
  }

  function getPostSelectorPayload(): { postIds?: string[]; filter?: Partial<PostQueryInput> } {
    if (selectedPostIds.length > 0) return { postIds: selectedPostIds };

    return {
      filter: {
        status: filters.status as PostQueryInput['status'],
        profileId: filters.profileId,
        tagId: filters.tagId,
        search: filters.search,
      },
    };
  }

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Posts</h1>
        <Button asChild>
          <Link to="/posts/new">
            <Plus className="mr-2 h-4 w-4" />
            New Post
          </Link>
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filters.status ?? 'all'}
          onValueChange={(value) =>
            setFilters(prev => ({ ...prev, status: value === 'all' ? undefined : value, page: 1 }))
          }
        >
          <SelectTrigger className="w-[150px]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {POST_STATUSES.map(status => (
              <SelectItem key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.profileId ?? 'all'}
          onValueChange={(value) =>
            setFilters(prev => ({ ...prev, profileId: value === 'all' ? undefined : value, page: 1 }))
          }
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter by profile">
            <SelectValue placeholder="Profile" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Profiles</SelectItem>
            {profiles?.map(profile => (
              <SelectItem key={profile.id} value={profile.id}>
                @{profile.handle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.tagId ?? 'all'}
          onValueChange={(value) =>
            setFilters(prev => ({ ...prev, tagId: value === 'all' ? undefined : value, page: 1 }))
          }
        >
          <SelectTrigger className="w-[150px]" aria-label="Filter by tag">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {tags?.map(tag => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search posts..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            aria-label="Search posts"
          />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <BulkActionsDropdown
            view="posts"
            selectionCount={selectedCount}
            onPause={() => setBulkPauseResumeMode('pause')}
            onResume={() => setBulkPauseResumeMode('resume')}
            onDelete={() => setBulkDeleteOpen(true)}
            onModifyTags={() => setBulkModifyTagsOpen(true)}
            onExport={() => bulkExportMutation.mutate({ path: '/api/posts.csv', filename: 'posts.csv' })}
          />
          <PollingIndicator dataUpdatedAt={dataUpdatedAt} />
        </div>
      </div>

      {/* Data table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading posts...</p>
        </div>
      ) : postsResponse?.posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {hasActiveFilters ? (
            <>
              <h2 className="text-lg font-medium mb-1">No matching posts</h2>
              <p className="text-sm text-muted-foreground">
                Try adjusting your filters or search query.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-medium mb-1">No posts yet</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first tweet to get started. Posts can be scheduled or saved as drafts.
              </p>
              <Button asChild>
                <Link to="/posts/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Post
                </Link>
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <SelectionSummaryBar
            pageCount={selectedCount}
            totalCount={postsResponse?.total}
            filterActive={hasActiveFilters}
            onSelectAllMatching={() => setRowSelection(Object.fromEntries((postsResponse?.posts ?? []).map((post) => [post.id, true])))}
            onClearSelection={() => setRowSelection({})}
          />
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map(headerGroup => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <TableHead key={header.id} style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map(row => (
                  <Fragment key={row.id}>
                    <TableRow>
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {row.getIsExpanded() && (
                      <TableRow key={`${row.id}-expanded`}>
                        <TableCell colSpan={columns.length} className="p-0">
                          <ExpandedPostRow post={row.original} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {postsResponse?.page ?? 1} of {totalPages}
                {postsResponse && ` (${postsResponse.total} posts)`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page === 1}
                  onClick={() => setFilters(prev => ({ ...prev, page: (prev.page ?? 1) - 1 }))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(filters.page ?? 1) >= totalPages}
                  onClick={() => setFilters(prev => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <PostHistoryDialog
        postId={historyPostId}
        onOpenChange={(isOpen) => !isOpen && setHistoryPostId(null)}
      />

      <PostFullTextDialog
        post={fullTextPost}
        onOpenChange={(isOpen) => !isOpen && setFullTextPost(null)}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        selectionCount={selectedCount}
        isPending={bulkDeleteMutation.isPending}
        onConfirm={() => {
          bulkDeleteMutation.mutate(
            {
              ...getPostSelectorPayload(),
              typedConfirmation: `DELETE ${selectedCount} POSTS`,
            },
            { onSuccess: clearBulkSelection },
          );
        }}
      />

      <BulkPauseResumeDialog
        open={bulkPauseResumeMode !== null}
        onOpenChange={(isOpen) => !isOpen && setBulkPauseResumeMode(null)}
        mode={bulkPauseResumeMode ?? 'pause'}
        selectionCount={selectedCount}
        isPending={bulkPauseMutation.isPending || bulkResumeMutation.isPending}
        onConfirm={({ scope }) => {
          if (!selectedProfileId) {
            toast.error('Select a profile before pausing or resuming posts.');
            return;
          }

          const mutation = bulkPauseResumeMode === 'resume' ? bulkResumeMutation : bulkPauseMutation;
          mutation.mutate(
            {
              profileId: selectedProfileId,
              scope,
              ...getPostSelectorPayload(),
            },
            { onSuccess: clearBulkSelection },
          );
        }}
      />

      <ModifyTagsDialog
        open={bulkModifyTagsOpen}
        onOpenChange={setBulkModifyTagsOpen}
        selectionCount={selectedCount}
        tags={tags ?? []}
        onManageTags={() => navigate('/settings')}
        isPending={bulkModifyTagsMutation.isPending}
        onConfirm={({ mode, tagIds }) => {
          bulkModifyTagsMutation.mutate(
            {
              ...getPostSelectorPayload(),
              mode,
              tagIds,
            },
            { onSuccess: clearBulkSelection },
          );
        }}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete post?</DialogTitle>
            <DialogDescription>
              This post will be permanently deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deletePostMutation.isPending}
            >
              {deletePostMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
