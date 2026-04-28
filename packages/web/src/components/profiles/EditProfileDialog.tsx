import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import {
  updateProfileMetadataSchema,
  type UpdateProfileMetadata,
} from '@sms/shared';
import {
  useProfiles,
  useUpdateProfileMetadata,
} from '../../hooks/use-profiles';
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
import { Textarea } from '../ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface EditProfileDialogProps {
  profileId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_NOTES = 5000;
const WARN_THRESHOLD = 4500;

export function EditProfileDialog({
  profileId,
  open,
  onOpenChange,
}: EditProfileDialogProps) {
  const profilesQuery = useProfiles();
  const updateMutation = useUpdateProfileMetadata();

  const profile = useMemo(
    () => profilesQuery.data?.find((p) => p.id === profileId) ?? null,
    [profilesQuery.data, profileId],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<UpdateProfileMetadata>({
    resolver: zodResolver(updateProfileMetadataSchema),
    defaultValues: {
      displayName: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (open && profile) {
      reset({
        displayName: profile.displayName,
        notes: profile.notes ?? '',
      });
    }
  }, [open, profile, reset]);

  const notesValue = watch('notes') ?? '';
  const notesLength = notesValue.length;

  async function onSubmit(values: UpdateProfileMetadata) {
    if (!profileId) return;
    try {
      await updateMutation.mutateAsync({
        profileId,
        body: values,
      });
      toast.success('Profile updated.');
      onOpenChange(false);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Couldn't save profile: ${reason}`);
    }
  }

  function handleNotesChange(
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) {
    const raw = event.target.value;
    if (raw.length <= MAX_NOTES) {
      setValue('notes', raw, { shouldDirty: true });
      return;
    }
    // Paste or oversize entry — trim to the limit and notify.
    setValue('notes', raw.slice(0, MAX_NOTES), { shouldDirty: true });
    toast.info('Notes trimmed to 5000 characters.');
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
      updateMutation.reset();
    }
    onOpenChange(next);
  }

  const counterTone =
    notesLength >= MAX_NOTES
      ? 'text-destructive'
      : notesLength >= WARN_THRESHOLD
        ? 'text-warning'
        : '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Update the display name and private notes for this profile.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="edit-display-name">Display name</Label>
            <Input
              id="edit-display-name"
              {...register('displayName')}
              aria-invalid={errors.displayName ? 'true' : 'false'}
            />
            <p className="text-xs text-muted-foreground">
              The name shown in lists and notifications. Not visible on the platform.
            </p>
            {errors.displayName && (
              <p className="text-xs text-destructive" role="alert">
                {errors.displayName.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <p className="text-xs text-muted-foreground" id="edit-notes-helper">
              Markdown supported. Only visible to you. Max 5000 characters.
            </p>
            <Tabs defaultValue="write">
              <TabsList>
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="write">
                <Textarea
                  id="edit-notes"
                  rows={10}
                  value={notesValue}
                  onChange={handleNotesChange}
                  aria-label="Notes in Markdown"
                  aria-describedby="edit-notes-helper"
                  maxLength={MAX_NOTES}
                />
              </TabsContent>
              <TabsContent value="preview">
                <div
                  className="prose prose-sm max-w-none rounded-md border border-border p-3 min-h-[180px]"
                  data-testid="notes-preview"
                >
                  {notesValue.trim() === '' ? (
                    <p className="text-xs text-muted-foreground">
                      Nothing to preview yet.
                    </p>
                  ) : (
                    <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                      {notesValue}
                    </ReactMarkdown>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {notesLength >= WARN_THRESHOLD && (
              <p
                className={`text-xs ${counterTone}`}
                aria-live="polite"
              >
                {notesLength >= MAX_NOTES
                  ? `${MAX_NOTES} / ${MAX_NOTES} — limit reached`
                  : `${notesLength} / ${MAX_NOTES}`}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting || updateMutation.isPending}
            >
              Discard changes
            </Button>
            <Button
              type="submit"
              disabled={
                !isDirty ||
                isSubmitting ||
                updateMutation.isPending ||
                notesLength > MAX_NOTES
              }
            >
              {(isSubmitting || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
              )}
              {isSubmitting || updateMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
