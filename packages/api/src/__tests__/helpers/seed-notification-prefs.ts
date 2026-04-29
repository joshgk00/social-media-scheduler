import { NOTIFICATION_EVENTS, type NotificationEventType } from '@sms/shared';

interface SeedPrefsOptions {
  eventType?: NotificationEventType;
  isInAppEnabled?: boolean;
  isEmailEnabled?: boolean;
}

export async function seedPrefs(
  db: { insert: (table: unknown) => { values: (rows: unknown[]) => Promise<unknown> } },
  userId: string,
  overrides: SeedPrefsOptions = {},
): Promise<void> {
  const prefsRows = NOTIFICATION_EVENTS.map((eventSpec) => ({
    userId,
    eventType: overrides.eventType ?? eventSpec.eventType,
    inAppEnabled: overrides.isInAppEnabled ?? true,
    emailEnabled: overrides.isEmailEnabled ?? eventSpec.supportsEmail,
  }));

  await db.insert('user_notification_prefs').values(prefsRows);
}
