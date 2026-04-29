import { and, eq } from 'drizzle-orm';
import {
  ALWAYS_ON_EVENT_TYPES,
  NOTIFICATION_EVENTS,
  type NotificationEventType,
} from '@sms/shared';
import { userNotificationPrefs } from '@sms/db';
import type { WorkerDb } from '../db.js';

export interface EffectivePrefs {
  isInAppEnabled: boolean;
  shouldSendEmail: boolean;
}

export async function loadEffectivePrefs(
  db: WorkerDb,
  userId: string,
  eventType: NotificationEventType,
): Promise<EffectivePrefs> {
  if (ALWAYS_ON_EVENT_TYPES.has(eventType)) {
    return { isInAppEnabled: true, shouldSendEmail: true };
  }

  const eventSpec = NOTIFICATION_EVENTS.find((candidateEventSpec) => candidateEventSpec.eventType === eventType);
  const supportsEmail = eventSpec?.supportsEmail ?? false;
  const prefsRows = await db
    .select()
    .from(userNotificationPrefs)
    .where(and(
      eq(userNotificationPrefs.userId, userId),
      eq(userNotificationPrefs.eventType, eventType),
    ))
    .limit(1);
  const prefsRow = prefsRows[0];

  return {
    isInAppEnabled: prefsRow?.inAppEnabled ?? true,
    shouldSendEmail: supportsEmail && (prefsRow?.emailEnabled ?? true),
  };
}
