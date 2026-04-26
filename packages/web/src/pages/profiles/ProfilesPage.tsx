import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router';
import {
  useProfiles,
  useReconnectProfile,
  type Platform,
  type SocialProfile,
} from '../../hooks/use-profiles';
import { ConnectProfileDialog } from '../../components/profiles/ConnectProfileDialog';
import { ProfileCard } from '../../components/profiles/ProfileCard';
import { ProfileRateLimitIndicator } from '../../components/profiles/ProfileRateLimitIndicator';
import { RateLimitSettingsDialog } from '../../components/profiles/RateLimitSettingsDialog';
import {
  ProfileNetworkFilter,
  type NetworkFilterValue,
} from '../../components/profiles/ProfileNetworkFilter';
import { PageOrgPickerDialog } from '../../components/profiles/PageOrgPickerDialog';
import { EditProfileDialog } from '../../components/profiles/EditProfileDialog';
import { DeleteProfileDialog } from '../../components/profiles/DeleteProfileDialog';
import { ReconnectMismatchDialog } from '../../components/profiles/ReconnectMismatchDialog';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';

function ProfilesLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-[200px] rounded-lg" />
      ))}
    </div>
  );
}

// UI-SPEC §OAuth error toast copy table. `access_denied` is info-level; the
// rest are destructive.
const OAUTH_ERROR_COPY: Record<
  string,
  { variant: 'error' | 'info'; msg: string }
> = {
  access_denied: {
    variant: 'info',
    msg: 'You cancelled the connection.',
  },
  invalid_state: {
    variant: 'error',
    msg: 'OAuth session expired. Try connecting again.',
  },
  token_exchange_failed: {
    variant: 'error',
    msg: "Couldn't exchange the token. Try connecting again.",
  },
  platform_api_error: {
    variant: 'error',
    msg: 'The platform rejected the request.',
  },
};

interface MismatchDialogState {
  existingHandle: string;
  newHandle: string;
  tempToken: string;
  // Carries the `platformAccountId` the user already selected in the picker,
  // so "Connect as a new profile" persists that account rather than falling
  // back to `accounts[0]`. See CR-01 in REVIEW.md.
  platformAccountId: string | null;
}

function filterProfiles(
  profiles: SocialProfile[] | undefined,
  networkFilter: NetworkFilterValue,
): SocialProfile[] {
  if (!profiles) return [];
  if (networkFilter === 'all') return profiles;
  return profiles.filter((p) => p.platform === networkFilter);
}

