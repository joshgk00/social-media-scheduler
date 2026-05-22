import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Control, type UseFormWatch, Controller, useFormContext, useWatch } from 'react-hook-form';
import { Clock, Grid3X3, Plus, RefreshCw, Repeat, X, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { HourWindowGrid } from './HourWindowGrid';
import { DayOfWeekSelector } from './DayOfWeekSelector';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Icon } from '../ui/icon';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  NativeSelect,
} from '../ui/native-select';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '../ui/form';
import {
  daySummary,
  formatPreviewDistance,
  hourToTime,
  nextPublishPreview,
  type ScheduleMode,
} from '../../lib/queue-schedule';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/use-auth';

export interface QueueFormValues {
  name: string;
  profileId: string;
  scheduleMode: ScheduleMode;
  specificTimes: string[];
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

const modeCards = [
  {
    value: 'specific',
    title: 'Specific times',
    hint: 'Pick days and exact times. E.g. Mon-Fri at 8am, noon, 3pm.',
    icon: Clock,
    recommended: true,
  },
  {
    value: 'fixed',
    title: 'Fixed interval',
    hint: 'Clock-aligned slots: every 4h fires at 04/08/12/16/20.',
    icon: Grid3X3,
    recommended: false,
  },
  {
    value: 'variable',
    title: 'Variable interval',
    hint: 'N hours after the last publish, regardless of clock.',
    icon: RefreshCw,
    recommended: false,
  },
] as const;

const intervalUnits = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
  { value: 'weeks', label: 'weeks' },
  { value: 'months', label: 'months' },
  { value: 'years', label: 'years' },
] as const;

