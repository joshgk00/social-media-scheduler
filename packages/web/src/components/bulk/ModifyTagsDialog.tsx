import { Loader2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { BulkModifyTagsInput } from '@sms/shared';
import type { Tag } from '../../hooks/use-tags';
import { TagSelector } from '../posts/TagSelector';
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
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

const modifyTagsFormSchema = z.object({
  mode: z.enum(['add', 'replace']),
  tagIds: z.array(z.string().uuid()).min(1, 'Select at least one tag.'),
});

type ModifyTagsFormValues = z.infer<typeof modifyTagsFormSchema>;

export function ModifyTagsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectionCount: number;
  tags: Tag[];
  onManageTags: () => void;
  onConfirm: (input: Pick<BulkModifyTagsInput, 'mode' | 'tagIds'>) => void;
  isPending?: boolean;
}) {
  const form = useForm<ModifyTagsFormValues>({
    resolver: zodResolver(modifyTagsFormSchema),
    defaultValues: { mode: 'add', tagIds: [] },
  });
  const mode = form.watch('mode');

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Modify tags on ${props.selectionCount} ${props.selectionCount === 1 ? 'post' : 'posts'}`}</DialogTitle>
          <DialogDescription>Add or replace tags on every selected post.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => props.onConfirm(values))}>
            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mode</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="space-y-2" disabled={props.isPending}>
                      <Label className="flex items-center gap-2 rounded-md border px-3 py-2 font-normal">
                        <RadioGroupItem value="add" />
                        Add tags to existing
                      </Label>
                      <Label className="flex items-center gap-2 rounded-md border px-3 py-2 font-normal">
                        <RadioGroupItem value="replace" />
                        Replace existing tags
                      </Label>
                    </RadioGroup>
                  </FormControl>
                  {mode === 'replace' && <FormDescription>Existing tags on these posts will be removed.</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tagIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <TagSelector selected={field.value} onChange={field.onChange} onManage={props.onManageTags} tags={props.tags} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.isPending}>
                Discard Changes
              </Button>
              <Button type="submit" disabled={props.isPending}>
                {props.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Apply Tags
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
