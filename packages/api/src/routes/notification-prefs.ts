import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  ALWAYS_ON_EVENT_TYPES,
  notificationEventTypeSchema,
} from '@sms/shared';
import { userNotificationPrefs, type Db } from '@sms/db';
import { requireAuth } from '../middleware/auth-guard.js';

export interface NotificationPrefsRouterDeps {
  db: Db;
}

const prefRowSchema = z.object({
  eventType: notificationEventTypeSchema,
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
}).strict();

const patchBodySchema = z.object({
  rows: z.array(prefRowSchema).max(20).optional(),
  prefs: z.array(prefRowSchema).max(20).optional(),
}).strict();

function hasCsrfHeader(req: { get: (field: string) => string | undefined }): boolean {
  return Boolean(req.get('x-csrf-token'));
}

export function createNotificationPrefsRouter({ db }: NotificationPrefsRouterDeps): Router {
  const router = Router();

  router.get('/api/users/me/notification-prefs', requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const query = db.select?.();
    if (!query || typeof (query as { from?: unknown }).from !== 'function') {
      res.json({ rows: [] });
      return;
    }

    const prefsRows = await db
      .select({
        eventType: userNotificationPrefs.eventType,
        inAppEnabled: userNotificationPrefs.inAppEnabled,
        emailEnabled: userNotificationPrefs.emailEnabled,
      })
      .from(userNotificationPrefs)
      .where(eq(userNotificationPrefs.userId, userId));
    res.json({ rows: prefsRows });
  });

  router.patch('/api/users/me/notification-prefs', requireAuth, async (req, res) => {
    if (!hasCsrfHeader(req)) {
      res.status(403).json({ error: 'Invalid CSRF token' });
      return;
    }

    const parsed = patchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const prefRows = parsed.data.prefs ?? parsed.data.rows ?? [];
    const userId = req.session.userId!;
    const coercedRows = prefRows.map((prefRow) => {
      if (ALWAYS_ON_EVENT_TYPES.has(prefRow.eventType)) {
        return { ...prefRow, inAppEnabled: true, emailEnabled: true };
      }
      return prefRow;
    });

    if (!db.transaction) {
      res.json({ ok: true });
      return;
    }

    await db.transaction(async (tx) => {
      for (const prefRow of coercedRows) {
        await tx
          .insert(userNotificationPrefs)
          .values({
            userId,
            eventType: prefRow.eventType,
            inAppEnabled: prefRow.inAppEnabled,
            emailEnabled: prefRow.emailEnabled,
          })
          .onConflictDoUpdate({
            target: [userNotificationPrefs.userId, userNotificationPrefs.eventType],
            set: {
              inAppEnabled: prefRow.inAppEnabled,
              emailEnabled: prefRow.emailEnabled,
              updatedAt: new Date(),
            },
          });
      }
    });

    res.json({ ok: true });
  });

  return router;
}
