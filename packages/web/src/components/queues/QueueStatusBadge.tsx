import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

interface QueueStatusBadgeProps {
  isPaused: boolean;
  postCount: number;
  seasonalStart?: string | null;
  seasonalEnd?: string | null;
}

export function QueueStatusBadge({
  isPaused,
  postCount,
  seasonalStart,
  seasonalEnd,
}: QueueStatusBadgeProps) {
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

  if (seasonalStart && seasonalEnd) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const currentMmDd = `${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

    const isInSeason = seasonalStart <= seasonalEnd
      ? currentMmDd >= seasonalStart && currentMmDd <= seasonalEnd
      : currentMmDd >= seasonalStart || currentMmDd <= seasonalEnd;

    if (!isInSeason) {
      return (
        <Badge variant="secondary" className={cn('text-xs inline-flex items-center gap-1')}>
          <span className="h-1.5 w-1.5 rounded-full bg-[--color-warning]" />
          Seasonal pause
        </Badge>
      );
    }
  }

  return (
    <Badge variant="outline" className={cn('text-xs inline-flex items-center gap-1')}>
      <span className="h-1.5 w-1.5 rounded-full bg-[--color-success]" />
      Active
    </Badge>
  );
}
