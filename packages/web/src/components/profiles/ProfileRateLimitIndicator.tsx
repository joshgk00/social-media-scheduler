import { useRateLimit } from '../../hooks/use-rate-limit';
import { cn } from '../../lib/utils';

interface ProfileRateLimitIndicatorProps {
  profileId: string;
}

type IndicatorState = 'success' | 'warning' | 'danger';

function resolveState(percent: number, warnThreshold: number): IndicatorState {
  if (percent >= 100) return 'danger';
  if (percent >= warnThreshold) return 'warning';
  return 'success';
}

const BAR_CLASS: Record<IndicatorState, string> = {
  success: 'bg-[var(--status-success)]',
  warning: 'bg-[var(--status-warning)]',
  danger: 'bg-[var(--status-danger)]',
};

const TEXT_CLASS: Record<IndicatorState, string> = {
  success: 'text-foreground',
  warning: 'text-[var(--status-warning)]',
  danger: 'text-[var(--status-danger)]',
};

export function ProfileRateLimitIndicator({ profileId }: ProfileRateLimitIndicatorProps) {
  const { data, isLoading } = useRateLimit(profileId);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading rate limit...</p>;
  }

  if (!data) {
    return <p className="text-xs text-muted-foreground">Rate limit unavailable</p>;
  }

  const budget = data.platform === 'twitter' ? data.budget : data.limit;
  const percent = budget > 0
    ? Math.min(100, Math.round((data.currentCount / budget) * 100))
    : 0;
  const state = resolveState(percent, data.warnThresholdPercent ?? 80);

  return (
    <div className="space-y-1.5" aria-label={`${data.currentCount} of ${budget} posts used`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">Rate limit</span>
        <span className={cn("mono text-[11px] tabular-nums", TEXT_CLASS[state])}>
          {data.currentCount} / {budget}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
        <div className={cn("h-full rounded-full", BAR_CLASS[state])} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
