import { Loader2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { BulkPauseInput } from '@sms/shared';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';

const pauseResumeFormSchema = z.object({
  scope: z.enum(['scheduled-posts', 'queues', 'both']),
});
type PauseResumeFormValues = z.infer<typeof pauseResumeFormSchema>;

const scopeHelpers: Record<PauseResumeFormValues['scope'], string> = {
  'scheduled-posts': 'Posts move to "paused" status; their delayed jobs are removed. Resume re-enqueues at the original time.',
  queues: 'Queues are flagged as paused. The scheduler skips them until resumed.',
  both: 'Applies to every selected post and every queue containing those posts.',
};

export function BulkPauseResumeDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'pause' | 'resume';
  selectionCount: number;
  onConfirm: (values: Pick<BulkPauseInput, 'scope'>) => void;
  isPending?: boolean;
}) {
  const isPause = props.mode === 'pause';
  const form = useForm<PauseResumeFormValues>({
    resolver: zodResolver(pauseResumeFormSchema),
    defaultValues: { scope: 'scheduled-posts' },
  });
  const selectedScope = form.watch('scope');

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isPause ? `Pause publishing for ${props.selectionCount} ${props.selectionCount === 1 ? 'post' : 'posts'}?` : `Resume publishing for ${props.selectionCount} ${props.selectionCount === 1 ? 'post' : 'posts'}?`}</DialogTitle>
          <DialogDescription>Choose which schedules to {isPause ? 'pause' : 'resume'}. You can {isPause ? 'resume' : 'pause'} any time.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => props.onConfirm(values))}>
            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What to {isPause ? 'pause' : 'resume'}</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="space-y-2"
                      disabled={props.isPending}
                    >
                      <Label className="flex items-center gap-2 rounded-md border px-3 py-2 font-normal">
                        <RadioGroupItem value="scheduled-posts" />
                        Scheduled posts only
                      </Label>
                      <Label className="flex items-center gap-2 rounded-md border px-3 py-2 font-normal">
                        <RadioGroupItem value="queues" />
                        Queues only
                      </Label>
                      <Label className="flex items-center gap-2 rounded-md border px-3 py-2 font-normal">
                        <RadioGroupItem value="both" />
                        Scheduled posts and queues
                      </Label>
                    </RadioGroup>
                  </FormControl>
                  <FormDescription>{scopeHelpers[selectedScope]}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.isPending}>
                {isPause ? "Don't Pause" : "Don't Resume"}
              </Button>
              <Button type="submit" disabled={props.isPending}>
                {props.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {isPause ? 'Pause Publishing' : 'Resume Publishing'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
