import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createSnippetSchema, type CreateSnippetInput } from '@sms/shared';
import type { Snippet } from '../../hooks/use-snippets';
import { useCreateSnippet, useUpdateSnippet } from '../../hooks/use-snippets';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Textarea } from '../ui/textarea';

interface SnippetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snippet?: Snippet;
}

const INITIAL_VALUES: CreateSnippetInput = {
  name: '',
  category: 'text',
  body: '',
};

export function SnippetFormDialog({ open, onOpenChange, snippet }: SnippetFormDialogProps) {
  const createSnippetMutation = useCreateSnippet();
  const updateSnippetMutation = useUpdateSnippet();
  const isEditMode = !!snippet;
  const activeMutation = isEditMode ? updateSnippetMutation : createSnippetMutation;

  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateSnippetInput>({
    resolver: zodResolver(createSnippetSchema),
    defaultValues: INITIAL_VALUES,
  });

  useEffect(() => {
    if (!open) {
      reset(INITIAL_VALUES);
      activeMutation.reset();
      return;
    }

    if (snippet) {
      reset({
        name: snippet.name,
        category: snippet.category,
        body: snippet.body,
      });
      return;
    }

    reset(INITIAL_VALUES);
  }, [activeMutation, open, reset, snippet]);

  async function onSubmit(values: CreateSnippetInput) {
    try {
      if (snippet) {
        await updateSnippetMutation.mutateAsync({ id: snippet.id, input: values });
        toast.success(`Snippet "${values.name}" updated.`);
      } else {
        await createSnippetMutation.mutateAsync(values);
        toast.success(`Snippet "${values.name}" created.`);
      }
      onOpenChange(false);
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : undefined;
      if (status === 409) {
        setError('name', { message: 'A snippet with that name already exists.' });
        return;
      }

      toast.error(
        snippet
          ? `Couldn't update snippet.`
          : `Couldn't create snippet.`,
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{snippet ? 'Update snippet' : 'Create snippet'}</DialogTitle>
          <DialogDescription>
            Save reusable text and hashtag sets to insert into any post.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-2">
            <Label htmlFor="snippet-name">Name</Label>
            <Input
              id="snippet-name"
              {...register('name')}
              aria-invalid={errors.name ? 'true' : 'false'}
            />
            <p className="text-xs text-muted-foreground">
              Used to find this snippet in the picker. Must be unique.
            </p>
            {errors.name ? (
              <p className="text-sm font-medium text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-3">
            <Label>Category</Label>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <Label
                    htmlFor="snippet-category-hashtag"
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3"
                  >
                    <RadioGroupItem id="snippet-category-hashtag" value="hashtag_set" />
                    <span>
                      <span className="block text-sm font-medium text-foreground">Hashtag set</span>
                      <span className="block text-xs text-muted-foreground">Grouped tags or short CTA endings.</span>
                    </span>
                  </Label>
                  <Label
                    htmlFor="snippet-category-text"
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3"
                  >
                    <RadioGroupItem id="snippet-category-text" value="text" />
                    <span>
                      <span className="block text-sm font-medium text-foreground">Text snippet</span>
                      <span className="block text-xs text-muted-foreground">Reusable paragraphs, links, or promo copy.</span>
                    </span>
                  </Label>
                </RadioGroup>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="snippet-body">Content</Label>
            <Textarea
              id="snippet-body"
              rows={6}
              className="font-mono"
              {...register('body')}
              aria-invalid={errors.body ? 'true' : 'false'}
            />
            <p className="text-xs text-muted-foreground">
              Inserted at the cursor when this snippet is picked. Supports any text — emoji, URLs, hashtags.
            </p>
            {errors.body ? (
              <p className="text-sm font-medium text-destructive">{errors.body.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting || activeMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || activeMutation.isPending}>
              {isSubmitting || activeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {snippet ? 'Update snippet' : 'Create snippet'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
