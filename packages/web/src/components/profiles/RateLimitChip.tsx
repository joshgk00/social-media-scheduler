import { useRateLimit } from '../../hooks/use-rate-limit';
import { Skeleton } from '../ui/skeleton';
import { formatResetTime, type Platform } from '../../lib/format-reset-time';

// LIMIT-08 / D-13 / D-14 — compact per-platform rate-limit chip slotted onto
// `ProfileCard` directly below `TokenHealthBadge`. UI-SPEC §"Rate-limit chip
// on ProfileCard" defines:
//   - layout: `[dot] {used}/{limit} · Resets in {relative}`
//   - bands:  ok  (< 50%) → green dot
//             warn (50-80%) → yellow dot, numeric in `text-[--color-warning]`
//             block (> 80%) → red dot, numeric in `text-destructive`
//
// Twitter consumes the same chip but the reset string is "Resets {Mon DD}"
// instead of "Resets in {Nh}" because monthly windows are too long for a
// relative count.

interface RateLimitChipProps {
  profileId: string;
  platform: Platform;
  userTimezone?: string;
}

type ChipState = 'ok' | 'warn' | 'block';

function resolveBand(percent: number): ChipState {
  if (percent > 80) return 'block';
  if (percent >= 50) return 'warn';
  return 'ok';
}

const DOT_CLASS: Record<ChipState, string> = {
  ok: 'bg-[--color-success]',
  warn: 'bg-[--color-warning]',
  block: 'bg-destructive',
};

const NUMERIC_CLASS: Record<ChipState, string> = {
  ok: '',
  warn: 'text-[--color-warning]',
  block: 'text-destructive',
};

export function RateLimitChip({
  profileId,
  platform,
  userTimezone = 'UTC',
}: RateLimitChipProps) {
  const { data, isLoading, error } = useRateLimit(profileId);

  if (isLoading) {
    return <Skeleton className="h-5 w-32 rounded-full" />;
  }

  if (error || !data) {
    return (
      <span className="text-xs text-muted-foreground">Limit unavailable</span>
    );
  }

  const used = data.currentCount;
  const limit = data.platform === 'twitter' ? data.budget : data.limit;
  const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
  const band = resolveBand(percent);

  let resetCopy: string;
  if (data.platform === 'twitter') {
    const monthLabel = new Date(data.monthStartUtc).toLocaleDateString(
      undefined,
      { month: 'short', day: 'numeric' },
    );
    resetCopy = `Resets ${monthLabel}`;
  } else {
    const { relative } = formatResetTime(
      data.windowResetAt,
      platform,
      userTimezone,
    );
    resetCopy = `Resets in ${relative}`;
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-xs mt-1"
      aria-label={`${platform}: ${used} of ${limit} used, ${resetCopy.toLowerCase()}`}
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${DOT_CLASS[band]}`}
      />
      <span className={NUMERIC_CLASS[band]}>
        {used}/{limit}
      </span>
      <span className="text-muted-foreground"> · {resetCopy}</span>
    </span>
  );
}
