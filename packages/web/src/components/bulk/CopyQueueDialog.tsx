import { Loader2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { QueueCopyInput } from '@sms/shared';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';

const copyQueueFormSchema = z.object({
  targetQueueId: z.string().uuid('Select a target queue.'),
  randomizeAfter: z.boolean(),
});

export function CopyQueueDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceQueueName: string;
  postCount: number;
  queues: Array<{ id: string; name: string }>;
  onConfirm: (input: QueueCopyInput) => void;
  isPending?: boolean;
}) {
  const form = useForm<QueueCopyInput>({
    resolver: zodResolver(copyQueueFormSchema),
    defaultValues: { targetQueueId: '', randomizeAfter: false },
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Copy posts from "${props.sourceQueueName}"`}</DialogTitle>
          <DialogDescription>
            Copies {props.postCount} posts to a target queue on the same profile. Tags, spinnable text, and auto-destruct settings travel with each post.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => props.onConfirm(values))}>
            <FormField
              control={form.control}
              name="targetQueueId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target queue</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={props.isPending}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a queue" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {props.queues.map((queue) => (
                        <SelectItem key={queue.id} value={queue.id}>
                          {queue.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Only queues for the same profile are listed.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="randomizeAfter"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <FormLabel className="leading-normal">Randomize the target queue after copy</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={props.isPending} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.isPending}>
                Don't Copy
              </Button>
              <Button type="submit" disabled={props.isPending || props.queues.length === 0}>
                {props.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Copy Posts
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
