import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePendingSelection,
  useFinalizeAsNew,
} from '../../hooks/use-oauth';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface ReconnectMismatchDialogProps {
  existingHandle: string;
  newHandle: string;
  tempToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReconnectMismatchDialog({
  existingHandle,
  newHandle,
  tempToken,
  open,
  onOpenChange,
}: ReconnectMismatchDialogProps) {
  const pendingQuery = usePendingSelection(open ? tempToken : null);
  const finalizeAsNew = useFinalizeAsNew();

  async function handleConnectAsNew() {
    if (!tempToken) return;
    // Re-peek the pending selection (valid for 15 minutes) to recover the
    // `platformAccountId` the user already picked in the prior dialog.
    const accounts = pendingQuery.data?.accounts ?? [];
    const platformAccountId = accounts[0]?.platformAccountId ?? null;
    try {
      await finalizeAsNew.mutateAsync({ tempToken, platformAccountId });
      toast.success('New profile connected.');
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Couldn't create profile: ${message}`);
    }
  }

  const description = `You authorized @${newHandle}, but the existing profile is @${existingHandle}. Reconnecting with a different account would replace the credentials and orphan the existing scheduled posts.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="mismatch-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle
              className="h-5 w-5 text-destructive"
              aria-hidden="true"
            />
            Different account detected
          </DialogTitle>
          <DialogDescription id="mismatch-description">
            {description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={finalizeAsNew.isPending}
          >
            Keep existing profile
          </Button>
          <Button
            type="button"
            onClick={handleConnectAsNew}
            disabled={finalizeAsNew.isPending || pendingQuery.isLoading}
          >
            {finalizeAsNew.isPending && (
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
            )}
            Connect as a new profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
