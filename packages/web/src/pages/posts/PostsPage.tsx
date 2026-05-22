import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  MoreVertical,
  Pause,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Tags,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DELETABLE_STATES,
  POST_STATUSES,
  type PostQueryInput,
  type PostStatus,
} from "@sms/shared";

import { BulkDeleteDialog } from "@/components/bulk/BulkDeleteDialog";
import { ConfirmDestructiveDialog } from "@/components/bulk/ConfirmDestructiveDialog";
import { ModifyTagsDialog } from "@/components/bulk/ModifyTagsDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Menu,
  MenuDivider,
  MenuItem,
  MenuSectionLabel,
} from "@/components/ui/menu";
import { NativeSelect } from "@/components/ui/native-select";
import {
  PlatformGlyph,
  type Platform,
} from "@/components/ui/platform-glyph";
import { Pill, StatusPill, type StatusPillStatus } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBulkDelete,
  useBulkExport,
  useBulkModifyTags,
  useBulkPause,
  useBulkResume,
} from "@/hooks/use-bulk-ops";
import { useAuth } from "@/hooks/use-auth";
import {
  useDeletePost,
  usePosts,
  usePostStatusCounts,
  type Post,
  type PostFilters,
} from "@/hooks/use-posts";
import { useProfiles, type SocialProfile } from "@/hooks/use-profiles";
import { useTags } from "@/hooks/use-tags";
import { apiClient } from "@/lib/api-client";
import { renderHeadline } from "@/lib/headline-to-mark";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | PostStatus;

const statusFilterLabels: Record<PostStatus, string> = {
  draft: "Drafts",
  scheduled: "Scheduled",
  queued: "Queued",
  paused: "Paused",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  auto_destructing: "Auto-destructing",
  destroyed: "Destroyed",
};

const statusOptions: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  ...POST_STATUSES.map((status) => ({
    value: status,
    label: statusFilterLabels[status],
  })),
];

function normalizePlatform(platform?: string | null): Platform {
  if (platform === "linkedin" || platform === "facebook") return platform;
  return "twitter";
}

function profileFor(
  post: Post,
  profiles: SocialProfile[] | undefined,
): SocialProfile | undefined {
  return profiles?.find((profile) => profile.id === post.profileId);
}

function statusForPill(status: string): StatusPillStatus {
  if (POST_STATUSES.includes(status as PostStatus)) return status as StatusPillStatus;
  return "queued";
}

function postTitle(post: Post): string {
  return post.headline || post.text || "Untitled post";
}

function formatWhen(post: Post): string {
  const scheduledAt = post.scheduledAt ? new Date(post.scheduledAt) : null;
  const publishedAt = post.publishedAt ? new Date(post.publishedAt) : null;
  const updatedAt = post.updatedAt ? new Date(post.updatedAt) : null;

  if (post.status === "queued") return "via queue";
  if (post.status === "published" && publishedAt) {
    return formatDistanceToNow(publishedAt, { addSuffix: true });
  }
  if (post.status === "failed" && updatedAt) {
    return formatDistanceToNow(updatedAt, { addSuffix: true });
  }
  if (scheduledAt) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (scheduledAt.toDateString() === tomorrow.toDateString()) {
      return `tomorrow ${format(scheduledAt, "h:mmaaa")}`;
    }
    return formatDistanceToNow(scheduledAt, { addSuffix: true });
  }
  return "not scheduled";
}

function readUserEntriesPerPage(userResult: unknown): number | undefined {
  const data = userResult as {
    data?: { entriesPerPage?: number };
    user?: { entriesPerPage?: number };
  };
  return data.data?.entriesPerPage ?? data.user?.entriesPerPage;
}

