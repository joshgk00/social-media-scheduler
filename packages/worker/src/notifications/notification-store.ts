import { emailLogs, notifications, type NewEmailLog, type NewNotification } from '@sms/db';
import type { WorkerDb } from '../db.js';

export async function insertNotificationRow(
  db: WorkerDb,
  row: NewNotification,
): Promise<{ inserted: boolean }> {
  const insertedRows = await db
    .insert(notifications)
    .values(row)
    .onConflictDoNothing()
    .returning({ id: notifications.id });

  return { inserted: insertedRows.length > 0 };
}

export async function insertEmailLogRow(db: WorkerDb, row: NewEmailLog): Promise<void> {
  await db.insert(emailLogs).values(row);
}
