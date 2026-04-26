import { DateTime } from 'luxon';

/**
 * Helper that produces a relative + absolute reset-time pair for the
 * rate-limit chip and dashboard widget (D-13, D-14).
 *
 * - relative: "47m" / "8h" / "5d" — short numeric + unit suitable for chips
 * - absolute: platform-specific phrasing
 *     - facebook (hourly): "3:00 PM ET" or "15:00 UTC"
 *     - linkedin (daily):  "midnight UTC"
 *     - twitter (monthly): "May 1" or "2026-05-01"
 *
 * Plan 05b's Rate-Limit Chip + Dashboard Card consume this helper directly.
 */

export type Platform = 'twitter' | 'linkedin' | 'facebook';

export interface FormattedResetTime {
  relative: string;
  absolute: string;
}

export function formatResetTime(
  windowResetAtIso: string,
  platform: Platform,
  userTimezone: string = 'UTC',
  dateFormatPreference: 'us' | 'iso' = 'us',
): FormattedResetTime {
  const reset = DateTime.fromISO(windowResetAtIso).setZone(userTimezone);
  const now = DateTime.now().setZone(userTimezone);
  const diffMinutes = reset.diff(now, 'minutes').minutes;

  let relative: string;
  if (diffMinutes < 60) {
    relative = `${Math.max(0, Math.floor(diffMinutes))}m`;
  } else if (diffMinutes < 60 * 24) {
    relative = `${Math.floor(diffMinutes / 60)}h`;
  } else {
    relative = `${Math.floor(diffMinutes / 60 / 24)}d`;
  }

  let absolute: string;
  if (platform === 'facebook') {
    absolute = reset.toFormat(dateFormatPreference === 'us' ? 'h:mm a ZZZZ' : 'HH:mm ZZZZ');
  } else if (platform === 'linkedin') {
    // LinkedIn always resets at UTC midnight regardless of user timezone.
    absolute = 'midnight UTC';
  } else {
    absolute = reset.toFormat(dateFormatPreference === 'us' ? 'LLL d' : 'yyyy-LL-dd');
  }

  return { relative, absolute };
}
