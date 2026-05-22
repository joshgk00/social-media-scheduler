import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Info, Server, ShieldAlert } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Pill } from '../../../components/ui/pill';
import { useSmtpStatus } from '../../../hooks/use-notifications';
import { useSystemHealth } from '../../../hooks/use-settings';

function SystemRow({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status?: 'ok' | 'error' | 'neutral';
}) {
  const tone = status === 'ok' ? 'success' : status === 'error' ? 'danger' : 'neutral';

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-right font-mono text-xs text-foreground">
        {value}
        {status && <Pill tone={tone} dot>{status === 'ok' ? 'OK' : status === 'error' ? 'Issue' : 'Info'}</Pill>}
      </span>
    </div>
  );
}

export function AdvancedSection() {
  const smtpStatusQuery = useSmtpStatus();
  const healthQuery = useSystemHealth();
  const health = healthQuery.data;
  const postgresStatus = health?.checks.postgres?.status;
  const redisStatus = health?.checks.redis?.status;
  const workerAlive = health?.checks.worker?.alive;
  const lastHeartbeat = health?.checks.worker?.lastHeartbeat;
  const lastChecked = health?.timestamp
    ? `${formatDistanceToNow(new Date(health.timestamp), { addSuffix: true })}`
    : 'Not checked';

  return (
    <div className="space-y-4">
      <Card
        title="Worker queue inspector"
        action={
          <Button variant="outline" size="sm" asChild>
            <a href="/settings/advanced/bull-board" target="_blank" rel="noreferrer">
              Open in new tab
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        }
        padded
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-md border border-[var(--status-info)]/40 bg-[var(--status-info-soft)]/50 p-3 text-sm text-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-info)]" aria-hidden="true" />
            <p>
              Queue controls are operator-only. Use this view to inspect stuck jobs, retries, and delayed work.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            3 worker queues: <code className="font-mono text-foreground">publish</code>,{' '}
            <code className="font-mono text-foreground">notification</code>,{' '}
            <code className="font-mono text-foreground">bulk-ops</code>
          </p>
        </div>
      </Card>

      <Card title="System info" padded>
        <div className="divide-y-0">
          <SystemRow label="Version" value={import.meta.env.VITE_APP_VERSION ?? 'development'} status="neutral" />
          <SystemRow
            label="Database"
            value={postgresStatus === 'ok' ? 'postgres reachable' : postgresStatus === 'error' ? 'postgres degraded' : 'unknown'}
            status={postgresStatus ?? 'neutral'}
          />
          <SystemRow
            label="Worker process"
            value={
              workerAlive
                ? lastHeartbeat ? `heartbeat ${formatDistanceToNow(new Date(lastHeartbeat), { addSuffix: true })}` : 'heartbeat fresh'
                : 'no fresh heartbeat'
            }
            status={workerAlive ? 'ok' : workerAlive === false ? 'error' : 'neutral'}
          />
          <SystemRow
            label="Redis"
            value={redisStatus === 'ok' ? 'redis reachable' : redisStatus === 'error' ? 'redis degraded' : 'unknown'}
            status={redisStatus ?? 'neutral'}
          />
          <SystemRow
            label="SMTP"
            value={smtpStatusQuery.data?.configured ? 'configured' : 'not configured'}
            status={smtpStatusQuery.data?.configured ? 'ok' : 'neutral'}
          />
          <SystemRow label="Uptime" value={lastChecked} status={health?.status === 'healthy' ? 'ok' : health?.status === 'degraded' ? 'error' : 'neutral'} />
        </div>
      </Card>

      <Card title="Danger zone" padded>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-[var(--status-danger)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">Data controls</p>
              <p className="text-sm text-muted-foreground">
                Export your data before resetting anything on this self-hosted instance.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<Server className="h-4 w-4" aria-hidden="true" />}
              disabled
              title="Coming soon"
            >
              Export all data
            </Button>
            <Button variant="danger" size="sm" disabled title="Coming soon">
              Reset application
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
