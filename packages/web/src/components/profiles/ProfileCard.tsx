import { formatDistanceToNow } from 'date-fns';
import {
  MoreVertical,
  Pencil,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { Avatar } from '../ui/avatar';
import { Card } from '../ui/card';
import { IconButton } from '../ui/icon';
import { Pill, StatusPill } from '../ui/pill';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { Platform, SocialProfile } from '../../hooks/use-profiles';

interface ProfileCardProps {
  profile: SocialProfile;
  rateLimitIndicator?: React.ReactNode;
  onEditRateLimit?: () => void;
  onEdit: (profileId: string) => void;
  onReconnect: (profileId: string, platform: Platform) => void;
  onDelete: (profileId: string) => void;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  twitter: 'Twitter / X',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
};

function displayHandle(handle: string | null | undefined): string {
  const normalized = (handle ?? '').trim();
  if (!normalized) return '@profile';
  return normalized.startsWith('@') ? normalized : `@${normalized}`;
}

function formatRelative(iso: string | null, emptyLabel: string): string {
  if (!iso) return emptyLabel;
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

function profileStatus(profile: SocialProfile): 'active' | 'inactive' | 'deprecated' {
  if (profile.tokenStatus === 'expired' || profile.tokenStatus === 'needs_reauth') {
    return 'deprecated';
  }

  if (profile.tokenStatus === 'expiring') {
    return 'inactive';
  }

  return 'active';
}

function nonTwitterRateCopy(platform: Platform): string {
  return `No rate cap on ${PLATFORM_LABEL[platform]} (org-level limits only)`;
}

export function ProfileCard({
  profile,
  rateLimitIndicator,
  onEditRateLimit,
  onEdit,
  onReconnect,
  onDelete,
}: ProfileCardProps) {
  const status = profileStatus(profile);
  const displayName = profile.displayName || displayHandle(profile.handle);
  const handle = displayHandle(profile.handle);

  return (
    <Card className="grid min-h-[148px] grid-rows-[auto_auto_1fr_auto] overflow-hidden">
      <div className="flex min-w-0 items-start gap-3 px-3 py-3">
        <Avatar
          size="lg"
          name={displayName}
          imageSrc={profile.avatarUrl}
          platform={profile.platform}
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-sm font-semibold text-foreground">
            {displayName}
          </p>
          <p className="mono truncate text-[11px] text-muted-foreground">
            {handle}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              icon={MoreVertical}
              label={`Profile actions for ${displayName}`}
              className="h-7 w-7"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(profile.id)}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              Edit profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReconnect(profile.id, profile.platform)}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Reconnect
            </DropdownMenuItem>
            {onEditRateLimit && profile.platform === 'twitter' ? (
              <DropdownMenuItem onClick={onEditRateLimit}>
                <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
                Edit rate limit
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onClick={() => onDelete(profile.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete profile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
        <StatusPill status={status} />
        <Pill tone="neutral">{PLATFORM_LABEL[profile.platform]}</Pill>
      </div>

      <div className="px-3 pb-3">
        {profile.platform === 'twitter' ? (
          rateLimitIndicator ?? (
            <p className="text-[11px] text-muted-foreground">Rate limit unavailable</p>
          )
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {nonTwitterRateCopy(profile.platform)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <p className="min-w-0 truncate">
          Last: {formatRelative(profile.lastPublishedAt, 'No posts yet')}
        </p>
        <p className="min-w-0 truncate text-right">
          Next: {formatRelative(profile.nextScheduledAt, 'Nothing scheduled')}
        </p>
      </div>
    </Card>
  );
}
