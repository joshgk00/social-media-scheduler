import { useEffect, useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router';
import {
  useProfiles,
  useReconnectProfile,
  type Platform,
  type SocialProfile,
} from '../../hooks/use-profiles';
import { ConnectProfileDialog } from '../../components/profiles/ConnectProfileDialog';
import { DeleteProfileDialog } from '../../components/profiles/DeleteProfileDialog';
import { EditProfileDialog } from '../../components/profiles/EditProfileDialog';
import { PageOrgPickerDialog } from '../../components/profiles/PageOrgPickerDialog';
import { ProfileCard } from '../../components/profiles/ProfileCard';
import { ProfileRateLimitIndicator } from '../../components/profiles/ProfileRateLimitIndicator';
import { RateLimitSettingsDialog } from '../../components/profiles/RateLimitSettingsDialog';
import { ReconnectMismatchDialog } from '../../components/profiles/ReconnectMismatchDialog';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { PageHeader } from '../../components/ui/page-header';
import { Segmented } from '../../components/ui/segmented';
import { Skeleton } from '../../components/ui/skeleton';

type ProfileFilter = 'all' | Platform;

interface MismatchDialogState {
  existingHandle: string;
  newHandle: string;
  tempToken: string;
  platformAccountId: string | null;
}

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

function filterProfiles(
  profiles: SocialProfile[] | undefined,
  networkFilter: ProfileFilter,
): SocialProfile[] {
  if (!profiles) return [];
  if (networkFilter === 'all') return profiles;
  return profiles.filter((profile) => profile.platform === networkFilter);
}

function countProfiles(profiles: SocialProfile[] | undefined, filter: ProfileFilter): number {
  return filterProfiles(profiles, filter).length;
}

export default function ProfilesPage() {
  const { data: profiles, isLoading } = useProfiles();
  const reconnect = useReconnectProfile();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [networkFilter, setNetworkFilter] = useState<ProfileFilter>('all');
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

  useEffect(() => {
    const connect = searchParams.get('connect');
    const oauthError = searchParams.get('oauth_error');
    const reconnected = searchParams.get('reconnected');

    if (connect) {
      setPickerTempToken(connect);
      return;
    }

    if (oauthError === 'mismatched_account') {
      setMismatchDialog({
        existingHandle: searchParams.get('existingHandle') ?? '',
        newHandle: searchParams.get('newHandle') ?? '',
        tempToken: searchParams.get('tempToken') ?? '',
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
    platformAccountId: string;
  }) {
    setMismatchDialog({
      existingHandle: payload.existingHandle,
      newHandle: payload.incomingHandle,
      tempToken: payload.tempToken,
      platformAccountId: payload.platformAccountId,
    });
  }

  const filterOptions = useMemo(
    () => [
      { value: 'all' as const, label: `All (${countProfiles(profiles, 'all')})` },
      { value: 'twitter' as const, label: `Twitter (${countProfiles(profiles, 'twitter')})` },
      { value: 'linkedin' as const, label: `LinkedIn (${countProfiles(profiles, 'linkedin')})` },
      { value: 'facebook' as const, label: `Facebook (${countProfiles(profiles, 'facebook')})` },
    ],
    [profiles],
  );
  const filtered = filterProfiles(profiles, networkFilter);
  const hasAnyProfiles = (profiles?.length ?? 0) > 0;
  const hasProfilesForFilter = filtered.length > 0;

  return (
    <main className="p-6">
      <PageHeader
        title="Profiles"
        subtitle="Connected social accounts. Self-hosted OAuth keeps publishing access on your infrastructure."
        actions={
          <Button variant="accent" onClick={() => setIsConnectOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Connect profile
          </Button>
        }
      />

      <div className="mb-3">
        <Segmented
          label="Filter profiles by platform"
          value={networkFilter}
          options={filterOptions}
          onChange={setNetworkFilter}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-[148px] rounded-md" />
          ))}
        </div>
      ) : null}

      {!isLoading && !hasAnyProfiles ? (
        <EmptyState
          icon={Users}
          title="No profiles connected"
          body="Connect Twitter / X, LinkedIn, or Facebook to start scheduling posts."
          action={
            <Button variant="accent" onClick={() => setIsConnectOpen(true)}>
              Connect profile
            </Button>
          }
        />
      ) : null}

      {!isLoading && hasAnyProfiles && !hasProfilesForFilter ? (
        <EmptyState
          icon={Users}
          title={`No ${networkFilter} profiles`}
          body="Switch filters or connect another profile for this platform."
          action={
            <Button variant="accent" onClick={() => setIsConnectOpen(true)}>
              Connect profile
            </Button>
          }
        />
      ) : null}

      {hasProfilesForFilter ? (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3"
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
                ) : undefined
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
              onReconnect={(profileId, platform) => reconnect(profileId, platform)}
              onDelete={(profileId) => setDeleteTarget(profileId)}
            />
          ))}
        </div>
      ) : null}

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
