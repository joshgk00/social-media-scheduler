import { format } from 'date-fns';
import {
  CheckCircle2,
  XCircle,
  Clock,
  MinusCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import type { PostAttemptDto, PostAttemptOutcome } from '@sms/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { usePostHistory } from '../../hooks/use-post-history';
import { useState, useEffect } from 'react';

interface PostHistoryDialogProps {
  postId: string | null;
  onOpenChange: (open: boolean) => void;
}

interface OutcomeMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}

const OUTCOME_META: Record<PostAttemptOutcome, OutcomeMeta> = {
  success: {
    label: 'Success',
    icon: CheckCircle2,
    colorClass: 'text-[--color-success]',
  },
  transient_fail: {
    label: 'Transient failure — will retry',
    icon: Clock,
    colorClass: 'text-muted-foreground',
  },
  permanent_fail: {
    label: 'Permanent failure',
    icon: XCircle,
    colorClass: 'text-destructive',
  },
  cancelled: {
    label: 'Cancelled',
    icon: MinusCircle,
    colorClass: 'text-muted-foreground',
  },
};

function AttemptRow({ attempt, total, index }: { attempt: PostAttemptDto; total: number; index: number }) {
  const meta = OUTCOME_META[attempt.outcome];
  const Icon = meta.icon;
  const startedDate = new Date(attempt.startedAt);
  const startedLocal = format(startedDate, 'PPpp');

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${meta.colorClass}`} aria-hidden="true" />
        <span className={`text-sm font-semibold ${meta.colorClass}`}>{meta.label}</span>
        <span className="text-xs text-muted-foreground">
          Attempt {index + 1} of {total}
        </span>
      </div>
      <div className="pl-6 space-y-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground cursor-help">{startedLocal}</span>
            </TooltipTrigger>
            <TooltipContent>
              <span className="text-xs">{attempt.startedAt}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {attempt.httpStatus != null && (
          <div className="text-xs text-muted-foreground">HTTP {attempt.httpStatus}</div>
        )}
        {attempt.errorMessage && (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{attempt.errorMessage}</p>
        )}
      </div>
    </div>
  );
}

function CycleSection({
  cycle,
  cycleIndex,
  defaultOpen,
}: {
  cycle: PostAttemptDto[];
  cycleIndex: number;
  defaultOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left rounded-md p-2 hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-expanded={isOpen}
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold">Retry cycle {cycleIndex + 1}</span>
          <span className="text-xs text-muted-foreground">
            ({cycle.length} attempt{cycle.length === 1 ? '' : 's'})
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-6 space-y-3 py-2">
          {cycle.map((attempt, attemptIndex) => (
            <div key={attempt.id}>
              <AttemptRow attempt={attempt} total={cycle.length} index={attemptIndex} />
              {attemptIndex < cycle.length - 1 && <Separator className="mt-3" />}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PostHistoryDialog({ postId, onOpenChange }: PostHistoryDialogProps) {
  const isOpen = postId !== null;
  const historyQuery = usePostHistory(postId);

  // Reset state when dialog closes so a re-open refetches cleanly.
  const [mountKey, setMountKey] = useState(0);
  useEffect(() => {
    if (!isOpen) {
      setMountKey((key) => key + 1);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" key={mountKey}>
        <DialogHeader>
          <DialogTitle>Publish History</DialogTitle>
          <DialogDescription>
            All publish attempts for this post, grouped by retry cycle.
          </DialogDescription>
        </DialogHeader>

        {historyQuery.isLoading && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="text-sm text-muted-foreground">Loading history...</span>
          </div>
        )}

        {historyQuery.isError && (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive">
              Couldn&apos;t load history. Check your connection and try again.
            </p>
          </div>
        )}

        {historyQuery.data && historyQuery.data.cycles.length === 0 && (
          <div className="py-8 text-center">
            <h3 className="text-sm font-semibold mb-1">No publish attempts yet</h3>
            <p className="text-sm text-muted-foreground">
              This post has not been picked up by the worker yet.
            </p>
          </div>
        )}

        {historyQuery.data && historyQuery.data.cycles.length > 0 && (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {historyQuery.data.cycles.map((cycle, cycleIndex) => (
              <CycleSection
                key={cycleIndex}
                cycle={cycle}
                cycleIndex={cycleIndex}
                defaultOpen={cycleIndex === 0}
              />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
