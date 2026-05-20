import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useQueue, useCreateQueue, useUpdateQueue, type QueueConfig } from '../../hooks/use-queues';
import { useProfiles } from '../../hooks/use-profiles';
import { ScheduleBuilder, type QueueFormValues } from '../../components/queues/ScheduleBuilder';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Skeleton } from '../../components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '../../components/ui/form';

const queueFormSchema = z.object({
  name: z.string().min(1, 'Queue name is required.').max(255),
  profileId: z.string().min(1, 'Select a social profile.'),
  intervalType: z.enum(['fixed', 'variable']),
  intervalValue: z.coerce.number().int().min(1, 'Interval must be at least 1.').max(999),
  intervalUnit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months', 'years']),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'Select at least one day of the week.'),
  hourSlots: z.array(z.number().int().min(6).max(23)).min(1, 'Select at least one hour window.'),
  startDate: z.string().optional(),
  seasonalStart: z.string().regex(/^\d{2}-\d{2}$/, 'Must be MM-DD format').optional().or(z.literal('')),
  seasonalEnd: z.string().regex(/^\d{2}-\d{2}$/, 'Must be MM-DD format').optional().or(z.literal('')),
  seasonalRepeat: z.boolean(),
  isRecycling: z.boolean(),
  notes: z.string().max(10000).optional(),
});

const DEFAULT_VALUES: QueueFormValues = {
  name: '',
  profileId: '',
  intervalType: 'fixed',
  intervalValue: 4,
  intervalUnit: 'hours',
  daysOfWeek: [1, 2, 3, 4, 5],
  hourSlots: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  startDate: undefined,
  seasonalStart: undefined,
  seasonalEnd: undefined,
  seasonalRepeat: false,
  isRecycling: false,
  notes: undefined,
};

type ApiValidationIssue = {
  path?: Array<string | number>;
  message?: string;
};

type ApiError = Error & {
  body?: {
    error?: unknown;
    details?: unknown;
  };
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Queue name',
  profileId: 'Social profile',
  intervalType: 'Interval type',
  intervalValue: 'Interval',
  intervalUnit: 'Interval unit',
  daysOfWeek: 'Days of week',
  hourSlots: 'Hour windows',
  startDate: 'Start date',
  seasonalStart: 'Seasonal start',
  seasonalEnd: 'Seasonal end',
  seasonalRepeat: 'Seasonal repeat',
  isRecycling: 'Recycle posts',
  notes: 'Internal notes',
};

function isApiValidationIssue(value: unknown): value is ApiValidationIssue {
  return value !== null && typeof value === 'object';
}

export function formatQueueSaveError(error: unknown): string {
  const apiError = error as ApiError;
  const details = apiError.body?.details;

  if (Array.isArray(details) && details.length > 0) {
    return details
      .filter(isApiValidationIssue)
      .slice(0, 3)
      .map((issue) => {
        const fieldName = issue.path?.[0];
        const label =
          typeof fieldName === 'string'
            ? FIELD_LABELS[fieldName] ?? fieldName
            : 'Queue settings';
        return `${label}: ${issue.message ?? 'Invalid value'}`;
      })
      .join(' ');
  }

  if (error instanceof Error && error.message) return error.message;
  return "Couldn't save queue. Try again.";
}

export default function QueueDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const isEditing = !!id;

  const { data: existingQueue, isLoading: isQueueLoading } = useQueue(id ?? '');
  const { data: profiles } = useProfiles();
  const createQueueMutation = useCreateQueue();
  const updateQueueMutation = useUpdateQueue();
  const [saveError, setSaveError] = useState<string | null>(null);

  const copiedConfig = (location.state as { copiedConfig?: QueueConfig } | null)?.copiedConfig;

  const form = useForm<QueueFormValues>({
    resolver: zodResolver(queueFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (isEditing && existingQueue) {
      form.reset({
        name: existingQueue.name,
        profileId: existingQueue.profileId,
        intervalType: existingQueue.intervalType as 'fixed' | 'variable',
        intervalValue: existingQueue.intervalValue,
        intervalUnit: existingQueue.intervalUnit as QueueFormValues['intervalUnit'],
        daysOfWeek: existingQueue.daysOfWeek,
        hourSlots: existingQueue.hourSlots,
        startDate: existingQueue.startDate ?? undefined,
        seasonalStart: existingQueue.seasonalStart ?? undefined,
        seasonalEnd: existingQueue.seasonalEnd ?? undefined,
        seasonalRepeat: existingQueue.seasonalRepeat,
        isRecycling: existingQueue.isRecycling,
        notes: existingQueue.notes ?? undefined,
      });
    }
  }, [isEditing, existingQueue]); // eslint-disable-line react-hooks/exhaustive-deps -- form.reset is stable

  useEffect(() => {
    if (!isEditing && copiedConfig) {
      form.reset({
        ...DEFAULT_VALUES,
        intervalType: copiedConfig.intervalType as 'fixed' | 'variable',
        intervalValue: copiedConfig.intervalValue,
        intervalUnit: copiedConfig.intervalUnit as QueueFormValues['intervalUnit'],
        daysOfWeek: copiedConfig.daysOfWeek,
        hourSlots: copiedConfig.hourSlots,
        startDate: copiedConfig.startDate ?? undefined,
        seasonalStart: copiedConfig.seasonalStart ?? undefined,
        seasonalEnd: copiedConfig.seasonalEnd ?? undefined,
        seasonalRepeat: copiedConfig.seasonalRepeat,
        isRecycling: copiedConfig.isRecycling,
      });
    }
  }, [copiedConfig, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps -- form.reset is stable

  const isSaving = createQueueMutation.isPending || updateQueueMutation.isPending;

  function onSubmit(values: QueueFormValues) {
    setSaveError(null);
    const payload = {
      ...values,
      seasonalStart: values.seasonalStart || undefined,
      seasonalEnd: values.seasonalEnd || undefined,
      notes: values.notes || undefined,
    };

    if (isEditing && id) {
      updateQueueMutation.mutate(
        { id, input: payload },
        {
          onSuccess: () => {
            setSaveError(null);
            toast.success('Queue updated.');
            navigate(`/queues/${id}/posts`);
          },
          onError: (error) => {
            setSaveError(formatQueueSaveError(error));
          },
        },
      );
    } else {
      createQueueMutation.mutate(payload, {
        onSuccess: (createdQueue) => {
          setSaveError(null);
          toast.success('Queue created.');
          navigate(`/queues/${createdQueue.id}/posts`);
        },
        onError: (error) => {
          setSaveError(formatQueueSaveError(error));
        },
      });
    }
  }

  if (isEditing && isQueueLoading) {
    return (
      <main className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-10 w-full" />
      </main>
    );
  }

  return (
    <main className="p-6 lg:p-8">
      <h1 className="text-2xl font-semibold mb-6">
        {isEditing ? 'Edit Queue' : 'Create Queue'}
      </h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
          {/* Queue name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Queue name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Daily tips, Weekly promos"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Social profile */}
          <FormField
            control={form.control}
            name="profileId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Social profile</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a profile" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {profiles?.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.displayName} (@{profile.handle})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Schedule builder */}
          <ScheduleBuilder control={form.control} watch={form.watch} />

          {/* Notes */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Internal notes</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Optional notes about this queue (not published)"
                    rows={3}
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {saveError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Queue was not saved</AlertTitle>
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Save Queue' : 'Create Queue'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </main>
  );
}