function ExpandedFailedRow({
  post,
  isRetrying,
  onRetry,
}: {
  post: Post;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <tr>
      <td colSpan={7} className="bg-[var(--bg-surface)] px-4 py-4">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              Full text
            </p>
            <p className="mt-1 text-sm text-foreground">{post.text}</p>
          </div>
          <div className="flex items-start justify-between gap-3 rounded-md border border-[var(--status-danger-soft)] bg-[var(--status-danger-soft)] p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--status-danger)]">
                <Icon icon={AlertCircle} size={14} />
                Failure reason
              </p>
              <p className="mt-1 text-sm text-[var(--status-danger)]">
                {post.failureReason || "No failure reason returned."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isRetrying}
              onClick={onRetry}
            >
              Retry now
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Publish history: No attempts logged yet. Last failure{" "}
            {formatWhen(post)}.
          </p>
        </div>
      </td>
    </tr>
  );
}

export default function PostsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authResult = useAuth();
  const { data: tags } = useTags();
  const { data: profiles } = useProfiles();
  const deletePostMutation = useDeletePost();
  const bulkDeleteMutation = useBulkDelete();
  const bulkExportMutation = useBulkExport();
  const bulkModifyTagsMutation = useBulkModifyTags();
  const bulkPauseMutation = useBulkPause();
  const bulkResumeMutation = useBulkResume();
  const [searchParams, setSearchParams] = useSearchParams();
  const entriesPerPage = readUserEntriesPerPage(authResult) ?? 25;
  const [filters, setFilters] = useState<PostFilters>({
    page: 1,
    limit: entriesPerPage,
    search: searchParams.get("search")?.trim() || undefined,
  });
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());
  const [retryingPostIds, setRetryingPostIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkModifyTagsOpen, setBulkModifyTagsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);
  const { data: postsResponse, isLoading, isError, refetch } = usePosts({
    ...filters,
    searchScope: filters.search ? "posts" : undefined,
  });
  const { data: countResponse } = usePostStatusCounts({
    profileId: filters.profileId,
    tagId: filters.tagId,
    search: filters.search,
    searchScope: filters.search ? "posts" : undefined,
  });
  const posts = postsResponse?.posts ?? [];
  const hasActiveFilters = !!(filters.status || filters.profileId || filters.tagId || filters.search);
  const counts = useMemo(() => {
    return statusOptions.reduce(
      (acc, option) => {
        const visibleCount =
          option.value === "all"
            ? Math.max(postsResponse?.total ?? 0, posts.length)
            : posts.filter((post) => post.status === option.value).length;
        const backgroundCount =
          option.value === "all"
            ? countResponse?.total ?? postsResponse?.total ?? posts.length
            : countResponse?.byStatus[option.value] ?? 0;
        acc[option.value] =
          hasActiveFilters ? Math.max(visibleCount, backgroundCount) : backgroundCount;
        return acc;
      },
      {} as Record<StatusFilter, number>,
    );
  }, [countResponse?.byStatus, countResponse?.total, posts, postsResponse?.total, hasActiveFilters]);
  const currentStatus = (filters.status as StatusFilter | undefined) ?? "all";
  const totalPages = postsResponse ? Math.ceil(postsResponse.total / postsResponse.limit) : 0;
  const pagePostIds = posts.map((post) => post.id);
  const selectedOnPage = pagePostIds.filter((id) => selectedPostIds.has(id));
  const allPageSelected = pagePostIds.length > 0 && selectedOnPage.length === pagePostIds.length;
  const selectedProfileId =
    filters.profileId ??
    posts.find((post) => selectedPostIds.has(post.id) && post.profileId)?.profileId ??
    profiles?.[0]?.id;

  useEffect(() => {
    if (entriesPerPage !== filters.limit) {
      setFilters((prev) => ({ ...prev, limit: entriesPerPage }));
    }
  }, [entriesPerPage, filters.limit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmedSearch = searchInput.trim();
      setFilters((prev) => ({ ...prev, search: trimmedSearch || undefined, page: 1 }));
      setSearchParams(trimmedSearch ? { search: trimmedSearch } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setSearchParams]);

  function updateStatus(status: StatusFilter) {
    setFilters((prev) => ({
      ...prev,
      status: status === "all" ? undefined : status,
      page: 1,
    }));
  }

  function togglePostSelection(postId: string, selected: boolean) {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(postId);
      else next.delete(postId);
      return next;
    });
  }

  function togglePageSelection(selected: boolean) {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      pagePostIds.forEach((id) => {
        if (selected) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }

  function toggleExpanded(postId: string) {
    setExpandedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedPostIds(new Set());
    setBulkDeleteOpen(false);
    setBulkModifyTagsOpen(false);
  }

  function selectorPayload(): { postIds?: string[]; filter?: Partial<PostQueryInput> } {
    const postIds = Array.from(selectedPostIds);
    if (postIds.length > 0) return { postIds };
    return {
      filter: {
        status: filters.status as PostQueryInput["status"],
        profileId: filters.profileId,
        tagId: filters.tagId,
        search: filters.search,
      },
    };
  }

  function handleRetry(postId: string) {
    if (retryingPostIds.has(postId)) return;
    setRetryingPostIds((prev) => new Set(prev).add(postId));
    apiClient
      .retryPost(postId)
      .then(() => {
        toast.success("Retrying post. Watch the status column for updates.");
        queryClient.invalidateQueries({ queryKey: ["posts"] });
      })
      .catch((retryError: Error) => {
        toast.error(`Couldn't retry post. ${retryError.message ?? ""}`.trim());
      })
      .finally(() => {
        setRetryingPostIds((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
      });
  }

  function handleDeletePost(postId: string, onSuccess?: () => void) {
    deletePostMutation.mutate(postId, {
      onSuccess: () => {
        setSelectedPostIds((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
        onSuccess?.();
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Failed to delete post");
      },
    });
  }

  function handleBulkDeleteConfirmed() {
    bulkDeleteMutation.mutate(
      {
        ...selectorPayload(),
        typedConfirmation: `DELETE ${selectedPostIds.size} POSTS`,
      },
      {
        onSuccess: () => {
          clearSelection();
          setBulkDeleteOpen(false);
        },
      },
    );
  }

  function handleBulkPublishing(action: "pause" | "resume") {
    if (!selectedProfileId) {
      toast.error("Select a profile before pausing or resuming posts.");
      return;
    }

    const payload = {
      ...selectorPayload(),
      profileId: selectedProfileId,
      scope: "scheduled-posts" as const,
    };

    if (action === "pause") {
      bulkPauseMutation.mutate(payload);
    } else {
      bulkResumeMutation.mutate(payload);
    }
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-foreground">
            Posts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One-off and queued posts across all profiles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/posts/import">
              <Download size={16} aria-hidden="true" />
              Import CSV
            </Link>
          </Button>
          <Button asChild variant="primary">
            <Link to="/posts/new">
              <Plus size={16} aria-hidden="true" />
              New post
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          label="Filter posts by status"
          value={currentStatus}
          options={statusOptions.map((option) => ({
            value: option.value,
            label: `${option.label} (${counts[option.value] ?? 0})`,
          }))}
          onChange={updateStatus}
          className="w-full overflow-x-auto lg:w-auto"
        />
        <div className="relative min-w-0 flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search posts"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search posts..."
            className="pl-9"
          />
        </div>
        <NativeSelect
          aria-label="Filter by profile"
          value={filters.profileId ?? "all"}
          onChange={(event) =>
            setFilters((prev) => ({
              ...prev,
              profileId: event.target.value === "all" ? undefined : event.target.value,
              page: 1,
            }))
          }
          className="lg:w-44"
        >
          <option value="all">All profiles</option>
          {profiles?.map((profile) => (
            <option key={profile.id} value={profile.id}>
              @{profile.handle}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by tag"
          value={filters.tagId ?? "all"}
          onChange={(event) =>
            setFilters((prev) => ({
              ...prev,
              tagId: event.target.value === "all" ? undefined : event.target.value,
              page: 1,
            }))
          }
          className="lg:w-36"
        >
          <option value="all">All tags</option>
          {tags?.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {selectedPostIds.size > 0 && (
        <div className="mt-3 flex flex-col gap-3 rounded-md border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-foreground">
              {selectedPostIds.size} selected
            </span>
            <button
              type="button"
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
              onClick={clearSelection}
            >
              Clear
            </button>
          </div>
          <Menu
            align="end"
            className="min-w-56"
            trigger={
              <Button type="button" variant="outline" size="sm">
                Bulk actions
                <ChevronDown size={14} aria-hidden="true" />
              </Button>
            }
          >
            <MenuSectionLabel>Publishing</MenuSectionLabel>
            <MenuItem
              icon={Pause}
              onSelect={() => handleBulkPublishing("pause")}
            >
              Pause publishing
            </MenuItem>
            <MenuItem
              icon={RotateCw}
              onSelect={() => handleBulkPublishing("resume")}
            >
              Resume publishing
            </MenuItem>
            <MenuDivider />
            <MenuSectionLabel>Edit</MenuSectionLabel>
            <MenuItem
              icon={Tags}
              onSelect={() => setBulkModifyTagsOpen(true)}
            >
              Modify tags...
            </MenuItem>
            <MenuItem icon={FileText} disabled>
              Reschedule...
            </MenuItem>
            <MenuDivider />
            <MenuSectionLabel>Export</MenuSectionLabel>
            <MenuItem
              icon={Download}
              onSelect={() =>
                bulkExportMutation.mutate({
                  path: "/api/posts.csv",
                  filename: "posts.csv",
                })
              }
            >
              Export as CSV
            </MenuItem>
            <MenuDivider />
            <MenuSectionLabel className="text-[var(--status-danger)]">
              Danger zone
            </MenuSectionLabel>
            <MenuItem
              icon={Trash2}
              danger
              onSelect={() => setBulkDeleteOpen(true)}
            >
              Delete {selectedPostIds.size} posts
            </MenuItem>
          </Menu>
        </div>
      )}

      <Card className="mt-3 overflow-hidden">
        {isError ? (
          <div className="p-10 text-center">
            <h2 className="text-sm font-semibold text-foreground">
              Failed to load posts
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              An error occurred while loading your posts.
            </p>
            <Button className="mt-4" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-12" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={FileText}
              title={hasActiveFilters ? "No matching posts" : "No posts here yet"}
              body={
                hasActiveFilters
                  ? "Try adjusting your filters or search query."
                  : "Create a post, save a draft, or import a CSV to populate this table."
              }
              action={
                !hasActiveFilters && (
                  <Button asChild variant="primary">
                    <Link to="/posts/new">New post</Link>
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="border-b border-border bg-[var(--bg-elevated)] text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <Checkbox
                      aria-label="Select all posts on this page"
                      checked={allPageSelected}
                      onCheckedChange={(value) => togglePageSelection(Boolean(value))}
                    />
                  </th>
                  <th className="w-7 px-1 py-2" />
                  <th className="px-3 py-2">Post</th>
                  <th className="w-[180px] px-3 py-2">Profile</th>
                  <th className="w-[110px] px-3 py-2">Status</th>
                  <th className="w-[140px] px-3 py-2">When</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {posts.map((post) => {
                  const isSelected = selectedPostIds.has(post.id);
                  const isExpanded = expandedPostIds.has(post.id);
                  const profile = profileFor(post, profiles);
                  const platform = normalizePlatform(profile?.platform);
                  const isFailed = post.status === "failed";
                  const isDeletable = DELETABLE_STATES.includes(post.status as PostStatus);

                  return (
                    <Fragment key={post.id}>
                      <tr
                        className={cn(
                          "transition-colors hover:bg-[var(--bg-hover)]",
                          isSelected && "bg-[var(--brand-primary-soft)]",
                        )}
                      >
                        <td className="px-3 py-3 align-top">
                          <Checkbox
                            aria-label={`Select post ${post.id}`}
                            checked={isSelected}
                            onCheckedChange={(value) =>
                              togglePostSelection(post.id, Boolean(value))
                            }
                          />
                        </td>
                        <td className="px-1 py-3 align-top">
                          {isFailed && (
                            <IconButton
                              icon={isExpanded ? ChevronDown : ChevronRight}
                              label={isExpanded ? "Collapse failed post" : "Expand failed post"}
                              onClick={() => toggleExpanded(post.id)}
                              className="h-6 w-6"
                            />
                          )}
                        </td>
                        <td className="min-w-0 px-3 py-3 align-top">
                          <Link
                            to={`/posts/${post.id}/edit`}
                            className="block min-w-0 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {isFailed && (
                                <Icon
                                  icon={AlertCircle}
                                  size={14}
                                  className="text-[var(--status-danger)]"
                                />
                              )}
                              <span className="truncate font-medium text-foreground">
                                {post.headline
                                  ? renderHeadline(post.headline)
                                  : postTitle(post)}
                              </span>
                            </span>
                            {post.tags.length > 0 && (
                              <span className="mt-1 flex flex-wrap gap-1">
                                {post.tags.slice(0, 4).map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="mono rounded-sm bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                  >
                                    #{tag.name}
                                  </span>
                                ))}
                              </span>
                            )}
                          </Link>
                        </td>
                        <td className="px-3 py-3 align-top">
                          {profile || post.profile ? (
                            <div className="flex items-start gap-2">
                              <PlatformGlyph platform={platform} size={14} />
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-foreground">
                                  {profile?.displayName ?? post.profile?.displayName}
                                </p>
                                <p className="mono truncate text-[11px] text-muted-foreground">
                                  @{profile?.handle ?? post.profile?.handle}
                                </p>
                                {profile?.tokenStatus && profile.tokenStatus !== "active" && (
                                  <Pill tone="neutral" className="mt-1">
                                    deprecated
                                  </Pill>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No profile</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <StatusPill status={statusForPill(post.status)} />
                        </td>
                        <td className="px-3 py-3 align-top text-xs text-muted-foreground">
                          {formatWhen(post)}
                        </td>
                        <td className="px-2 py-3 align-top">
                          <Menu
                            trigger={
                              <IconButton
                                icon={MoreVertical}
                                label="Post actions"
                                className="h-7 w-7"
                              />
                            }
                          >
                            <MenuItem
                              icon={Pencil}
                              onSelect={() => navigate(`/posts/${post.id}/edit`)}
                            >
                              Edit post
                            </MenuItem>
                            {isFailed && (
                              <MenuItem
                                icon={RotateCw}
                                onSelect={() => handleRetry(post.id)}
                              >
                                Retry now
                              </MenuItem>
                            )}
                            <MenuDivider />
                            <MenuItem
                              icon={Trash2}
                              danger
                              disabled={!isDeletable}
                              onSelect={() => setDeleteTarget(post)}
                            >
                              {isDeletable ? "Delete" : "Delete unavailable"}
                            </MenuItem>
                          </Menu>
                        </td>
                      </tr>
                      {isFailed && isExpanded && (
                        <ExpandedFailedRow
                          key={`${post.id}-expanded`}
                          post={post}
                          isRetrying={retryingPostIds.has(post.id)}
                          onRetry={() => handleRetry(post.id)}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {postsResponse?.page ?? 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page === 1}
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }))
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(filters.page ?? 1) >= totalPages}
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))
              }
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        selectionCount={selectedPostIds.size}
        onConfirm={handleBulkDeleteConfirmed}
        isPending={bulkDeleteMutation.isPending}
      />
      <ModifyTagsDialog
        open={bulkModifyTagsOpen}
        onOpenChange={setBulkModifyTagsOpen}
        selectionCount={selectedPostIds.size}
        tags={tags ?? []}
        onManageTags={() => navigate("/settings")}
        onConfirm={({ mode, tagIds }) => {
          bulkModifyTagsMutation.mutate(
            {
              ...selectorPayload(),
              mode,
              tagIds,
            },
            { onSuccess: clearSelection },
          );
        }}
        isPending={bulkModifyTagsMutation.isPending}
      />
      <ConfirmDestructiveDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (!deleteTarget) return;
          handleDeletePost(deleteTarget.id, () => setDeleteTarget(null));
        }}
        title="Delete post?"
        description={`This permanently deletes "${deleteTarget ? postTitle(deleteTarget) : "this post"}" from the scheduler. Already-published posts on social platforms are NOT affected.`}
        confirmLabel="Delete Post"
        dismissLabel="Keep Post"
        confirmationPhrase="DELETE POST"
        isPending={deletePostMutation.isPending}
      />
    </main>
  );
}
