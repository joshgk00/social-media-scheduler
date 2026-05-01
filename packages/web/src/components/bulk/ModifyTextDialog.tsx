import { Loader2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { QueueTextModifyInput } from '@sms/shared';
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
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

const modifyTextFormSchema = z
  .object({
    mode: z.enum(['append', 'remove', 'replace']),
    text: z.string(),
    separator: z.string(),
    find: z.string(),
    replace: z.string(),
  })
  .superRefine((values, context) => {
    if (values.mode === 'append' && !values.text?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['text'], message: 'Enter text to append.' });
    }
    if (values.mode === 'remove' && !values.text?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['text'], message: 'Enter text to remove.' });
    }
    if (values.mode === 'replace' && !values.find?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['find'], message: 'Enter the text to find.' });
    }
  });

type ModifyTextFormValues = z.infer<typeof modifyTextFormSchema>;

function toQueueTextModifyInput(values: ModifyTextFormValues): QueueTextModifyInput {
  if (values.mode === 'replace') {
    return { mode: 'replace', find: values.find ?? '', replace: values.replace ?? '' };
  }
  if (values.mode === 'remove') {
    return { mode: 'remove', text: values.text ?? '' };
  }
  return { mode: 'append', text: values.text ?? '', separator: values.separator || ' ' };
}

export function ModifyTextDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueName: string;
  postCount: number;
  onConfirm: (input: QueueTextModifyInput) => void;
  isPending?: boolean;
}) {
  const form = useForm<ModifyTextFormValues>({
    resolver: zodResolver(modifyTextFormSchema),
    defaultValues: { mode: 'append', text: '', separator: ' ', find: '', replace: '' },
  });
  const mode = form.watch('mode');

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Modify text in "${props.queueName}"`}</DialogTitle>
          <DialogDescription>
            Edit text across all {props.postCount} posts in this queue. Operates on raw text, including spin syntax. Posts that exceed the platform character cap after editing will be skipped.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => props.onConfirm(toQueueTextModifyInput(values)))}>
            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mode</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2 sm:grid-cols-3" disabled={props.isPending}>
                      <Label className="flex items-center gap-2 rounded-md border px-3 py-2 font-normal">
                        <RadioGroupItem value="append" />
                        Append
                      </Label>
                      <Label className="flex items-center gap-2 rounded-md border px-3 py-2 font-normal">
                        <RadioGroupItem value="remove" />
                        Remove
                      </Label>
                      <Label className="flex items-center gap-2 rounded-md border px-3 py-2 font-normal">
                        <RadioGroupItem value="replace" />
                        Replace
                      </Label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {mode === 'append' && (
              <>
                <FormField
                  control={form.control}
                  name="text"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Text to append</FormLabel>
                      <FormControl><Input {...field} disabled={props.isPending} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="separator"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Separator</FormLabel>
                      <FormControl><Input {...field} disabled={props.isPending} /></FormControl>
                      <FormDescription>Inserted between existing text and appended text. Defaults to a single space.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            {mode === 'remove' && (
              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Text to remove</FormLabel>
                    <FormControl><Input {...field} disabled={props.isPending} /></FormControl>
                    <FormDescription>Removes every literal occurrence (case-sensitive).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {mode === 'replace' && (
              <>
                <FormField
                  control={form.control}
                  name="find"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Find</FormLabel>
                      <FormControl><Input {...field} disabled={props.isPending} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="replace"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Replace with</FormLabel>
                      <FormControl><Input {...field} disabled={props.isPending} /></FormControl>
                      <FormDescription>Literal find-and-replace. Case-sensitive. Regex is not supported.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.isPending}>
                Discard Changes
              </Button>
              <Button type="submit" disabled={props.isPending}>
                {props.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Apply Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
