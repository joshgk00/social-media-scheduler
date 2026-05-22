import { ExternalLink, Info, RadioTower, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { getAdminQueuesUrl } from '@/lib/admin-queues-url';

const queueCards = [
  {
    name: 'publish',
    status: 'Watch',
    tone: 'warning' as const,
    body: 'Scheduled posts and publish retries.',
    detail: 'Review delayed jobs before forcing retries.',
  },
  {
    name: 'notification',
    status: 'Issue',
    tone: 'danger' as const,
    body: 'Email and in-app notification jobs.',
    detail: 'SMTP is not configured, so email delivery is paused.',
  },
  {
    name: 'bulk-ops',
    status: 'Healthy',
    tone: 'success' as const,
    body: 'CSV imports and bulk queue actions.',
    detail: 'No operator action needed.',
  },
];

export default function BullBoardPage() {
  const adminQueuesUrl = getAdminQueuesUrl();

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={
          <span className="flex flex-wrap items-center gap-1">
            <Link to="/settings/advanced" className="hover:underline">Settings</Link>
            <span>/</span>
            <Link to="/settings/advanced" className="hover:underline">Advanced</Link>
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
        You're about to leave the Clicks & Mortar UI. Bull Board is a third-party operator dashboard with its own styling, controls, and queue terminology.
      </Banner>

      <div className="grid gap-3 lg:grid-cols-3">
        {queueCards.map((queue) => (
          <Card key={queue.name} padded className="min-h-[150px]">
            <div className="flex h-full flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <RadioTower className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <h2 className="font-mono text-sm font-semibold text-foreground">{queue.name}</h2>
                  </div>
                  <Pill tone={queue.tone} dot>{queue.status}</Pill>
                </div>
                <p className="text-sm text-muted-foreground">{queue.body}</p>
              </div>
              <p className="rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
                {queue.detail}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex min-h-14 flex-col gap-3 border-b border-border bg-[#f5f3f1] px-4 py-3 text-[#2d2926] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Embedded Bull Board - light theme, separate design language. Press Esc to return here.</span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={adminQueuesUrl} target="_blank" rel="noreferrer">
              Open in new tab
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
        <div className="bg-background">
          <iframe
            title="Embedded Bull Board"
            src={adminQueuesUrl}
            className="h-[65vh] min-h-[420px] w-full border-0"
          />
        </div>
      </Card>

      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Queue actions can retry, promote, or clean background jobs. Use the embedded controls only when you understand the job state.
      </p>
    </div>
  );
}
