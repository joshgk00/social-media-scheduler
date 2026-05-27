import { useMemo, useState } from "react";
import { Link } from "react-router";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Clock,
  Info,
  ListOrdered,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import {
  PlatformGlyph,
  type Platform,
} from "@/components/ui/platform-glyph";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, StatusPill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardPostStats, type Post } from "@/hooks/use-posts";
import { useProfiles, type SocialProfile } from "@/hooks/use-profiles";
import { useQueues, type QueueListItem } from "@/hooks/use-queues";
import { useAllProfilesRateLimits } from "@/hooks/use-rate-limit";
import { formatResetTime } from "@/lib/format-reset-time";
import { cadenceSummary } from "@/lib/queue-schedule";
import { cn } from "@/lib/utils";

type WindowRange = "24h" | "7d" | "30d";

interface RateLimitRow {
  profileId: string;
  platform: Platform;
  handle?: string;
  currentCount: number;
  budget?: number;
  limit?: number;
  windowResetAt?: string;
}

const windowOptions = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
] as const;

function normalizePlatform(platform?: string | null): Platform {
  if (platform === "linkedin" || platform === "facebook") return platform;
  return "twitter";
}

function readLimit(row: RateLimitRow): number {
  return row.limit ?? row.budget ?? 0;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function profileFor(
  profiles: SocialProfile[],
  profileId: string | null,
): SocialProfile | undefined {
  return profiles.find((profile) => profile.id === profileId);
}

function postPlatform(post: Post, profiles: SocialProfile[]): Platform {
  return normalizePlatform(profileFor(profiles, post.profileId)?.platform);
}

function postTitle(post: Post): string {
  return post.headline || post.text || "Untitled post";
}

function StatCard({
  title,
  value,
  meta,
  tone,
  icon,
  trend,
  to,
}: {
  title: string;
  value: string;
  meta: string;
  tone: "info" | "success" | "danger";
  icon: typeof Info;
  trend?: string;
  to: string;
}) {
  const toneClassName = {
    info: "text-[var(--status-info)] bg-[var(--status-info-soft)]",
    success: "text-[var(--status-success)] bg-[var(--status-success-soft)]",
    danger: "text-[var(--status-danger)] bg-[var(--status-danger-soft)]",
  }[tone];

  return (
    <Link
      to={to}
      className="group rounded-md border bg-card p-4 text-card-foreground shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[var(--brand-primary)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold leading-none text-foreground">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            toneClassName,
          )}
        >
          <Icon icon={icon} size={15} />
        </span>
      </div>
      <p className="mt-3 truncate text-sm text-muted-foreground">{meta}</p>
      {trend && (
        <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">
          {trend}
        </p>
      )}
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-12" />
      ))}
    </div>
  );
}

