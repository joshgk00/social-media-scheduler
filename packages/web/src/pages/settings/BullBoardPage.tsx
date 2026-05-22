import { ExternalLink, Info, RadioTower, TriangleAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { apiClient } from "@/lib/api-client";
import { getAdminQueuesUrl } from "@/lib/admin-queues-url";

interface QueueCounts {
  active: number;
  completed: number;
  failed: number;
}

interface QueueHealthResponse {
  publish: QueueCounts;
  notification: QueueCounts;
  bulk_ops: QueueCounts;
}

const queueCards = [
  {
    name: "publish",
    key: "publish" as const,
    body: "Scheduled posts and publish retries.",
  },
  {
    name: "notification",
    key: "notification" as const,
    body: "Email and in-app notification jobs.",
  },
  {
    name: "bulk-ops",
    key: "bulk_ops" as const,
    body: "CSV imports and bulk queue actions.",
  },
];

function summarizeQueue(
  counts?: QueueCounts,
  isLoading = false,
  isError = false,
) {
  if (isLoading) {
    return {
      status: "Loading",
      tone: "neutral" as const,
      detail: "Fetching live queue health.",
    };
  }
  if (isError || !counts) {
    return {
      status: "Unknown",
      tone: "neutral" as const,
      detail: "Queue health is unavailable.",
    };
  }
  if (counts.failed > 0) {
    return {
      status: "Issue",
      tone: "danger" as const,
      detail: `${counts.failed} failed jobs need review.`,
    };
  }
  if (counts.active > 0) {
    return {
      status: "Healthy",
      tone: "success" as const,
      detail: `${counts.active} active jobs running; ${counts.completed} completed.`,
    };
  }
  return {
    status: "Healthy",
    tone: "success" as const,
    detail: `${counts.completed} completed jobs recorded.`,
  };
}

export default function BullBoardPage() {
  const adminQueuesUrl = getAdminQueuesUrl();
  const queueHealthQuery = useQuery({
    queryKey: ["admin-queue-health"],
    queryFn: () => apiClient.get<QueueHealthResponse>("/admin/queue-health"),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={
          <span className="flex flex-wrap items-center gap-1">
            <Link to="/settings/profile" className="hover:underline">
              Settings
            </Link>
            <span>/</span>
            <Link to="/settings/advanced" className="hover:underline">
              Advanced
            </Link>
            <span>/</span>
            <span className="text-foreground">Worker queue inspector</span>
          </span>
        }
        title="Worker queue inspector"
        subtitle="Background-job admin powered by Bull Board (BullMQ)."
        actions={
          <Button variant="outline" asChild>
            <a href={adminQueuesUrl} target="_blank" rel="noreferrer">
              Open in new tab
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        }
      />

      <Banner tone="info">
        You're about to leave the Clicks & Mortar UI. Bull Board is a
        third-party operator dashboard with its own styling, controls, and queue
        terminology.
      </Banner>

      <div className="grid gap-3 lg:grid-cols-3">
        {queueCards.map((queue) => {
          const summary = summarizeQueue(
            queueHealthQuery.data?.[queue.key],
            queueHealthQuery.isLoading,
            queueHealthQuery.isError,
          );

          return (
            <Card key={queue.name} padded className="min-h-[150px]">
              <div className="flex h-full flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <RadioTower
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <h2 className="font-mono text-sm font-semibold text-foreground">
                        {queue.name}
                      </h2>
                    </div>
                    <Pill tone={summary.tone} dot>
                      {summary.status}
                    </Pill>
                  </div>
                  <p className="text-sm text-muted-foreground">{queue.body}</p>
                </div>
                <p className="rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
                  {summary.detail}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="flex min-h-14 flex-col gap-3 border-b border-border bg-[#f5f3f1] px-4 py-3 text-[#2d2926] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Embedded Bull Board - light theme, separate design language. Press
              Esc to return here.
            </span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={adminQueuesUrl} target="_blank" rel="noreferrer">
              Open in new tab
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
        <div className="bg-background">
          {/* Bull Board is same-origin admin UI; do not present iframe sandboxing as an isolation boundary. */}
          <iframe
            title="Embedded Bull Board"
            src={adminQueuesUrl}
            className="h-[65vh] min-h-[420px] w-full border-0"
          />
        </div>
      </Card>

      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <TriangleAlert
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          aria-hidden="true"
        />
        Queue actions can retry, promote, or clean background jobs. Use the
        embedded controls only when you understand the job state.
      </p>
    </div>
  );
}
