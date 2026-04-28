import { AlertTriangle } from 'lucide-react';
import type { RateLimitState } from '@sms/shared';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { useRateLimit } from '../../hooks/use-rate-limit';

interface RateLimitBannerProps {
  profileId: string | null;
  onEditBudget: () => void;
}

// UI-SPEC §"Rate-limit banner (extended for LI / FB)" defines the warn copy
// per platform. Block copy lives in RateLimitBlockError.
const TITLE_BY_PLATFORM: Record<RateLimitState['platform'], string> = {
  twitter: 'Approaching Twitter monthly budget',
  linkedin: 'Approaching LinkedIn daily limit',
  facebook: 'Approaching Facebook hourly limit',
};

function buildSummaryLine(data: RateLimitState): {
  used: number;
  limit: number;
  percent: number;
  copy: string;
} {
  const used = data.currentCount;
  const limit = data.platform === 'twitter' ? data.budget : data.limit;
  const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;

  // Match the UI-SPEC table verbatim — "Twitter: {used} / {limit} tweets this
  // month ({percent}%)." etc. The trailing period is part of the spec.
  const copyByPlatform: Record<RateLimitState['platform'], string> = {
    twitter: `Twitter: ${used} / ${limit} tweets this month (${percent}%).`,
    linkedin: `LinkedIn: ${used} / ${limit} API calls today (${percent}%).`,
    facebook: `Facebook: ${used} / ${limit} API calls this hour (${percent}%).`,
  };
  return { used, limit, percent, copy: copyByPlatform[data.platform] };
}

export function RateLimitBanner({ profileId, onEditBudget }: RateLimitBannerProps) {
  const { data } = useRateLimit(profileId);

  if (!data || !data.warnThresholdHit || data.blockThresholdHit) {
    return null;
  }

  const { copy } = buildSummaryLine(data);

  // The "Edit budget" CTA only makes sense for Twitter (the only platform
  // with a user-configurable budget). LI/FB hide the CTA — the limits are
  // platform-imposed and not editable.
  const showEditCta = data.platform === 'twitter';

  return (
    <Alert className="bg-yellow-400/10 text-yellow-200 border-yellow-400/30 [&>svg]:text-yellow-400">
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>{TITLE_BY_PLATFORM[data.platform]}</AlertTitle>
      <AlertDescription className="text-yellow-200/90">
        {copy}{' '}
        {showEditCta ? (
          <>
            Consider raising your budget in profile settings if you plan to
            keep scheduling.{' '}
            <button
              type="button"
              onClick={onEditBudget}
              className="underline underline-offset-2 hover:no-underline font-medium focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
            >
              Edit budget
            </button>
          </>
        ) : (
          'Posts will queue until the window resets.'
        )}
      </AlertDescription>
    </Alert>
  );
}
