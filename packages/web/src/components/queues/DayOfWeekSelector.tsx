import { Checkbox } from '../ui/checkbox';
import { cn } from '../../lib/utils';
import { WEEK_DAYS } from '../../lib/queue-schedule';

interface DayOfWeekSelectorProps {
  value: number[];
  onChange: (days: number[]) => void;
}

export function DayOfWeekSelector({ value, onChange }: DayOfWeekSelectorProps) {
  function handleToggle(dayIndex: number, checked: boolean) {
    if (checked) {
      onChange([...value, dayIndex].sort((a, b) => a - b));
    } else {
      onChange(value.filter(d => d !== dayIndex));
    }
  }

  function handleWeekdays() {
    const weekdays = [1, 2, 3, 4, 5];
    const hasWeekdays = weekdays.every((day) => value.includes(day));
    onChange(hasWeekdays ? value.filter((day) => !weekdays.includes(day)) : weekdays);
  }

  return (
    <fieldset>
      <div className="mb-2 flex items-center justify-between gap-3">
        <legend className="text-sm font-semibold">Days</legend>
        <button
          type="button"
          className="text-xs font-medium text-[var(--brand-accent)] hover:underline"
          onClick={handleWeekdays}
        >
          Weekdays
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {WEEK_DAYS.map((day) => {
          const isChecked = value.includes(day.index);
          return (
            <label
              key={day.index}
              className={cn(
                "flex h-8 min-w-10 cursor-pointer items-center justify-center rounded-md border px-2 text-xs font-semibold transition-colors",
                isChecked
                  ? "border-[var(--brand-accent)] bg-[var(--brand-accent-soft)] text-[var(--brand-accent)]"
                  : "border-border bg-[var(--bg-elevated)] text-muted-foreground hover:bg-accent",
              )}
            >
              <Checkbox
                id={`day-${day.index}`}
                checked={isChecked}
                onCheckedChange={(checked) => handleToggle(day.index, !!checked)}
                aria-label={day.full}
                className="sr-only"
              />
              {day.short}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
