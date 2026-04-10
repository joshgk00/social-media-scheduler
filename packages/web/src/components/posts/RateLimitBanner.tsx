import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { useRateLimit } from '../../hooks/use-rate-limit';

interface RateLimitBannerProps {
  profileId: string | null;
  onEditBudget: () => void;
}

export function RateLimitBanner({ profileId, onEditBudget }: RateLimitBannerProps) {
  const { data } = useRateLimit(profileId);

  if (!data || !data.warnThresholdHit || data.blockThresholdHit) {
    return null;
  }

  const percent = data.budget > 0
    ? Math.round((data.currentCount / data.budget) * 100)
    : 0;

  return (
    <Alert className="bg-yellow-400/10 text-yellow-200 border-yellow-400/30 [&>svg]:text-yellow-400">
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>Approaching Twitter monthly budget</AlertTitle>
      <AlertDescription className="text-yellow-200/90">
        You&apos;ve used {data.currentCount} of {data.budget} tweets this month ({percent}%).
        Consider raising your budget in profile settings if you plan to keep scheduling.{' '}
        <button
          type="button"
          onClick={onEditBudget}
          className="underline underline-offset-2 hover:no-underline font-medium focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
        >
          Edit budget
        </button>
      </AlertDescription>
    </Alert>
  );
}
