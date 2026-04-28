import { formatDistanceToNow } from 'date-fns';
import {
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { TokenHealthBadge } from './TokenHealthBadge';
import { RateLimitChip } from './RateLimitChip';
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
  twitter: 'Twitter/X',
  linkedin: 'LinkedIn',
  facebook: 'Facebook Page',
};

function formatRelative(iso: string | null, emptyLabel: string): string {
  if (!iso) return emptyLabel;
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export function ProfileCard({
  profile,
  rateLimitIndicator,
  onEditRateLimit,
  onEdit,
  onReconnect,
  onDelete,
}: ProfileCardProps) {
  const avatarInitial = profile.displayName
    ? profile.displayName.charAt(0).toUpperCase()
    : '?';

  const isRed =
    profile.tokenStatus === 'needs_reauth' ||
    profile.tokenStatus === 'expired';

  const lastPublishedCopy = profile.lastPublishedAt
    ? `Last published ${formatDistanceToNow(new Date(profile.lastPublishedAt), { addSuffix: true })}`
    : 'Never published';
  const nextScheduledCopy = profile.nextScheduledAt
    ? `Next run ${formatDistanceToNow(new Date(profile.nextScheduledAt), { addSuffix: true })}`
    : 'No posts scheduled';

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-3 mb-3">
          <Avatar>
            {profile.avatarUrl && (
              <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
            )}
            <AvatarFallback>{avatarInitial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate flex-1">
                {profile.displayName}
              </p>
              <TokenHealthBadge
                status={profile.tokenStatus}
                expiresAt={profile.tokenExpiresAt}
                checkedAt={profile.tokenHealthCheckedAt}
                failureReason={null}
                platform={profile.platform}
              />
            </div>
            <p className="text-sm text-muted-foreground truncate">
              @{profile.handle}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Profile actions for ${profile.displayName}`}
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(profile.id)}>
                <Pencil className="h-4 w-4 mr-2" aria-hidden="true" />
                Edit profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onReconnect(profile.id, profile.platform)}
              >
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                Reconnect now
              </DropdownMenuItem>
              {onEditRateLimit && profile.platform === 'twitter' && (
                <DropdownMenuItem onClick={onEditRateLimit}>
                  Edit rate limit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onDelete(profile.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                Delete profile
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center justify-between mb-3">
          <Badge variant="secondary">{PLATFORM_LABEL[profile.platform]}</Badge>
        </div>

        <p className="text-xs text-muted-foreground mb-1">
          Connected{' '}
          {formatDistanceToNow(new Date(profile.connectedAt), {
            addSuffix: true,
          })}
        </p>
        <p className="text-xs text-muted-foreground mb-1">{lastPublishedCopy}</p>
        <p className="text-xs text-muted-foreground mb-2">{nextScheduledCopy}</p>

        {/*
          Plan 05b — for LinkedIn/Facebook, render the platform-aware
          RateLimitChip directly below TokenHealthBadge. Twitter still uses
          the page-supplied `rateLimitIndicator` slot (the legacy
          ProfileRateLimitIndicator with monthly-budget copy).
        */}
        {profile.platform !== 'twitter' ? (
          <div className="mb-4">
            <RateLimitChip
              profileId={profile.id}
              platform={profile.platform}
            />
          </div>
        ) : (
          rateLimitIndicator && (
            <div className="mb-4">{rateLimitIndicator}</div>
          )
        )}

        {isRed && (
          <div className="mb-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onReconnect(profile.id, profile.platform)}
            >
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              Reconnect
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
