import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  getEventSpec,
  ALWAYS_ON_EVENT_TYPES,
  type NotificationEventType,
} from '@sms/shared';
import { posts, queues, socialProfiles, users, type NewEmailLog, type NewNotification } from '@sms/db';
import type { WorkerDb } from '../../db.js';
import { insertEmailLogRow, insertNotificationRow } from '../notification-store.js';
import { loadEffectivePrefs, type EffectivePrefs } from '../prefs.service.js';
import { sendEmail, type SendEmailResult } from '../smtp.js';
import type { RenderedNotificationEmail } from '../templates/types.js';

const FALLBACK_USER_ID = '44444444-4444-4444-4444-444444444444';
const FALLBACK_RECIPIENT_EMAIL = 'notifications@example.com';
const DEFAULT_APP_BASE_URL = 'http://localhost:5173';

type InsertNotificationMock = (row: NewNotification) => Promise<unknown> | unknown;
type InsertEmailLogMock = (row: NewEmailLog) => Promise<unknown> | unknown;
type SendEmailMock = (message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) => Promise<SendEmailResult> | SendEmailResult;

export interface NotificationHandlerContext {
  db?: WorkerDb | { select?: (...args: unknown[]) => unknown; insert?: (...args: unknown[]) => unknown };
  store?: {
    insertNotification?: InsertNotificationMock;
    insertEmailLog?: InsertEmailLogMock;
  };
  prefs?: {
    loadPrefs?: (
      userId: string,
      eventType: NotificationEventType,
    ) => Promise<EffectivePrefs | { isInAppEnabled?: boolean; isEmailEnabled?: boolean } | null>;
  };
  smtp?: { sendEmail?: SendEmailMock };
  transporter?: Parameters<typeof sendEmail>[0];
  smtpFrom?: string | null;
  appBaseUrl?: string;
}

export interface NotificationJob<TPayload> extends Pick<Job, 'id' | 'name'> {
  attemptsMade?: number;
  data: TPayload;
}

export interface NotificationSideEffectInput<TPayload extends { correlationId?: string }> {
  ctx: NotificationHandlerContext;
  userId: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  linkPath: string | null;
  payload: TPayload;
  email?: RenderedNotificationEmail;
}

interface SelectChain<TSelect> {
  from: (table: unknown) => {
    where: (condition: unknown) => {
      limit: (limit: number) => Promise<TSelect[]>;
    };
  };
}

function getDb(ctx: NotificationHandlerContext): WorkerDb | undefined {
  return ctx.db as WorkerDb | undefined;
}

function isSelectChain<TSelect>(candidate: unknown): candidate is SelectChain<TSelect> {
  return typeof (candidate as { from?: unknown } | null)?.from === 'function';
}

function shouldUseMockInsert(ctx: NotificationHandlerContext): boolean {
  return !isSelectChain(ctx.db?.select?.({ probe: users.id }));
}

function normalizePrefs(
  eventType: NotificationEventType,
  prefs: EffectivePrefs | { isInAppEnabled?: boolean; isEmailEnabled?: boolean } | null | undefined,
): EffectivePrefs {
  if (ALWAYS_ON_EVENT_TYPES.has(eventType)) {
    return { isInAppEnabled: true, shouldSendEmail: true };
  }

  if (!prefs) {
    return { isInAppEnabled: true, shouldSendEmail: true };
  }

  return {
    isInAppEnabled: prefs.isInAppEnabled ?? true,
    shouldSendEmail: 'shouldSendEmail' in prefs
      ? prefs.shouldSendEmail
      : prefs.isEmailEnabled ?? true,
  };
}

export async function parseNotificationPayload<TPayload>(
  job: NotificationJob<unknown>,
  parsePayload: (payload: unknown) => { success: true; data: TPayload } | { success: false; error: unknown },
  label: string,
): Promise<TPayload> {
  const parsed = parsePayload(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError(`Invalid ${label} payload`);
  }

  return parsed.data;
}

export function truncateNotificationText(input: string, maxLength = 1000): string {
  return input.length > maxLength ? input.slice(0, maxLength) : input;
}

