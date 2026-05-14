import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

interface DayOfWeekSelectorProps {
  value: number[];
  onChange: (days: number[]) => void;
}

const DAYS = [
  { index: 0, short: 'Sun', full: 'Sunday' },
  { index: 1, short: 'Mon', full: 'Monday' },
  { index: 2, short: 'Tue', full: 'Tuesday' },
  { index: 3, short: 'Wed', full: 'Wednesday' },
  { index: 4, short: 'Thu', full: 'Thursday' },
  { index: 5, short: 'Fri', full: 'Friday' },
  { index: 6, short: 'Sat', full: 'Saturday' },
] as const;

export function DayOfWeekSelector({ value, onChange }: DayOfWeekSelectorProps) {
  function handleToggle(dayIndex: number, checked: boolean) {
    if (checked) {
      onChange([...value, dayIndex].sort((a, b) => a - b));
    } else {
      onChange(value.filter(d => d !== dayIndex));
    }
  }

  return (
    <fieldset>
      <legend className="text-sm font-semibold mb-2">Days of week</legend>
      <div className="flex flex-wrap gap-4">
        {DAYS.map((day) => {
          const isChecked = value.includes(day.index);
          return (
            <div key={day.index} className="flex items-center gap-2">
              <Checkbox
                id={`day-${day.index}`}
                checked={isChecked}
                onCheckedChange={(checked) => handleToggle(day.index, !!checked)}
                aria-label={day.full}
              />
              <Label htmlFor={`day-${day.index}`} className="text-sm cursor-pointer">
                {day.short}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
