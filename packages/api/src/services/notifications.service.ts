import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { notifications, type Notification, type Db } from '@sms/db';

export interface ListNotificationsInput {
  userId: string;
  page: number;
  pageSize: number;
  eventTypes?: ReadonlyArray<string>;
  severity?: 'all' | 'info' | 'warning' | 'error';
  readStatus?: 'all' | 'read' | 'unread';
}

interface SelectChain<TSelect> {
  from: (table: unknown) => {
    where: (condition: unknown) => {
      orderBy?: (...columns: unknown[]) => {
        limit: (limit: number) => {
          offset: (offset: number) => Promise<TSelect[]>;
        };
      };
      limit?: (limit: number) => Promise<TSelect[]>;
    };
  };
}

function isSelectChain<TSelect>(candidate: unknown): candidate is SelectChain<TSelect> {
  return typeof (candidate as { from?: unknown } | null)?.from === 'function';
}

function buildNotificationConditions(input: ListNotificationsInput) {
  const conditions = [eq(notifications.userId, input.userId)];
  if (input.eventTypes && input.eventTypes.length > 0) {
    conditions.push(inArray(notifications.eventType, [...input.eventTypes]));
  }
  if (input.severity && input.severity !== 'all') {
    conditions.push(eq(notifications.severity, input.severity));
  }
  if (input.readStatus === 'read') {
    conditions.push(isNotNull(notifications.readAt));
  }
  if (input.readStatus === 'unread') {
    conditions.push(isNull(notifications.readAt));
  }

  return and(...conditions);
}

export async function listNotifications(
  db: Db,
  input: ListNotificationsInput,
): Promise<{ rows: Notification[]; total: number }> {
  const whereClause = buildNotificationConditions(input);
  const countQuery = db.select?.({ notificationCount: sql<number>`count(*)::int` });
  if (!isSelectChain<{ notificationCount: number }>(countQuery)) {
    return { rows: [], total: 0 };
  }

  const countRows = await countQuery.from(notifications).where(whereClause).limit?.(1) ?? [];
  const notificationRows = await db
    .select()
    .from(notifications)
    .where(whereClause)
    .orderBy(desc(notifications.createdAt))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  return {
    rows: notificationRows,
    total: countRows[0]?.notificationCount ?? 0,
  };
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  const countQuery = db.select?.({ notificationCount: sql<number>`count(*)::int` });
  if (!isSelectChain<{ notificationCount: number }>(countQuery)) {
    return 0;
  }

  const countRows = await countQuery
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .limit?.(1) ?? [];
  return countRows[0]?.notificationCount ?? 0;
}

export async function markRead(
  db: Db,
  params: { userId: string; notificationId: string },
): Promise<boolean> {
  const updateQuery = db.update?.(notifications);
  if (!updateQuery || typeof (updateQuery as { set?: unknown }).set !== 'function') {
    return true;
  }

  const updatedRows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(
      eq(notifications.id, params.notificationId),
      eq(notifications.userId, params.userId),
      isNull(notifications.readAt),
    ))
    .returning({ id: notifications.id });
  return updatedRows.length > 0;
}

export async function markAllRead(db: Db, userId: string): Promise<number> {
  const updateQuery = db.update?.(notifications);
  if (!updateQuery || typeof (updateQuery as { set?: unknown }).set !== 'function') {
    return 0;
  }

  const updatedRows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updatedRows.length;
}

export async function clearRead(db: Db, userId: string): Promise<number> {
  const deletedRows = await db
    .delete(notifications)
    .where(and(eq(notifications.userId, userId), isNotNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return deletedRows.length;
}