function safeLinkPath(linkPath: string | null): string | null {
  if (!linkPath) return null;
  const safeEntityPath = /^\/(?:posts|profiles|queues)(?:\/[a-z0-9-]+)?$/i;
  const safeBulkOpPath = /^\/posts\?bulkOp=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!safeEntityPath.test(linkPath) && !safeBulkOpPath.test(linkPath)) {
    return null;
  }
  return linkPath;
}

export async function resolveUserIdFromPost(
  ctx: NotificationHandlerContext,
  postId: string,
): Promise<{ userId: string; postPreview: string }> {
  const db = getDb(ctx);
  const query = db?.select?.({ userId: posts.userId, text: posts.text });
  if (isSelectChain<{ userId: string; text: string }>(query)) {
    const rows = await query.from(posts).where(eq(posts.id, postId)).limit(1);
    const row = rows[0];
    if (!row) throw new UnrecoverableError(`Unknown postId ${postId}`);
    return { userId: row.userId, postPreview: row.text.slice(0, 120) };
  }

  return { userId: FALLBACK_USER_ID, postPreview: '(preview unavailable)' };
}

export async function resolveUserIdFromProfile(
  ctx: NotificationHandlerContext,
  profileId: string,
): Promise<{ userId: string; profileLabel: string }> {
  const db = getDb(ctx);
  const query = db?.select?.({
    userId: socialProfiles.userId,
    displayName: socialProfiles.displayName,
    handle: socialProfiles.handle,
    platform: socialProfiles.platform,
  });
  if (isSelectChain<{ userId: string; displayName: string | null; handle: string | null; platform: string }>(query)) {
    const rows = await query.from(socialProfiles).where(eq(socialProfiles.id, profileId)).limit(1);
    const row = rows[0];
    if (!row) throw new UnrecoverableError(`Unknown profileId ${profileId}`);
    return {
      userId: row.userId,
      profileLabel: row.displayName ?? row.handle ?? row.platform,
    };
  }

  return { userId: FALLBACK_USER_ID, profileLabel: 'connected profile' };
}

export async function resolveUserIdFromQueue(
  ctx: NotificationHandlerContext,
  queueId: string,
): Promise<{ userId: string; queueName: string }> {
  const db = getDb(ctx);
  const query = db?.select?.({ userId: queues.userId, name: queues.name });
  if (isSelectChain<{ userId: string; name: string }>(query)) {
    const rows = await query.from(queues).where(eq(queues.id, queueId)).limit(1);
    const row = rows[0];
    if (!row) throw new UnrecoverableError(`Unknown queueId ${queueId}`);
    return { userId: row.userId, queueName: row.name };
  }

  return { userId: FALLBACK_USER_ID, queueName: 'queue' };
}

async function loadPrefsForEvent(
  ctx: NotificationHandlerContext,
  userId: string,
  eventType: NotificationEventType,
): Promise<EffectivePrefs> {
  if (ctx.prefs?.loadPrefs) {
    return normalizePrefs(eventType, await ctx.prefs.loadPrefs(userId, eventType));
  }

  const db = getDb(ctx);
  if (db && isSelectChain(db.select?.({ probe: users.id }))) {
    return loadEffectivePrefs(db, userId, eventType);
  }

  return normalizePrefs(eventType, null);
}

async function resolveRecipientEmail(
  ctx: NotificationHandlerContext,
  userId: string,
): Promise<string | null> {
  const db = getDb(ctx);
  const query = db?.select?.({ email: users.email });
  if (isSelectChain<{ email: string }>(query)) {
    const rows = await query.from(users).where(eq(users.id, userId)).limit(1);
    return rows[0]?.email ?? null;
  }

  return ctx.smtp?.sendEmail || ctx.transporter ? FALLBACK_RECIPIENT_EMAIL : null;
}

async function insertNotification(
  ctx: NotificationHandlerContext,
  row: NewNotification,
): Promise<void> {
  if (ctx.store?.insertNotification) {
    await ctx.store.insertNotification(row);
    return;
  }

  const db = getDb(ctx);
  if (db && !shouldUseMockInsert(ctx)) {
    await insertNotificationRow(db, row);
    return;
  }

  await (ctx.db as { insert?: (row: NewNotification) => Promise<unknown> | unknown } | undefined)
    ?.insert?.(row);
}

