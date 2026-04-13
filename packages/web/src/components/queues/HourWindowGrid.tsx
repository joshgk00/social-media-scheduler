import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

interface HourWindowGridProps {
  value: number[];
  onChange: (hours: number[]) => void;
  is24Hour?: boolean;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

function formatHour(hour: number, is24Hour: boolean): string {
  if (is24Hour) return String(hour).padStart(2, '0');
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${period}`;
}

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
      <legend className="text-sm font-semibold mb-2">Hour windows</legend>
      <p className="text-xs text-muted-foreground mb-3">
        Posts only go out during checked hours (in your timezone).
      </p>
      <div className="flex gap-3 mb-3">
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={handleSelectAll}
        >
          Select All
        </button>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={handleClearAll}
        >
          Clear All
        </button>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {HOURS.map((hour) => {
          const isChecked = value.includes(hour);
          const hourLabel = formatHour(hour, is24Hour);
          return (
            <div key={hour} className="flex items-center gap-2">
              <Checkbox
                id={`hour-${hour}`}
                checked={isChecked}
                onCheckedChange={(checked) => handleToggle(hour, !!checked)}
                aria-label={`${formatHour(hour, false)} hour window`}
              />
              <Label htmlFor={`hour-${hour}`} className="text-sm cursor-pointer">
                {hourLabel}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
