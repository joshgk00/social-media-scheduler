import { Ban } from 'lucide-react';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

export interface RateLimitBlockErrorDetail {
  code: 'twitter_budget_exceeded';
  budget: number;
  currentCount: number;
}

interface RateLimitBlockErrorProps {
  error: RateLimitBlockErrorDetail;
  onRaiseBudget: () => void;
}

function nextMonthStartUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
}

export function RateLimitBlockError({ error, onRaiseBudget }: RateLimitBlockErrorProps) {
  const resetDate = nextMonthStartUtc();
  const resetDateLocal = format(resetDate, "EEE, MMM d 'at' h:mm aa zzz");

  return (
    <Alert variant="destructive">
      <Ban className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>Twitter monthly budget reached</AlertTitle>
      <AlertDescription>
        You&apos;ve used all {error.budget} tweets allowed for this profile this month. Raise
        the budget to schedule more posts, or wait until {resetDateLocal}.{' '}
        <button
          type="button"
          onClick={onRaiseBudget}
          className="underline underline-offset-2 hover:no-underline font-medium focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
        >
          Raise budget
        </button>
      </AlertDescription>
    </Alert>
  );
}
