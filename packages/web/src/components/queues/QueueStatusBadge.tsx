import { Clock } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

interface QueueStatusBadgeProps {
  isPaused: boolean;
  postCount: number;
  seasonalStart?: string | null;
  seasonalEnd?: string | null;
}

// WR-04 verified: exclusive operators (<, >) are correct here because this function
// checks if today is OUTSIDE the active window. Boundary dates are active (not paused),
// matching the backend's inclusive >= / <= in isWithinSeasonalWindow.
function isInSeasonalPause(seasonalStart?: string | null, seasonalEnd?: string | null): boolean {
  if (!seasonalStart || !seasonalEnd) return false;
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${month}-${day}`;

  if (seasonalStart <= seasonalEnd) {
    return today < seasonalStart || today > seasonalEnd;
  }
  // Cross-year: paused when today is in the gap (after end AND before start)
  return today > seasonalEnd && today < seasonalStart;
}

export function QueueStatusBadge({ isPaused, postCount, seasonalStart, seasonalEnd }: QueueStatusBadgeProps) {
  const isSeasonalPause = !isPaused && postCount > 0 && isInSeasonalPause(seasonalStart, seasonalEnd);

  if (isSeasonalPause) {
    return (
      <Badge variant="secondary" className={cn('inline-flex items-center gap-1 text-xs font-semibold text-[--color-warning]')}>
        <span className="h-1.5 w-1.5 rounded-full bg-[--color-warning]" aria-hidden="true" />
        <Clock className="h-3 w-3" aria-hidden="true" />
        Seasonal pause
      </Badge>
    );
  }

  if (isPaused) {
    return (
      <Badge variant="secondary" className={cn('text-xs inline-flex items-center gap-1')}>
        <span className="h-1.5 w-1.5 rounded-full bg-[--color-warning]" />
        Paused
      </Badge>
    );
  }

  if (postCount === 0) {
    return (
      <Badge variant="secondary" className="text-xs">
        Empty
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={cn('text-xs inline-flex items-center gap-1')}>
      <span className="h-1.5 w-1.5 rounded-full bg-[--color-success]" />
      Active
    </Badge>
  );
}
