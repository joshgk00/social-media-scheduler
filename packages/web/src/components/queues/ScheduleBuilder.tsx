import { useState } from 'react';
import { type Control, type UseFormWatch, Controller } from 'react-hook-form';
import { Repeat, Calendar } from 'lucide-react';
import { HourWindowGrid } from './HourWindowGrid';
import { DayOfWeekSelector } from './DayOfWeekSelector';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '../ui/form';

interface QueueFormValues {
  name: string;
  profileId: string;
  intervalType: 'fixed' | 'variable';
  intervalValue: number;
  intervalUnit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
  daysOfWeek: number[];
  hourSlots: number[];
  startDate?: string;
  seasonalStart?: string;
  seasonalEnd?: string;
  seasonalRepeat: boolean;
  isRecycling: boolean;
  notes?: string;
}

interface ScheduleBuilderProps {
  control: Control<QueueFormValues>;
  watch: UseFormWatch<QueueFormValues>;
}

const INTERVAL_UNITS = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
  { value: 'weeks', label: 'weeks' },
  { value: 'months', label: 'months' },
  { value: 'years', label: 'years' },
] as const;

export function ScheduleBuilder({ control, watch }: ScheduleBuilderProps) {
  const [isSeasonalExpanded, setIsSeasonalExpanded] = useState(false);
  const intervalType = watch('intervalType');

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Schedule</h2>

      {/* Interval configuration */}
      <div className="space-y-4">
        <FormField
          control={control}
          name="intervalType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Interval type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select interval type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="fixed">Fixed interval</SelectItem>
                  <SelectItem value="variable">Variable interval</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                {intervalType === 'fixed'
                  ? 'Posts go out at clock-aligned times (e.g., every 4 hours = 8am, 12pm, 4pm, 8pm).'
                  : 'Timer starts after the previous post publishes (e.g., 4 hours after last publish).'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-end gap-3">
          <FormField
            control={control}
            name="intervalValue"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Every</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="intervalUnit"
            render={({ field }) => (
              <FormItem className="flex-1">
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {INTERVAL_UNITS.map(unit => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Days of week */}
      <Controller
        control={control}
        name="daysOfWeek"
        render={({ field, fieldState }) => (
          <div>
            <DayOfWeekSelector value={field.value} onChange={field.onChange} />
            {fieldState.error && (
              <p className="text-sm font-medium text-destructive mt-2">
                {fieldState.error.message ?? 'Select at least one day of the week.'}
              </p>
            )}
          </div>
        )}
      />

      {/* Hour windows */}
      <Controller
        control={control}
        name="hourSlots"
        render={({ field, fieldState }) => (
          <div>
            <HourWindowGrid value={field.value} onChange={field.onChange} />
            {fieldState.error && (
              <p className="text-sm font-medium text-destructive mt-2">
                {fieldState.error.message ?? 'Select at least one hour window.'}
              </p>
            )}
          </div>
        )}
      />

      {/* Start date */}
      <FormField
        control={control}
        name="startDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              <Calendar className="inline h-4 w-4 mr-1" aria-hidden="true" />
              Start date
            </FormLabel>
            <FormControl>
              <Input
                type="date"
                value={field.value ? field.value.split('T')[0] : ''}
                onChange={(e) => {
                  const dateValue = e.target.value;
                  field.onChange(dateValue ? `${dateValue}T00:00:00.000Z` : undefined);
                }}
              />
            </FormControl>
            <FormDescription>
              Queue begins publishing on this date. Leave blank to start immediately.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Seasonal window */}
      <div className="space-y-3">
        {!isSeasonalExpanded ? (
          <button
            type="button"
            className="text-sm text-primary hover:underline"
            onClick={() => setIsSeasonalExpanded(true)}
          >
            Add seasonal window
          </button>
        ) : (
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Seasonal window</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => setIsSeasonalExpanded(false)}
              >
                Remove
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Queue only runs between these dates. Leave blank for year-round.
            </p>
            <div className="flex items-end gap-3">
              <FormField
                control={control}
                name="seasonalStart"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Start (MM-DD)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="01-01"
                        maxLength={5}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value || undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="seasonalEnd"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>End (MM-DD)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="12-31"
                        maxLength={5}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value || undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={control}
              name="seasonalRepeat"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Repeat annually</FormLabel>
                </FormItem>
              )}
            />
          </div>
        )}
      </div>

      {/* Recycling */}
      <FormField
        control={control}
        name="isRecycling"
        render={({ field }) => (
          <FormItem className="flex items-center gap-3">
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <div className="space-y-1">
              <FormLabel className="!mt-0 inline-flex items-center gap-1">
                <Repeat className="h-4 w-4" aria-hidden="true" />
                Recycle posts
              </FormLabel>
              <FormDescription>
                When all posts have published, start over from the first post.
              </FormDescription>
            </div>
          </FormItem>
        )}
      />
    </div>
  );
}

export type { QueueFormValues };