export function ScheduleBuilder({ control, watch }: ScheduleBuilderProps) {
  const form = useFormContext<QueueFormValues>();
  const { data: user } = useAuth();
  const modeButtonRefs = useRef<Record<ScheduleMode, HTMLButtonElement | null>>({
    specific: null,
    fixed: null,
    variable: null,
  });
  const mode = watch('scheduleMode');
  const days = watch('daysOfWeek') ?? [];
  const times = watch('specificTimes') ?? [];
  const intervalValue = watch('intervalValue');
  const intervalUnit = watch('intervalUnit');
  const hourSlots = watch('hourSlots') ?? [];
  const previewTimeZone = user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const preview = useMemo(
    () =>
      nextPublishPreview({
        mode,
        times,
        days,
        every: intervalValue,
        unit: intervalUnit,
        hourWindows: mode === 'specific' ? [] : hourSlots,
        timeZone: previewTimeZone,
      }),
    [days, hourSlots, intervalUnit, intervalValue, mode, previewTimeZone, times],
  );
  const previewTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: previewTimeZone,
        timeZoneName: 'short',
      }),
    [previewTimeZone],
  );

  function selectMode(nextMode: ScheduleMode, shouldFocus = false) {
    form.setValue('scheduleMode', nextMode, { shouldDirty: true, shouldValidate: true });
    form.setValue('intervalType', nextMode === 'variable' ? 'variable' : 'fixed', {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (nextMode === 'specific' && times.length === 0) {
      form.setValue('specificTimes', ['08:00', '12:00', '15:00'], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    if (shouldFocus) {
      window.requestAnimationFrame(() => modeButtonRefs.current[nextMode]?.focus());
    }
  }

  function handleModeKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    const keyOffsets: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    const offset = keyOffsets[event.key];
    if (!offset) return;

    event.preventDefault();
    const nextIndex = (currentIndex + offset + modeCards.length) % modeCards.length;
    selectMode(modeCards[nextIndex].value, true);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Card title="When should this queue publish?" padded>
          <div className="space-y-5">
            <div>
              <p
                id="schedule-mode-label"
                className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground"
              >
                Schedule mode
              </p>
              <div
                role="radiogroup"
                aria-labelledby="schedule-mode-label"
                className="grid gap-2 md:grid-cols-3"
              >
                {modeCards.map((card, index) => {
                  const isSelected = mode === card.value;
                  return (
                    <button
                      key={card.value}
                      ref={(node) => {
                        modeButtonRefs.current[card.value] = node;
                      }}
                      type="button"
                      role="radio"
                      className={cn(
                        "relative rounded-md border bg-[var(--bg-elevated)] p-3 text-left transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]",
                        isSelected && "border-[var(--brand-accent)] bg-[var(--brand-accent-soft)]",
                      )}
                      onClick={() => selectMode(card.value)}
                      onKeyDown={(event) => handleModeKeyDown(event, index)}
                      aria-checked={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                    >
                      {card.recommended && (
                        <span className="absolute right-2 top-2 rounded-full bg-[var(--brand-accent-soft)] px-2 py-0.5 text-[9px] font-bold uppercase text-[var(--brand-accent)]">
                          Recommended
                        </span>
                      )}
                      <Icon icon={card.icon} size={15} className="text-[var(--brand-accent)]" />
                      <p className="mt-4 text-sm font-semibold text-foreground">{card.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === 'specific' ? (
              <SpecificTimes control={control} />
            ) : (
              <IntervalConfig control={control} mode={mode} />
            )}
          </div>
        </Card>

        <Card title="Advanced" padded>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? field.value.split('T')[0] : ''}
                      onChange={(event) => field.onChange(event.target.value || undefined)}
                    />
                  </FormControl>
                  <FormDescription>Leave blank to start immediately.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="isRecycling"
              render={({ field }) => (
                <FormItem className="flex items-start gap-3 pt-6">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel className="!mt-0 inline-flex items-center gap-1">
                      <Repeat className="h-4 w-4" aria-hidden="true" />
                      Recycle posts
                    </FormLabel>
                    <FormDescription>
                      When the queue runs out, start over from the first post.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </Card>
      </div>

      <Card
        className="h-max lg:sticky lg:top-24"
        title={
          <span className="inline-flex items-center gap-2">
            <Icon icon={Zap} size={14} className="text-[var(--brand-accent)]" />
            Live preview
          </span>
        }
        padded
      >
        <p className="mb-4 text-xs text-muted-foreground">
          Next 5 publish times based on your current settings.
        </p>
        {preview.length === 0 ? (
          <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
            Nothing scheduled - pick at least one day and one time.
          </div>
        ) : (
          <div className="space-y-3">
            {preview.map((date, index) => (
              <div key={date.toISOString()} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent-soft)] text-xs font-semibold text-[var(--brand-accent)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{format(date, 'EEE, MMM d')}</p>
                  <p className="mono text-xs text-muted-foreground">
                    {previewTimeFormatter.format(date)}
                  </p>
                </div>
                <span className="mono text-xs text-muted-foreground">
                  {formatPreviewDistance(date)}
                </span>
              </div>
            ))}
            <p className="border-t pt-3 text-xs text-muted-foreground">
              {mode === 'specific'
                ? `${days.length} days x ${times.length} times = ~${days.length * times.length} posts/week`
                : `${daySummary(days)} within ${hourSlots.length} selected hour windows${
                    intervalUnit === 'minutes'
                      ? `; preview shows the first opportunity in each hour window, while the queue can run every ${intervalValue || 1} minutes within those windows`
                      : ''
                  }`}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function SpecificTimes({ control }: { control: Control<QueueFormValues> }) {
  const specificTimes = useWatch({ control, name: 'specificTimes' }) ?? [];
  const nextTimeIdRef = useRef(specificTimes.length);
  const [timeIds, setTimeIds] = useState(() =>
    specificTimes.map((_, index) => `specific-time-${index}`),
  );

  const createTimeId = useCallback(() => {
    const nextId = `specific-time-${nextTimeIdRef.current}`;
    nextTimeIdRef.current += 1;
    return nextId;
  }, []);

  useEffect(() => {
    setTimeIds((current) => {
      if (current.length === specificTimes.length) {
        return current;
      }

      if (current.length > specificTimes.length) {
        return current.slice(0, specificTimes.length);
      }

      return [
        ...current,
        ...Array.from(
          { length: specificTimes.length - current.length },
          () => createTimeId(),
        ),
      ];
    });
  }, [createTimeId, specificTimes.length]);

  return (
    <div className="space-y-5">
      <Controller
        control={control}
        name="specificTimes"
        render={({ field, fieldState }) => {
          return (
            <div>
              <Label className="text-sm font-semibold">Publish times</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {field.value.map((time, index) => (
                  <span
                    key={timeIds[index] ?? `specific-time-pending-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border bg-[var(--bg-elevated)] p-1"
                  >
                    <Input
                      aria-label={`Publish time ${index + 1}`}
                      type="time"
                      step={3600}
                      value={time}
                      className="h-8 w-[112px]"
                      onChange={(event) => {
                        const next = [...field.value];
                        next[index] = event.target.value;
                        field.onChange(next);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Remove publish time ${time}`}
                      onClick={() => {
                        setTimeIds((current) => current.filter((_, itemIndex) => itemIndex !== index));
                        field.onChange(field.value.filter((_, itemIndex) => itemIndex !== index));
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-dashed"
                  onClick={() => {
                    setTimeIds((current) => [...current, createTimeId()]);
                    field.onChange([...field.value, hourToTime(9)]);
                  }}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add time
                </Button>
              </div>
              {fieldState.error && (
                <p className="mt-2 text-sm font-medium text-destructive">
                  {fieldState.error.message ?? 'Add at least one publish time.'}
                </p>
              )}
            </div>
          );
        }}
      />
      <Controller
        control={control}
        name="daysOfWeek"
        render={({ field, fieldState }) => (
          <div>
            <DayOfWeekSelector value={field.value} onChange={field.onChange} />
            {fieldState.error && (
              <p className="mt-2 text-sm font-medium text-destructive">
                {fieldState.error.message ?? 'Select at least one day of the week.'}
              </p>
            )}
          </div>
        )}
      />
    </div>
  );
}

function IntervalConfig({ control, mode }: { control: Control<QueueFormValues>; mode: ScheduleMode }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <FormField
          control={control}
          name="intervalValue"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{mode === 'variable' ? 'Wait' : 'Every'}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  {...field}
                  onChange={(event) => field.onChange(Number(event.target.value))}
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
            <FormItem>
              <FormLabel>Unit</FormLabel>
              <NativeSelect
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
              >
                {intervalUnits.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </NativeSelect>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <Controller
        control={control}
        name="daysOfWeek"
        render={({ field, fieldState }) => (
          <div>
            <DayOfWeekSelector value={field.value} onChange={field.onChange} />
            {fieldState.error && (
              <p className="mt-2 text-sm font-medium text-destructive">
                {fieldState.error.message ?? 'Select at least one day of the week.'}
              </p>
            )}
          </div>
        )}
      />
      <Controller
        control={control}
        name="hourSlots"
        render={({ field, fieldState }) => (
          <div>
            <HourWindowGrid value={field.value} onChange={field.onChange} />
            {fieldState.error && (
              <p className="mt-2 text-sm font-medium text-destructive">
                {fieldState.error.message ?? 'Select at least one hour window.'}
              </p>
            )}
          </div>
        )}
      />
    </div>
  );
}
