import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePendingSelection,
  useFinalizeOAuthConnection,
  MismatchedAccountError,
  type PendingAccountOption,
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
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';

export interface MismatchPayload {
  existingHandle: string;
  incomingHandle: string;
  tempToken: string;
}

interface PageOrgPickerDialogProps {
  tempToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMismatch?: (payload: MismatchPayload) => void;
  onSuccess?: () => void;
}

function describeAccount(
  platform: 'twitter' | 'linkedin' | 'facebook',
  account: PendingAccountOption,
): { title: string; sub?: string } {
  if (platform === 'linkedin') {
    if (account.kind === 'organization') {
      return {
        title: `${account.orgName ?? account.displayName} — Company Page`,
      };
    }
    return { title: `${account.displayName} — Personal Profile` };
  }
  if (platform === 'facebook') {
    const count = account.followerCount;
    const followers =
      typeof count === 'number' ? ` (${count} followers)` : '';
    return { title: `${account.pageName ?? account.displayName}${followers}` };
  }
  return { title: account.displayName };
}

function buildTitle(
  platform: 'twitter' | 'linkedin' | 'facebook',
  accounts: PendingAccountOption[],
): string {
  if (platform === 'facebook') return 'Pick a Facebook Page';
  if (platform === 'linkedin' && accounts.length === 1) {
    return 'Confirm LinkedIn connection';
  }
  return 'Pick a LinkedIn account';
}

function buildEmptyCopy(platform: 'twitter' | 'linkedin' | 'facebook'): string {
  if (platform === 'facebook') {
    return 'No Facebook Pages found. You need Admin access to at least one Page.';
  }
  return 'No LinkedIn accounts you can post to. Grant your account posting permission and reconnect.';
}

export function PageOrgPickerDialog({
  tempToken,
  open,
  onOpenChange,
  onMismatch,
  onSuccess,
}: PageOrgPickerDialogProps) {
  const pendingQuery = usePendingSelection(open ? tempToken : null);
  const finalize = useFinalizeOAuthConnection();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const platform = pendingQuery.data?.platform;
  const accounts = pendingQuery.data?.accounts ?? [];

  useEffect(() => {
    if (accounts.length === 1 && selectedId === null) {
      // Auto-select the single option so Finalize is immediately actionable.
      setSelectedId(accounts[0].platformAccountId ?? '__personal__');
    }
  }, [accounts, selectedId]);

  function reset() {
    setSelectedId(null);
    finalize.reset();
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFinalize() {
    if (!tempToken || !selectedId) return;
    try {
      const platformAccountId =
        selectedId === '__personal__' ? null : selectedId;
      await finalize.mutateAsync({ tempToken, platformAccountId });
      const selected = accounts.find(
        (a) => (a.platformAccountId ?? '__personal__') === selectedId,
      );
      toast.success(`${selected?.displayName ?? 'Profile'} connected.`);
      onSuccess?.();
      handleOpenChange(false);
    } catch (err) {
      if (err instanceof MismatchedAccountError) {
        onMismatch?.({
          existingHandle: err.existingHandle,
          incomingHandle: err.incomingHandle,
          tempToken: err.tempToken,
        });
        handleOpenChange(false);
        return;
      }
      toast.error("Couldn't finalize the connection. Try again.");
    }
  }

  const isLoading = pendingQuery.isLoading;
  const isSubmitting = finalize.isPending;
  const isEmpty = !isLoading && accounts.length === 0 && !pendingQuery.isError;
  const hasError = pendingQuery.isError;
  const selectedAccount = accounts.find(
    (a) => (a.platformAccountId ?? '__personal__') === selectedId,
  );
  const finalizeLabel =
    selectedAccount !== undefined
      ? `Connect ${selectedAccount.displayName}`
      : 'Connect';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-busy={isLoading}>
        <DialogHeader>
          <DialogTitle>
            {platform ? buildTitle(platform, accounts) : 'Connect profile'}
          </DialogTitle>
          <DialogDescription>
            Connect one account per click. You can repeat this flow to add more.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div
            className="space-y-2"
            aria-live="polite"
            aria-label="Loading your accounts"
          >
            <Skeleton className="h-12 rounded-md" data-testid="skeleton" />
            <Skeleton className="h-12 rounded-md" data-testid="skeleton" />
            <Skeleton className="h-12 rounded-md" data-testid="skeleton" />
            <p className="text-sm text-muted-foreground">Loading your accounts…</p>
          </div>
        )}

        {hasError && (
          <p className="text-sm text-destructive" role="alert">
            Couldn't load your accounts. Try again or go back.
          </p>
        )}

        {isEmpty && platform && (
          <p className="text-sm text-muted-foreground">{buildEmptyCopy(platform)}</p>
        )}

        {!isLoading && !isEmpty && !hasError && accounts.length > 0 && platform && (
          <ScrollArea className="max-h-[320px]">
            <RadioGroup
              value={selectedId ?? ''}
              onValueChange={setSelectedId}
              aria-label="Account list"
            >
              {accounts.map((account) => {
                const id = account.platformAccountId ?? '__personal__';
                const { title } = describeAccount(platform, account);
                return (
                  <div
                    key={id}
                    className="flex items-center gap-3 rounded-md border border-border p-3"
                  >
                    <RadioGroupItem value={id} id={`account-${id}`} />
                    <Label htmlFor={`account-${id}`} className="flex-1 cursor-pointer">
                      {title}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Go back
          </Button>
          {!isEmpty && (
            <Button
              type="button"
              onClick={handleFinalize}
              disabled={!selectedId || isSubmitting || isLoading}
            >
              {isSubmitting && (
                <Loader2
                  className="h-4 w-4 animate-spin mr-2"
                  aria-hidden="true"
                />
              )}
              {isSubmitting ? 'Connecting…' : finalizeLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