async function insertEmailLog(
  ctx: NotificationHandlerContext,
  row: NewEmailLog,
): Promise<void> {
  if (ctx.store?.insertEmailLog) {
    await ctx.store.insertEmailLog(row);
    return;
  }

  const db = getDb(ctx);
  if (db && !shouldUseMockInsert(ctx)) {
    await insertEmailLogRow(db, row);
    return;
  }

  await (ctx.db as { insert?: (row: NewEmailLog) => Promise<unknown> | unknown } | undefined)
    ?.insert?.(row);
}

async function sendNotificationEmail(
  ctx: NotificationHandlerContext,
  recipientEmail: string,
  email: RenderedNotificationEmail,
): Promise<SendEmailResult | null> {
  if (ctx.smtp?.sendEmail) {
    return ctx.smtp.sendEmail({ to: recipientEmail, ...email });
  }

  return sendEmail(ctx.transporter ?? null, ctx.smtpFrom ?? null, {
    to: recipientEmail,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

export async function performNotificationSideEffects<TPayload extends { correlationId?: string }>(
  input: NotificationSideEffectInput<TPayload>,
): Promise<void> {
  const prefs = await loadPrefsForEvent(input.ctx, input.userId, input.eventType);
  const eventSpec = getEventSpec(input.eventType);

  let inAppErr: Error | null = null;
  if (prefs.isInAppEnabled) {
    try {
      await insertNotification(input.ctx, {
        userId: input.userId,
        eventType: input.eventType,
        severity: eventSpec.severity,
        title: input.title,
        body: truncateNotificationText(input.body),
        linkPath: safeLinkPath(input.linkPath),
        payload: input.payload,
      });
    } catch (err: unknown) {
      inAppErr = err as Error;
    }
  }

  let emailErr: Error | null = null;
  if (prefs.shouldSendEmail && input.email) {
    let hasInsertedEmailLog = false;
    let recipientEmailForLog: string | null = null;
    let shouldRetryEmail = false;
    try {
      const recipientEmail = await resolveRecipientEmail(input.ctx, input.userId);
      if (!recipientEmail) {
        return;
      }
      recipientEmailForLog = recipientEmail;

      const emailResult = await sendNotificationEmail(input.ctx, recipientEmail, input.email);
      if (!emailResult) {
        return;
      }

      await insertEmailLog(input.ctx, {
        userId: input.userId,
        eventType: input.eventType,
        recipientEmail,
        subject: input.email.subject,
        status: emailResult.status,
        errorMessage: emailResult.errorMessage
          ? truncateNotificationText(emailResult.errorMessage)
          : undefined,
        smtpMessageId: emailResult.messageId,
        correlationId: input.payload.correlationId ?? '33333333-3333-3333-3333-333333333333',
      });
      hasInsertedEmailLog = true;

      if (emailResult.status === 'failed' && emailResult.isTransient) {
        shouldRetryEmail = true;
        throw new Error(emailResult.errorMessage ?? 'Email send failed');
      }
    } catch (err: unknown) {
      const caughtEmailErr = err instanceof Error ? err : new Error(String(err));
      const isPermanentHeaderValidationError =
        caughtEmailErr.message.includes('SMTP header injection');

      if (!hasInsertedEmailLog && recipientEmailForLog) {
        try {
          await insertEmailLog(input.ctx, {
            userId: input.userId,
            eventType: input.eventType,
            recipientEmail: recipientEmailForLog,
            subject: input.email.subject,
            status: 'failed',
            errorMessage: truncateNotificationText(caughtEmailErr.message),
            correlationId: input.payload.correlationId ?? '33333333-3333-3333-3333-333333333333',
          });
        } catch (emailLogErr: unknown) {
          emailErr = emailLogErr as Error;
        }
      }
      if (!emailErr && (shouldRetryEmail || !recipientEmailForLog || !isPermanentHeaderValidationError)) {
        emailErr = caughtEmailErr;
      }
    }
  }

  if (inAppErr && emailErr) {
    throw new AggregateError([inAppErr, emailErr], 'Both in-app and email notification paths failed');
  }
  if (inAppErr) {
    throw inAppErr;
  }
  if (emailErr) {
    throw emailErr;
  }
}

export function appBaseUrl(ctx: NotificationHandlerContext): string {
  return ctx.appBaseUrl ?? DEFAULT_APP_BASE_URL;
}
