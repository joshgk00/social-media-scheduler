import { Link, useParams } from "react-router";
import { format } from "date-fns";
import { Edit3, ListOrdered, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformGlyph, type Platform } from "@/components/ui/platform-glyph";
import { StatusPill, type StatusPillStatus } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueue } from "@/hooks/use-queues";
import { useQueuePosts } from "@/hooks/use-queue-posts";
import { useProfiles } from "@/hooks/use-profiles";
import { cadenceSummary, formatNextRun } from "@/lib/queue-schedule";

function normalizePlatform(platform?: string | null): Platform {
  if (platform === "linkedin" || platform === "facebook") return platform;
  return "twitter";
}

function postStatus(status: string): StatusPillStatus {
  if (["scheduled", "queued", "draft", "published", "failed"].includes(status)) {
    return status as StatusPillStatus;
  }
  return "queued";
}

export default function QueueOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: queue, isLoading } = useQueue(id ?? "");
  const { data: posts, isLoading: postsLoading } = useQueuePosts(
    id ?? "",
    { limit: 4 },
    { refetchInterval: false },
  );
  const { data: profiles } = useProfiles();
  const profile = profiles?.find((item) => item.id === queue?.profileId);
  const queueForSummary = queue ? { ...queue, postCount: queue.postCount ?? 0 } : null;
  const cadence = queueForSummary ? cadenceSummary(queueForSummary) : null;
  const previewPosts = posts ?? [];

  if (isLoading) {
    return (
      <main className="space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24" />)}
        </div>
        <Skeleton className="h-32" />
      </main>
    );
  }

  if (!queue || !queueForSummary) {
    return (
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <EmptyState icon={ListOrdered} title="Queue not found" body="This queue may have been deleted." />
      </main>
    );
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        breadcrumb="Queues / Detail"
        title={queue.name}
        actions={
          <>
            <StatusPill status={queue.isPaused ? "paused" : "active"} />
            <Button variant="outline" asChild>
              <Link to={`/queues/${queue.id}/edit`}>
                <Edit3 className="mr-2 h-4 w-4" />
                Edit queue
              </Link>
            </Button>
            <Button asChild>
              <Link to={`/posts/new?queueId=${queue.id}`}>
                <Plus className="mr-2 h-4 w-4" />
                Add post
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <StatCard label="Cadence" value={cadence?.primary ?? "-"} meta={cadence?.secondary ?? ""} />
        <StatCard label="Posts in queue" value={String(queue.postCount ?? 0)} meta="ready to publish" />
        <StatCard label="Next run" value={formatNextRun(queue.nextRunAt)} meta={queue.nextRunAt ? format(new Date(queue.nextRunAt), "PPp") : "-"} />
        <Card padded>
          <p className="text-xs font-medium uppercase text-muted-foreground">Profile</p>
          <div className="mt-3 flex items-center gap-2">
            <PlatformGlyph platform={normalizePlatform(profile?.platform)} size={14} />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-foreground">{profile?.displayName ?? "Profile"}</p>
              <p className="truncate mono text-xs text-muted-foreground">@{profile?.handle ?? "profile"}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Schedule" padded className="mb-5">
        <p className="text-xs text-muted-foreground">This queue publishes:</p>
        <p className="mono mt-3 rounded-md border bg-[var(--bg-base)] px-3 py-2 text-xs text-foreground">
          {cadence?.mono}
        </p>
      </Card>

      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Posts in queue</h2>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/queues/${queue.id}/posts`}>View all {queue.postCount ?? 0}</Link>
        </Button>
      </div>
      <Card>
        {postsLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((item) => <Skeleton key={item} className="h-10" />)}
          </div>
        ) : previewPosts.length === 0 ? (
          <EmptyState icon={ListOrdered} title="No posts in this queue" body="Add posts to start publishing on this schedule." />
        ) : (
          <div className="divide-y">
            {previewPosts.map((post) => (
              <div key={post.id} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 px-4 py-3">
                <span className="mono text-xs text-muted-foreground">#{post.queuePosition ?? "-"}</span>
                <p className="truncate text-sm text-foreground">{post.headline ?? post.text}</p>
                <StatusPill status={postStatus(post.status)} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}

function StatCard({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <Card padded>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p className="mt-3 truncate text-2xl font-semibold text-foreground">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{meta}</p>
        </div>
      </div>
    </Card>
  );
}
