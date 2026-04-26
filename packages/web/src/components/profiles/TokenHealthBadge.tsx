import { formatDistanceToNow } from 'date-fns';
import type { TokenStatus } from '@sms/shared';
import type { Platform } from '../../hooks/use-profiles';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

type BadgeState = 'ok' | 'warn' | 'block';

// UI-SPEC §Color reuses the same success/warning/destructive roles as
// ProfileRateLimitIndicator. Class strings are copied verbatim so the two
// components render identical dots.
const DOT_CLASS: Record<BadgeState, string> = {
  ok: 'bg-[--color-success]',
  warn: 'bg-[--color-warning]',
  block: 'bg-destructive',
};

const TEXT_CLASS: Record<BadgeState, string> = {
  ok: 'text-[--color-success]',
  warn: 'text-[--color-warning]',
  block: 'text-destructive',
};

function mapStatus(status: TokenStatus): BadgeState {
  if (status === 'active') return 'ok';
  if (status === 'expiring') return 'warn';
  return 'block';
}

function buildExpiringLabel(expiresAt: string | null): string {
  if (!expiresAt) return 'Expires soon';
  // `formatDistanceToNow` without suffix produces "5 days" / "1 day".
  // UI-SPEC §Token health status asks for `Expires in Nd` — we reuse the
  // library output and prefix with `Expires in `.
  const raw = formatDistanceToNow(new Date(expiresAt), { addSuffix: false });
  return `Expires in ${raw}`;
}

function buildLabel(status: TokenStatus, expiresAt: string | null): string {
  if (status === 'active') return 'Active';
  if (status === 'expiring') return buildExpiringLabel(expiresAt);
  return 'Needs re-authentication';
}

function buildReauthTooltip(platform: Platform): string {
  if (platform === 'twitter') {
    return 'Token rejected by Twitter (401). Reconnect to keep posting.';
  }
  if (platform === 'linkedin') {
    return 'Refresh failed after 4 attempts. Reconnect to keep posting.';
  }
  return 'Facebook rejected the token. Reconnect to keep posting.';
}

function buildTooltip(
  status: TokenStatus,
  expiresAt: string | null,
  checkedAt: string | null,
  platform: Platform,
): string {
  if (status === 'active') {
    const checked = checkedAt
      ? formatDistanceToNow(new Date(checkedAt), { addSuffix: true })
      : 'recently';
    if (expiresAt) {
      const expiryLabel = new Date(expiresAt).toLocaleDateString();
      return `Token valid. Expires ${expiryLabel}. Last checked ${checked}.`;
    }
    return `Token valid. Last checked ${checked}.`;
  }

  if (status === 'expiring') {
    if (!expiresAt) {
      return "Token expires soon. We'll refresh automatically.";
    }
    const raw = formatDistanceToNow(new Date(expiresAt), { addSuffix: false });
    return `Token expires in ${raw}. We'll refresh automatically.`;
  }

  return buildReauthTooltip(platform);
}

export interface TokenHealthBadgeProps {
  status: TokenStatus;
  expiresAt: string | null;
  checkedAt: string | null;
  failureReason: string | null;
  platform: Platform;
}

export function TokenHealthBadge({
  status,
  expiresAt,
  checkedAt,
  failureReason,
  platform,
}: TokenHealthBadgeProps) {
  const state = mapStatus(status);
  const label = buildLabel(status, expiresAt);
  const tooltip = buildTooltip(status, expiresAt, checkedAt, platform);

  // `failureReason` is surfaced only in the tooltip when the server supplies
  // one. The three platform-specific fallback strings above cover the common
  // case; a specific reason takes precedence.
  const tooltipText =
    state === 'block' && failureReason ? failureReason : tooltip;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/*
            tabIndex={0} makes the badge reachable via Tab — without it, the
            span was silently dropped from the tab sequence and the tooltip
            never opened for keyboard users. role="status" + aria-description
            preserve the existing screen-reader contract; the focus-visible
            ring matches the standard ring used elsewhere in the UI.
          */}
          <span
            tabIndex={0}
            role="status"
            aria-description={tooltipText}
            className="inline-flex items-center gap-1 cursor-default rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${DOT_CLASS[state]}`}
            />
            <span className={`text-xs ${TEXT_CLASS[state]}`}>{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs max-w-xs">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
