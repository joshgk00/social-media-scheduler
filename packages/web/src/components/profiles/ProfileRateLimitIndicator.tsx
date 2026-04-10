import { useRateLimit } from '../../hooks/use-rate-limit';

interface ProfileRateLimitIndicatorProps {
  profileId: string;
}

type IndicatorState = 'ok' | 'warn' | 'block';

function resolveState(percent: number, warnThreshold: number): IndicatorState {
  if (percent >= 100) return 'block';
  if (percent >= warnThreshold) return 'warn';
  return 'ok';
}

const DOT_CLASS: Record<IndicatorState, string> = {
  ok: 'bg-[--color-success]',
  warn: 'bg-[--color-warning]',
  block: 'bg-destructive',
};

const TEXT_CLASS: Record<IndicatorState, string> = {
  ok: 'text-[--color-success]',
  warn: 'text-[--color-warning]',
  block: 'text-destructive',
};

export function ProfileRateLimitIndicator({ profileId }: ProfileRateLimitIndicatorProps) {
  const { data, isLoading } = useRateLimit(profileId);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading usage…</p>;
  }

  if (!data) {
    return <p className="text-xs text-muted-foreground">Usage unavailable</p>;
  }

  const percent = Math.round((data.currentCount / data.budget) * 100);
  const state = resolveState(percent, data.warnThresholdPercent);

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${DOT_CLASS[state]}`}
      />
      <span className={`text-xs ${TEXT_CLASS[state]}`}>
        {state === 'block'
          ? `${data.currentCount} / ${data.budget} tweets — budget reached`
          : state === 'warn'
            ? `${data.currentCount} / ${data.budget} tweets (${percent}%) — approaching limit`
            : `${data.currentCount} / ${data.budget} tweets (${percent}%)`}
      </span>
    </div>
  );
}