function Timeline({
  upcomingPosts,
  failedPosts,
  now,
}: {
  upcomingPosts: Post[];
  failedPosts: Post[];
  now: Date;
}) {
  const currentHour = now.getHours();
  const markerLeft = ((currentHour + now.getMinutes() / 60) / 24) * 100;

  const upcomingByHour = new Map<number, number>();
  const failedByHour = new Map<number, number>();

  upcomingPosts.forEach((post) => {
    const date = toDate(post.scheduledAt);
    if (date && date.toDateString() === now.toDateString()) {
      upcomingByHour.set(date.getHours(), (upcomingByHour.get(date.getHours()) ?? 0) + 1);
    }
  });

  failedPosts.forEach((post) => {
    const date = toDate(post.scheduledAt ?? post.updatedAt);
    if (date && date.toDateString() === now.toDateString()) {
      failedByHour.set(date.getHours(), (failedByHour.get(date.getHours()) ?? 0) + 1);
    }
  });

  return (
    <div>
      <div className="relative h-24 pt-5">
        <div
          className="absolute bottom-3 top-0 z-10 w-0.5 bg-foreground"
          style={{ left: `${markerLeft}%` }}
          aria-hidden="true"
        />
        <div
          className="absolute top-0 z-10 -translate-x-1/2 text-[10px] font-semibold text-foreground"
          style={{ left: `${markerLeft}%` }}
        >
          NOW · {format(now, "HH:mm")}
        </div>
        <div className="grid h-20 grid-cols-[repeat(24,minmax(0,1fr))] gap-px overflow-hidden rounded-md border border-border bg-border">
          {Array.from({ length: 24 }, (_, hour) => {
            const upcomingCount = upcomingByHour.get(hour) ?? 0;
            const failedCount = failedByHour.get(hour) ?? 0;
            const isPast = hour < currentHour;
            const title = `${format(new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour), "HH:00")} · ${upcomingCount} upcoming · ${failedCount} failed`;

            return (
              <button
                key={hour}
                type="button"
                title={title}
                aria-label={title}
                className={cn(
                  "h-full min-w-0 bg-[var(--bg-elevated)] transition-opacity focus-visible:z-20 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]",
                  upcomingCount > 0 && "bg-[var(--brand-accent)]",
                  failedCount > 0 &&
                    "bg-[repeating-linear-gradient(135deg,var(--status-danger)_0,var(--status-danger)_4px,var(--status-danger-soft)_4px,var(--status-danger-soft)_8px)]",
                  isPast && "opacity-40",
                )}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-8 text-[10px] text-muted-foreground">
        {["00", "03", "06", "09", "12", "15", "18", "21"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <LegendSwatch className="bg-[var(--brand-accent)]" label="Upcoming" />
        <LegendSwatch
          className="bg-[repeating-linear-gradient(135deg,var(--status-danger)_0,var(--status-danger)_4px,var(--status-danger-soft)_4px,var(--status-danger-soft)_8px)]"
          label="Failed"
        />
        <LegendSwatch className="bg-[var(--bg-elevated)] opacity-40" label="Past" />
      </div>
    </div>
  );
}

function LegendSwatch({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn("h-2.5 w-2.5 rounded-[2px] border border-border", className)}
      />
      {label}
    </span>
  );
}

function UpcomingPosts({
  posts,
  profiles,
  now,
}: {
  posts: Post[];
  profiles: SocialProfile[];
  now: Date;
}) {
  if (posts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-input px-4 py-5 text-center text-sm text-muted-foreground">
        No posts queued or scheduled in this window.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {posts.slice(0, 4).map((post) => {
        const scheduledAt = toDate(post.scheduledAt);
        const isToday = scheduledAt?.toDateString() === now.toDateString();
        return (
          <Link
            key={post.id}
            to={`/posts/${post.id}/edit`}
            className="grid grid-cols-[86px_minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {scheduledAt ? format(scheduledAt, isToday ? "HH:mm" : "MMM d, HH:mm") : "--:--"}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <PlatformGlyph platform={postPlatform(post, profiles)} size={14} />
              <span className="truncate text-foreground">{postTitle(post)}</span>
            </span>
            <StatusPill status={post.status === "queued" ? "queued" : "scheduled"} />
          </Link>
        );
      })}
    </div>
  );
}

function ActiveQueuesCard({
  queues,
  isLoading,
}: {
  queues: QueueListItem[];
  isLoading: boolean;
}) {
  return (
    <Card
      title="Active queues"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/queues">
            All queues
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {isLoading ? (
        <DashboardSkeleton />
      ) : queues.length === 0 ? (
        <div className="py-2">
          <EmptyState
            icon={ListOrdered}
            title="No active queues"
            body="Resume a paused queue or create one to start filling this space."
            action={
              <Button asChild variant="primary" size="sm">
                <Link to="/queues/new">Create queue</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {queues.slice(0, 3).map((queue) => (
            <Link
              key={queue.id}
              to={`/queues/${queue.id}`}
              className="block px-4 py-3 transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <PlatformGlyph
                    platform={normalizePlatform(queue.profile?.platform)}
                    size={14}
                  />
                  <span className="truncate text-sm font-medium text-foreground">
                    {queue.name}
                  </span>
                </span>
                <StatusPill status={queue.isPaused ? "paused" : "active"} />
              </div>
              <p className="mt-1 truncate pl-6 text-xs text-muted-foreground">
                {queue.postCount} posts · {cadenceSummary(queue).primary}
                {queue.nextRunAt
                  ? ` · next ${formatDistanceToNowStrict(new Date(queue.nextRunAt), { addSuffix: true })}`
                  : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function RateLimitsPanel({
  rows,
  profiles,
  isLoading,
  isError,
}: {
  rows: RateLimitRow[];
  profiles: SocialProfile[];
  isLoading: boolean;
  isError: boolean;
}) {
  const usedRows = rows
    .map((row) => {
      const limit = readLimit(row);
      return {
        row,
        limit,
        percent: limit > 0 ? Math.round((row.currentCount / limit) * 100) : 0,
      };
    })
    .sort((a, b) => b.percent - a.percent);

  const firstReset = usedRows.find(({ row }) => row.windowResetAt)?.row;
  const reset = firstReset?.windowResetAt
    ? formatResetTime(firstReset.windowResetAt, firstReset.platform)
    : null;

  return (
    <Card title="Rate limits">
      {isLoading ? (
        <DashboardSkeleton />
      ) : isError ? (
        <div className="rounded-md border border-[var(--status-danger-soft)] bg-[var(--status-danger-soft)] px-4 py-5 text-sm text-[var(--status-danger)]">
          Couldn&apos;t load rate limits.
        </div>
      ) : usedRows.length === 0 ? (
        <div className="rounded-md border border-dashed border-input px-4 py-5 text-center text-sm text-muted-foreground">
          No connected profiles yet.
        </div>
      ) : (
        <>
          <div className="space-y-4 px-4 py-3">
            {usedRows.slice(0, 3).map(({ row, limit, percent }) => {
              const profile = profileFor(profiles, row.profileId);
              const name =
                profile?.displayName ||
                row.handle ||
                `${row.platform[0].toUpperCase()}${row.platform.slice(1)} profile`;

              return (
                <div key={row.profileId}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <PlatformGlyph platform={row.platform} size={14} />
                      <span className="truncate font-medium text-foreground">
                        {name}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {row.currentCount}/{limit}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        percent > 80
                          ? "bg-[var(--status-danger)]"
                          : percent >= 50
                            ? "bg-[var(--status-warning)]"
                            : "bg-[var(--status-success)]",
                      )}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="flex min-h-10 items-center border-t border-border px-4 pb-4 pt-3 text-xs text-muted-foreground">
            {reset
              ? `All reset ${reset.absolute} (${reset.relative})`
              : "Reset times unavailable"}
          </p>
        </>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const [windowRange, setWindowRange] = useState<WindowRange>("24h");
  const now = useMemo(() => new Date(), []);
  const postStatsQuery = useDashboardPostStats(windowRange);
  const queuesQuery = useQueues();
  const profilesQuery = useProfiles();
  const rateLimitsQuery = useAllProfilesRateLimits();

  const queues = queuesQuery.data ?? [];
  const profiles = profilesQuery.data ?? [];
  const rateRows = (rateLimitsQuery.data ?? []) as RateLimitRow[];

  const upcoming24 = postStatsQuery.data?.scheduled24 ?? [];
  const upcoming24Count = postStatsQuery.data?.scheduled24Count ?? 0;
  const upcomingInRange = postStatsQuery.data?.scheduledInRange ?? [];
  const failed24 = postStatsQuery.data?.failed24 ?? [];
  const failed7dCount = postStatsQuery.data?.failed7dCount ?? 0;
  const activeQueues = queues.filter((queue) => !queue.isPaused);
  const pausedQueues = queues.length - activeQueues.length;
  const scheduledProfileCount = postStatsQuery.data?.scheduledProfileCount ?? 0;
  const totalUsed = rateRows.reduce((sum, row) => sum + row.currentCount, 0);
  const totalLimit = rateRows.reduce((sum, row) => sum + readLimit(row), 0);
  const hasBlockedProfile = rateRows.some((row) => readLimit(row) === 0);
  const headroom =
    rateRows.length === 0
      ? 100
      : hasBlockedProfile
        ? 0
        : Math.max(0, Math.round(100 - (totalUsed / totalLimit) * 100));
  const isLoading =
    postStatsQuery.isLoading ||
    queuesQuery.isLoading ||
    profilesQuery.isLoading ||
    rateLimitsQuery.isLoading;

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Dashboard"
        subtitle="Operational snapshot for scheduled content, queues, and publishing limits."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/calendar">
                <Calendar size={16} aria-hidden="true" />
                Open calendar
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link to="/posts/new">
                <Plus size={16} aria-hidden="true" />
                New post
              </Link>
            </Button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Upcoming (24h)"
          value={String(upcoming24Count)}
          meta={`Across ${scheduledProfileCount} profile${scheduledProfileCount === 1 ? "" : "s"}`}
          tone="info"
          icon={Info}
          to="/calendar"
        />
        <StatCard
          title="Active queues"
          value={`${activeQueues.length} of ${queues.length}`}
          meta={`${pausedQueues} paused`}
          tone="success"
          icon={ListOrdered}
          to="/queues"
        />
        <StatCard
          title="Errors (7d)"
          value={String(failed7dCount)}
          meta="Needs attention"
          tone="danger"
          icon={AlertTriangle}
          to="/notifications"
        />
        <StatCard
          title="Rate headroom"
          value={`${headroom}%`}
          meta="Across active profiles"
          tone="success"
          icon={Clock}
          to="/profiles"
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card
          title="Upcoming schedule"
          padded
          action={
            <Segmented
              label="Schedule window"
              value={windowRange}
              options={windowOptions}
              onChange={setWindowRange}
            />
          }
        >
          {isLoading ? (
            <DashboardSkeleton />
          ) : (
            <div className="space-y-6">
              <Timeline
                upcomingPosts={upcoming24}
                failedPosts={failed24}
                now={now}
              />
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Up next</h3>
                  <Pill tone="neutral">
                    {windowRange === "24h"
                      ? "Next 24h"
                      : windowRange === "7d"
                        ? "Next 7d"
                        : "Next 30d"}
                  </Pill>
                </div>
                <UpcomingPosts posts={upcomingInRange} profiles={profiles} now={now} />
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <ActiveQueuesCard queues={activeQueues} isLoading={queuesQuery.isLoading} />
          <RateLimitsPanel
            rows={rateRows}
            profiles={profiles}
            isLoading={rateLimitsQuery.isLoading || profilesQuery.isLoading}
            isError={rateLimitsQuery.isError}
          />
        </div>
      </section>
    </main>
  );
}