export default function ProfilesPage() {
  const { data: profiles, isLoading } = useProfiles();
  const reconnect = useReconnectProfile();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [networkFilter, setNetworkFilter] = useState<NetworkFilterValue>('all');
  const [rateLimitTarget, setRateLimitTarget] = useState<{
    profileId: string;
    handle: string;
  } | null>(null);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [pickerTempToken, setPickerTempToken] = useState<string | null>(null);
  const [mismatchDialog, setMismatchDialog] = useState<MismatchDialogState | null>(
    null,
  );

  // Handle OAuth callback query params on mount + param change.
  useEffect(() => {
    const connect = searchParams.get('connect');
    const oauthError = searchParams.get('oauth_error');
    const reconnected = searchParams.get('reconnected');

    if (connect) {
      setPickerTempToken(connect);
      return;
    }

    if (oauthError === 'mismatched_account') {
      const existingHandle = searchParams.get('existingHandle') ?? '';
      const newHandle = searchParams.get('newHandle') ?? '';
      const tempToken = searchParams.get('tempToken') ?? '';
      // No selection context exists on the callback-redirect path (the user
      // hasn't opened the picker yet), so leave `platformAccountId` null and
      // let the mismatch dialog fall back to its legacy behavior only here.
      setMismatchDialog({
        existingHandle,
        newHandle,
        tempToken,
        platformAccountId: null,
      });
      const next = new URLSearchParams(searchParams);
      next.delete('oauth_error');
      next.delete('existingHandle');
      next.delete('newHandle');
      next.delete('tempToken');
      setSearchParams(next, { replace: true });
      return;
    }

    if (oauthError) {
      const copy = OAUTH_ERROR_COPY[oauthError] ?? {
        variant: 'error' as const,
        msg: 'Connection failed. Try again.',
      };
      if (copy.variant === 'info') {
        toast.info(copy.msg);
      } else {
        toast.error(copy.msg);
      }
      const next = new URLSearchParams(searchParams);
      next.delete('oauth_error');
      setSearchParams(next, { replace: true });
      return;
    }

    if (reconnected === '1') {
      toast.success('Profile reconnected.');
      const next = new URLSearchParams(searchParams);
      next.delete('reconnected');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  function handlePickerClose(open: boolean) {
    if (!open) {
      setPickerTempToken(null);
      const next = new URLSearchParams(searchParams);
      next.delete('connect');
      setSearchParams(next, { replace: true });
    }
  }

  function handlePickerMismatch(payload: {
    existingHandle: string;
    incomingHandle: string;
    tempToken: string;
    // Picker emits non-null after a selection (CR-08). The mismatch-dialog
    // state is the wider `string | null` union so the entry-point flow above
    // (which has no selection) can also populate it.
    platformAccountId: string;
  }) {
    setMismatchDialog({
      existingHandle: payload.existingHandle,
      newHandle: payload.incomingHandle,
      tempToken: payload.tempToken,
      platformAccountId: payload.platformAccountId,
    });
  }

  const filtered = filterProfiles(profiles, networkFilter);
  const hasAnyProfiles = (profiles?.length ?? 0) > 0;
  const hasProfilesForFilter = filtered.length > 0;

  return (
    <main>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Profiles</h1>
        <Button onClick={() => setIsConnectOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Connect Profile
        </Button>
      </div>

      {hasAnyProfiles && (
        <ProfileNetworkFilter
          value={networkFilter}
          onChange={setNetworkFilter}
        />
      )}

      {isLoading && <ProfilesLoadingSkeleton />}

      {!isLoading && !hasAnyProfiles && (
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">No profiles connected</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Connect your Twitter/X, LinkedIn, or Facebook account to start scheduling posts.
          </p>
          <Button onClick={() => setIsConnectOpen(true)}>Connect Profile</Button>
        </div>
      )}

      {!isLoading && hasAnyProfiles && !hasProfilesForFilter && (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground mb-4">
            No {networkFilter} profiles connected yet.
          </p>
          <Button onClick={() => setIsConnectOpen(true)}>
            Connect {networkFilter}
          </Button>
        </div>
      )}

      {hasProfilesForFilter && (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          aria-live="polite"
          aria-label={
            networkFilter === 'all'
              ? 'Connected profiles'
              : `Connected profiles, filtered to ${networkFilter}`
          }
        >
          {filtered.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              rateLimitIndicator={
                profile.platform === 'twitter' ? (
                  <ProfileRateLimitIndicator profileId={profile.id} />
                ) : null
              }
              onEditRateLimit={
                profile.platform === 'twitter'
                  ? () =>
                      setRateLimitTarget({
                        profileId: profile.id,
                        handle: profile.handle,
                      })
                  : undefined
              }
              onEdit={(profileId) => setEditTarget(profileId)}
              onReconnect={(profileId, platform: Platform) =>
                reconnect(profileId, platform)
              }
              onDelete={(profileId) => setDeleteTarget(profileId)}
            />
          ))}
        </div>
      )}

      <ConnectProfileDialog
        open={isConnectOpen}
        onOpenChange={setIsConnectOpen}
      />

      <RateLimitSettingsDialog
        profileId={rateLimitTarget?.profileId ?? null}
        handle={rateLimitTarget?.handle ?? ''}
        open={rateLimitTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setRateLimitTarget(null);
        }}
      />

      <PageOrgPickerDialog
        tempToken={pickerTempToken}
        open={pickerTempToken !== null}
        onOpenChange={handlePickerClose}
        onMismatch={handlePickerMismatch}
      />

      <EditProfileDialog
        profileId={editTarget}
        open={editTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditTarget(null);
        }}
      />

      <DeleteProfileDialog
        profileId={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteTarget(null);
        }}
      />

      <ReconnectMismatchDialog
        existingHandle={mismatchDialog?.existingHandle ?? ''}
        newHandle={mismatchDialog?.newHandle ?? ''}
        tempToken={mismatchDialog?.tempToken ?? null}
        platformAccountId={mismatchDialog?.platformAccountId ?? null}
        open={mismatchDialog !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setMismatchDialog(null);
        }}
      />
    </main>
  );
}
