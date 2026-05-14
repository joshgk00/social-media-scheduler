import { DateTime } from 'luxon';

export function utcToLocalInput(utcIso: string, timezone: string): string {
  return DateTime.fromISO(utcIso, { zone: 'utc' })
    .setZone(timezone)
    .toFormat("yyyy-MM-dd'T'HH:mm");
}

export function localInputToUtc(localValue: string, timezone: string): { utcIso: string; wasAdjusted: boolean } {
  const localDateTime = DateTime.fromFormat(localValue, "yyyy-MM-dd'T'HH:mm", { zone: timezone });
  const roundTrip = localDateTime.toFormat("yyyy-MM-dd'T'HH:mm");
  const wasAdjusted = roundTrip !== localValue;
  return {
    utcIso: localDateTime.toUTC().toISO()!,
    wasAdjusted,
  };
}
