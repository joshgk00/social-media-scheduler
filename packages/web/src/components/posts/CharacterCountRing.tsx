import {
  getPlatformCharCount,
  PLATFORM_COMPOSER_CHAR_LIMIT,
  type PlatformComposerKey,
} from '@sms/shared';
import { cn } from '../../lib/utils';

interface CharacterCountRingProps {
  text: string;
  platform: PlatformComposerKey;
  size?: 'sm' | 'lg';
}

export function CharacterCountRing({
  text,
  platform,
  size = 'lg',
}: CharacterCountRingProps) {
  const limit = PLATFORM_COMPOSER_CHAR_LIMIT[platform];
  const { count } = getPlatformCharCount(text, platform);
  const remaining = limit - count;
  const permillage = limit > 0 ? Math.round((count / limit) * 1000) : 0;

  const radius = size === 'sm' ? 10 : 14;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(permillage / 1000, 1);
  const dashOffset = circumference * (1 - progress);

  const diameter = size === 'sm' ? 24 : 32;
  const center = diameter / 2;
  const strokeWidth = 2;

  // Drive over-limit purely from `remaining`. `getPlatformCharCount` returns
  // `exceedsCap = !parseTweet.valid` for Twitter, but twitter-text marks an
  // empty tweet invalid — using exceedsCap would render the blank composer
  // as over-limit on initial render.
  const isOverLimit = remaining < 0;
  const isWarning = !isOverLimit && permillage > 928;
  // Show the number once the user is within 20 chars of the limit, in either
  // direction. For high-cap platforms (FB 63k) the trailing number is only
  // useful near the boundary.
  const showCount = remaining <= 20;

  const progressColor = isOverLimit
    ? 'text-destructive'
    : isWarning
      ? 'text-amber-400'
      : 'text-success';

  const ariaLabel = isOverLimit
    ? `${Math.abs(remaining)} characters over limit`
    : `${remaining} characters remaining`;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      role="status"
      aria-label={ariaLabel}
      data-platform={platform}
      data-over-limit={isOverLimit ? 'true' : 'false'}
    >
      <svg
        width={diameter}
        height={diameter}
        className="transform -rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="text-border"
          stroke="currentColor"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className={progressColor}
          stroke="currentColor"
        />
      </svg>
      {showCount && (
        <span
          className={cn(
            'absolute font-semibold',
            size === 'sm' ? 'text-xs' : 'text-sm',
            isOverLimit ? 'text-destructive' : 'text-foreground'
          )}
        >
          {remaining}
        </span>
      )}
    </div>
  );
}
