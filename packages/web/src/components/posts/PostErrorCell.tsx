import { AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface PostErrorCellProps {
  failureReason: string | null;
}

export function PostErrorCell({ failureReason }: PostErrorCellProps) {
  if (!failureReason) return null;

  const truncated =
    failureReason.length > 60 ? `${failureReason.slice(0, 60)}...` : failureReason;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-label="Publish failed" />
            <span className="text-xs truncate max-w-[200px]">{truncated}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-md">
          <p className="text-xs whitespace-pre-wrap">{failureReason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
