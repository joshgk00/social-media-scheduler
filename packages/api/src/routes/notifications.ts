import { Router, type NextFunction, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { notificationEventTypeSchema } from '@sms/shared';
import { users, type Db } from '@sms/db';
import { requireAuth } from '../middleware/auth-guard.js';
import {
  countUnread,
  clearRead,
  listNotifications,
  markAllRead,
  markRead,
} from '../services/notifications.service.js';

export interface NotificationsRouterDeps {
  db: Db;
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  eventTypes: z.string().optional().transform((eventTypes, ctx) => {
    if (!eventTypes) return undefined;
    const parsedEventTypes = eventTypes.split(',').filter(Boolean);
    for (const eventType of parsedEventTypes) {
      const parsedEventType = notificationEventTypeSchema.safeParse(eventType);
      if (!parsedEventType.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid event type: ${eventType}`,
        });
        return z.NEVER;
      }
    }
    return parsedEventTypes;
  }),
  type: z.enum(['all', 'error', 'warning', 'info']).default('all'),
  readStatus: z.enum(['all', 'read', 'unread']).default('all'),
}).strict();

const idParamSchema = z.object({ id: z.string().min(1) }).strict();

async function loadEntriesPerPage(db: Db, userId: string): Promise<number> {
  const query = db.select?.({ entriesPerPage: users.entriesPerPage });
  if (!query || typeof (query as { from?: unknown }).from !== 'function') {
    return 25;
  }

  const userRows = await db
    .select({ entriesPerPage: users.entriesPerPage })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return userRows[0]?.entriesPerPage ?? 25;
}

export function createNotificationsRouter({ db }: NotificationsRouterDeps): Router {
  const router = Router();

  router.get('/api/notifications/unread-count', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const unreadCount = await countUnread(db, userId);
      res.json({ count: unreadCount });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/notifications', requireAuth, async (req, res, next) => {
    try {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
        return;
      }

      const userId = req.session.userId!;
      const pageSize = parsed.data.pageSize ?? await loadEntriesPerPage(db, userId);
      const notificationPage = await listNotifications(db, {
        userId,
        page: parsed.data.page,
        pageSize,
        eventTypes: parsed.data.eventTypes,
        severity: parsed.data.type,
        readStatus: parsed.data.readStatus,
      });

      res.json({
        rows: notificationPage.rows,
        page: parsed.data.page,
        pageSize,
        total: notificationPage.total,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/notifications/:id/read', requireAuth, async (req, res, next) => {
    try {
      const parsed = idParamSchema.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid id' });
        return;
      }

      const userId = req.session.userId!;
      const wasUpdated = await markRead(db, { userId, notificationId: parsed.data.id });
      if (!wasUpdated) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  async function handleMarkAllRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.session.userId!;
      const updatedCount = await markAllRead(db, userId);
      res.json({ ok: true, updated: updatedCount });
    } catch (error) {
      next(error);
    }
  }

  router.post('/api/notifications/read-all', requireAuth, (req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', '2026-08-01');
    res.setHeader('Link', '</api/notifications/mark-all-read>; rel="successor-version"');
    void handleMarkAllRead(req, res, next);
  });
  router.post('/api/notifications/mark-all-read', requireAuth, handleMarkAllRead);

  router.post('/api/notifications/clear-read', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const deletedCount = await clearRead(db, userId);
      res.json({ ok: true, deleted: deletedCount });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
