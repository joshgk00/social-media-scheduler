import { Ban } from 'lucide-react';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

// Plan 03 returns three distinct 409 codes — one per platform. Each carries
// the platform-specific accounting fields. The block error widget switches on
// `error.code` and renders the matching copy from UI-SPEC §Rate-limit banner.
export type RateLimitBlockErrorDetail =
  | {
      code: 'twitter_budget_exceeded';
      budget: number;
      currentCount: number;
    }
  | {
      code: 'linkedin_rate_limit_exceeded';
      limit: number;
      currentCount: number;
      windowResetAt: string;
    }
  | {
      code: 'facebook_rate_limit_exceeded';
      limit: number;
      currentCount: number;
      windowResetAt: string;
    };

interface RateLimitBlockErrorProps {
  error: RateLimitBlockErrorDetail;
  onRaiseBudget: () => void;
}

function nextMonthStartUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
}

const TITLE_BY_CODE: Record<RateLimitBlockErrorDetail['code'], string> = {
  twitter_budget_exceeded: 'Twitter monthly budget reached',
  linkedin_rate_limit_exceeded: 'LinkedIn daily limit reached',
  facebook_rate_limit_exceeded: 'Facebook hourly limit reached',
};

function buildBodyCopy(error: RateLimitBlockErrorDetail): string {
  if (error.code === 'twitter_budget_exceeded') {
    const resetDateLocal = format(
      nextMonthStartUtc(),
      "EEE, MMM d 'at' h:mm aa zzz",
    );
    return `You've used all ${error.budget} tweets allowed for this profile this month. Raise the budget to schedule more posts, or wait until ${resetDateLocal}.`;
  }

  const resetLocal = format(
    new Date(error.windowResetAt),
    "EEE, MMM d 'at' h:mm aa zzz",
  );
  if (error.code === 'linkedin_rate_limit_exceeded') {
    return `LinkedIn daily limit reached (${error.currentCount} / ${error.limit} API calls). Posts will queue until ${resetLocal}.`;
  }
  // facebook_rate_limit_exceeded
  return `Facebook hourly limit reached (${error.currentCount} / ${error.limit} API calls). Posts will queue until ${resetLocal}.`;
}

export function RateLimitBlockError({ error, onRaiseBudget }: RateLimitBlockErrorProps) {
  const showRaiseBudgetCta = error.code === 'twitter_budget_exceeded';
  const body = buildBodyCopy(error);

  return (
    <Alert variant="destructive">
      <Ban className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>{TITLE_BY_CODE[error.code]}</AlertTitle>
      <AlertDescription>
        {body}{' '}
        {showRaiseBudgetCta && (
          <button
            type="button"
            onClick={onRaiseBudget}
            className="underline underline-offset-2 hover:no-underline font-medium focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
          >
            Raise budget
          </button>
        )}
      </AlertDescription>
    </Alert>
  );
}
