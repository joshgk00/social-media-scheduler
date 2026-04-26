import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useDeletePreview,
  useDeleteProfile,
  useProfiles,
  type DeletePreview,
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
import { Skeleton } from '../ui/skeleton';

interface DeleteProfileDialogProps {
  profileId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CascadeLine {
  count: number;
  copy: string;
}

function buildCascadeLines(preview: DeletePreview): CascadeLine[] {
  const lines: CascadeLine[] = [
    { count: preview.drafts, copy: `${preview.drafts} draft posts will be deleted` },
    {
      count: preview.scheduled,
      copy: `${preview.scheduled} scheduled posts will be deleted`,
    },
    {
      count: preview.queueMemberships,
      copy: `${preview.queueMemberships} queue memberships will be removed`,
    },
    {
      count: preview.tagsLosingLastUse,
      copy: `${preview.tagsLosingLastUse} tags will have no remaining profile`,
    },
  ];
  return lines.filter((line) => line.count > 0);
}

export function DeleteProfileDialog({
  profileId,
  open,
  onOpenChange,
}: DeleteProfileDialogProps) {
  const profilesQuery = useProfiles();
  const previewQuery = useDeletePreview(open ? profileId : null);
  const deleteProfile = useDeleteProfile();

  const profile = useMemo(
    () => profilesQuery.data?.find((p) => p.id === profileId) ?? null,
    [profilesQuery.data, profileId],
  );

  const preview = previewQuery.data;
  const cascadeLines = preview ? buildCascadeLines(preview) : [];
  const hasInFlight = (preview?.inFlight ?? 0) > 0;

  async function handleDelete() {
    if (!profileId) return;
    try {
      await deleteProfile.mutateAsync(profileId);
      toast.success('Profile deleted.');
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Couldn't delete profile: ${message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete profile?</DialogTitle>
          <DialogDescription>
            {profile ? (
              <>
                This permanently removes <strong>{profile.displayName}</strong>{' '}
                (@{profile.handle}) and the stored OAuth credentials.
              </>
            ) : (
              'This permanently removes the profile and stored OAuth credentials.'
            )}
          </DialogDescription>
        </DialogHeader>

        {previewQuery.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-5 w-3/4" data-testid="skeleton" />
            <Skeleton className="h-5 w-2/3" data-testid="skeleton" />
          </div>
        )}

        {previewQuery.isError && (
          <p className="text-sm text-destructive" role="alert">
            Couldn't load cascade preview. Try again.
          </p>
        )}

        {preview && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">The following will also be affected:</p>
            {cascadeLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No posts, queues, or tags are affected.
              </p>
            ) : (
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                {cascadeLines.map((line) => (
                  <li key={line.copy}>{line.copy}</li>
                ))}
              </ul>
            )}
            {hasInFlight && (
              <p className="text-sm text-destructive" role="alert">
                Can't delete: {preview.inFlight} posts are currently publishing or
                auto-destructing. Wait for them to finish and try again.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteProfile.isPending}
          >
            Keep profile
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={
              !preview ||
              hasInFlight ||
              deleteProfile.isPending ||
              previewQuery.isLoading
            }
          >
            {deleteProfile.isPending && (
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
            )}
            Delete profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
