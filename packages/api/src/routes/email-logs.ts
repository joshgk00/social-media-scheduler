import { Router } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { emailLogs, users, type Db } from '@sms/db';
import { notificationEventTypeSchema } from '@sms/shared';
import { requireAuth } from '../middleware/auth-guard.js';

export interface EmailLogsRouterDeps {
  db: Db;
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  event_type: z.string().optional(),
  eventType: z.string().optional(),
  status: z.enum(['sent', 'failed']).optional(),
  recipient: z.string().min(1).max(254).optional(),
}).strict();

function parseEventTypes(rawEventTypes?: string): string[] | undefined {
  if (!rawEventTypes) return undefined;
  const eventTypes = rawEventTypes.split(',').filter(Boolean);
  for (const eventType of eventTypes) {
    notificationEventTypeSchema.parse(eventType);
  }
  return eventTypes;
}

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

export function createEmailLogsRouter({ db }: EmailLogsRouterDeps): Router {
  const router = Router();

  router.get('/api/email-logs', requireAuth, async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const eventTypes = parseEventTypes(parsed.data.eventType ?? parsed.data.event_type);
    const userId = req.session.userId!;
    const pageSize = parsed.data.pageSize ?? await loadEntriesPerPage(db, userId);
    const conditions = [eq(emailLogs.userId, userId)];
    if (eventTypes && eventTypes.length > 0) {
      conditions.push(inArray(emailLogs.eventType, eventTypes));
    }
    if (parsed.data.status) {
      conditions.push(eq(emailLogs.status, parsed.data.status));
    }
    if (parsed.data.recipient) {
      conditions.push(sql`LOWER(${emailLogs.recipientEmail}) LIKE LOWER(${`%${parsed.data.recipient}%`})`);
    }
    const whereClause = and(...conditions);
    const countQuery = db.select?.({ emailLogCount: sql<number>`count(*)::int` });
    if (!countQuery || typeof (countQuery as { from?: unknown }).from !== 'function') {
      res.json({ rows: [], page: parsed.data.page, pageSize, total: 0 });
      return;
    }

    const countRows = await db
      .select({ emailLogCount: sql<number>`count(*)::int` })
      .from(emailLogs)
      .where(whereClause);
    const rows = await db
      .select()
      .from(emailLogs)
      .where(whereClause)
      .orderBy(desc(emailLogs.sentAt))
      .limit(pageSize)
      .offset((parsed.data.page - 1) * pageSize);

    res.json({
      rows,
      page: parsed.data.page,
      pageSize,
      total: countRows[0]?.emailLogCount ?? 0,
    });
  });

  return router;
}
