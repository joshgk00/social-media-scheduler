import { Checkbox } from '../ui/checkbox';
import { cn } from '../../lib/utils';
import { formatHour } from '../../lib/queue-schedule';

interface HourWindowGridProps {
  value: number[];
  onChange: (hours: number[]) => void;
  is24Hour?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function HourWindowGrid({ value, onChange, is24Hour = false }: HourWindowGridProps) {
  function handleToggle(hour: number, checked: boolean) {
    if (checked) {
      onChange([...value, hour].sort((a, b) => a - b));
    } else {
      onChange(value.filter(h => h !== hour));
    }
  }

  function handleSelectAll() {
    onChange([...HOURS]);
  }

  function handleClearAll() {
    onChange([]);
  }

  return (
    <fieldset>
      <div className="mb-2 flex items-center justify-between gap-3">
        <legend className="text-sm font-semibold">Hour windows</legend>
        <div className="flex gap-3">
          <button
            type="button"
            className="text-xs font-medium text-[var(--brand-accent)] hover:underline"
            onClick={handleSelectAll}
          >
            Select all
          </button>
          <button
            type="button"
            className="text-xs font-medium text-[var(--brand-accent)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleClearAll}
            disabled={value.length === 0}
          >
            Clear
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Only fire during the hours you check (your timezone).
      </p>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {HOURS.map((hour) => {
          const isChecked = value.includes(hour);
          const hourLabel = is24Hour ? String(hour).padStart(2, '0') : formatCompactHour(hour);
          return (
            <label
              key={hour}
              className={cn(
                "flex h-8 cursor-pointer items-center justify-center rounded-md border text-[11px] font-semibold transition-colors",
                isChecked
                  ? "border-[var(--brand-accent)] bg-[var(--brand-accent-soft)] text-[var(--brand-accent)]"
                  : "border-border bg-[var(--bg-elevated)] text-muted-foreground hover:bg-accent",
              )}
            >
              <Checkbox
                id={`hour-${hour}`}
                checked={isChecked}
                onCheckedChange={(checked) => handleToggle(hour, !!checked)}
                aria-label={`${formatVerboseHour(hour)} hour window`}
                className="sr-only"
              />
              {hourLabel}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function formatCompactHour(hour: number): string {
  return formatHour(hour);
}

function formatVerboseHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${period}`;
}
