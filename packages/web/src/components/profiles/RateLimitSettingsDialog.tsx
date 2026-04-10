import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { rateLimitUpdateSchema, type RateLimitUpdate } from '@sms/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useRateLimit, useUpdateRateLimit } from '../../hooks/use-rate-limit';

interface RateLimitSettingsDialogProps {
  profileId: string | null;
  handle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RateLimitSettingsDialog({
  profileId,
  handle,
  open,
  onOpenChange,
}: RateLimitSettingsDialogProps) {
  const rateLimitQuery = useRateLimit(open ? profileId : null);
  const updateMutation = useUpdateRateLimit();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RateLimitUpdate>({
    resolver: zodResolver(rateLimitUpdateSchema),
    defaultValues: {
      monthlyTweetBudget: 500,
      warnThresholdPercent: 80,
    },
  });

  useEffect(() => {
    if (rateLimitQuery.data) {
      reset({
        monthlyTweetBudget: rateLimitQuery.data.budget,
        warnThresholdPercent: rateLimitQuery.data.warnThresholdPercent,
      });
    }
  }, [rateLimitQuery.data, reset]);

  async function onSubmit(values: RateLimitUpdate) {
    if (!profileId) return;
    try {
      await updateMutation.mutateAsync({ profileId, body: values });
      toast.success('Rate limit updated.');
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save rate limit. Try again.");
    }
  }

  const currentCount = rateLimitQuery.data?.currentCount ?? 0;
  const budget = rateLimitQuery.data?.budget ?? 0;
  const percent = budget > 0 ? Math.round((currentCount / budget) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate Limit — @{handle}</DialogTitle>
          <DialogDescription>
            Configure the monthly tweet budget and when to show a warning banner.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {rateLimitQuery.data && (
            <p className="text-sm text-muted-foreground">
              Used this month: {currentCount} of {budget} ({percent}%)
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="monthly-tweet-budget">Monthly tweet budget</Label>
            <Input
              id="monthly-tweet-budget"
              type="number"
              min={1}
              max={10000}
              {...register('monthlyTweetBudget', { valueAsNumber: true })}
              aria-invalid={errors.monthlyTweetBudget ? 'true' : 'false'}
            />
            <p className="text-xs text-muted-foreground">
              Maximum tweets this profile can publish per calendar month (UTC). Twitter Free
              tier is 500; Basic is 3,000.
            </p>
            {errors.monthlyTweetBudget && (
              <p className="text-xs text-destructive" role="alert">
                Budget must be between 1 and 10,000.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="warn-threshold-percent">Warning threshold</Label>
            <div className="flex items-center gap-2">
              <Input
                id="warn-threshold-percent"
                type="number"
                min={1}
                max={99}
                {...register('warnThresholdPercent', { valueAsNumber: true })}
                aria-invalid={errors.warnThresholdPercent ? 'true' : 'false'}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Show a warning banner when usage reaches this percentage.
            </p>
            {errors.warnThresholdPercent && (
              <p className="text-xs text-destructive" role="alert">
                Threshold must be between 1 and 99.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || updateMutation.isPending}>
              {(isSubmitting || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Save Budget
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
