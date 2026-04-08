import { AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ScheduleConflictBannerProps {
  conflicts: Array<{ text: string; scheduledAt: string }>;
}

export function ScheduleConflictBanner({ conflicts }: ScheduleConflictBannerProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className="bg-amber-400/10 border border-amber-400/30 rounded-md p-3 mt-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          {conflicts.map((conflict, conflictIndex) => {
            const truncatedText = conflict.text.length > 60
              ? `${conflict.text.slice(0, 60)}...`
              : conflict.text;

            return (
              <p key={conflictIndex} className="text-xs text-muted-foreground">
                Another post on this profile is scheduled within 5 minutes of this time:
                &quot;{truncatedText}&quot; at {format(parseISO(conflict.scheduledAt), 'MMM d, yyyy h:mm a')}.
                You can still schedule -- this is just a heads-up.
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
