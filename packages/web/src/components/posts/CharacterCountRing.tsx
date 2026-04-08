import { getCharacterCount } from '@/lib/twitter-text';
import { cn } from '@/lib/utils';

interface CharacterCountRingProps {
  text: string;
  size?: 'sm' | 'lg';
}

export function CharacterCountRing({ text, size = 'lg' }: CharacterCountRingProps) {
  const { permillage, remaining } = getCharacterCount(text);

  const radius = size === 'sm' ? 10 : 14;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(permillage / 1000, 1);
  const dashOffset = circumference * (1 - progress);

  const diameter = size === 'sm' ? 24 : 32;
  const center = diameter / 2;
  const strokeWidth = 2;

  const isOverLimit = remaining < 0;
  const isWarning = permillage > 928 && permillage <= 1000;
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
