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
  // The `platformAccountId` the user picked in the preceding picker dialog.
  // Threaded through so "Connect as a new profile" persists that selection
  // rather than blindly defaulting to `accounts[0]` (which is always Personal
  // Profile for LinkedIn or the first page for Facebook). See CR-01.
  platformAccountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReconnectMismatchDialog({
  existingHandle,
  newHandle,
  tempToken,
  platformAccountId,
  open,
  onOpenChange,
}: ReconnectMismatchDialogProps) {
  const pendingQuery = usePendingSelection(open ? tempToken : null);
  const finalizeAsNew = useFinalizeAsNew();

  async function handleConnectAsNew() {
    if (!tempToken) return;
    // Prefer the selection the user made in the preceding picker. Fall back to
    // the first account only when no selection context exists (e.g. the
    // mismatch dialog was opened directly from an `oauth_error` query param).
    const accounts = pendingQuery.data?.accounts ?? [];
    const resolvedAccountId = platformAccountId ?? accounts[0]?.platformAccountId;
    // CR-08: server's finalizeAsNewSchema requires a non-empty
    // platformAccountId. If neither the picker selection nor a fallback
    // account is available we can't satisfy the contract — surface a toast
    // instead of letting the request 400.
    if (!resolvedAccountId) {
      toast.error("Couldn't create profile: no account available to attach.");
      return;
    }
    try {
      await finalizeAsNew.mutateAsync({
        tempToken,
        platformAccountId: resolvedAccountId,
      });
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
