import nodemailer, { type Transporter } from 'nodemailer';
import { createLogger } from '@sms/shared/logger';

const logger = createLogger('smtp');

export interface SmtpResult {
  transporter: Transporter | null;
  smtpFrom: string | null;
  isConfigured?: boolean;
}

export interface SendEmailMessage {
  transporter?: Transporter | null;
  smtpFrom?: string | null;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendEmailResult {
  status: 'sent' | 'failed';
  messageId?: string;
  errorMessage?: string;
  isTransient: boolean;
}

const TRANSIENT_SMTP_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'EDNS', 'ESOCKET']);

export function buildSmtpTransporter(): SmtpResult {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  const missingVars = [
    !host && 'SMTP_HOST',
    !port && 'SMTP_PORT',
    !user && 'SMTP_USER',
    !pass && 'SMTP_PASS',
    !from && 'SMTP_FROM',
  ].filter((envVar): envVar is string => Boolean(envVar));

  if (missingVars.length > 0) {
    logger.warn({ missingVars }, 'SMTP not configured - email notifications disabled');
    return { transporter: null, smtpFrom: null };
  }

  const hostName = host;
  const portValue = port;
  const userName = user;
  const password = pass;
  const smtpFrom = from;
  if (!hostName || !portValue || !userName || !password || !smtpFrom) {
    return { transporter: null, smtpFrom: null };
  }

  const portNumber = Number.parseInt(portValue, 10);
  const transporter = nodemailer.createTransport({
    host: hostName,
    port: portNumber,
    secure: portNumber === 465,
    auth: { user: userName, pass: password },
  });

  transporter.verify().catch((err: Error & { code?: string }) => {
    logger.error(
      { err: { code: err.code, message: err.message } },
      'SMTP verify failed at startup',
    );
  });

  return { transporter, smtpFrom, isConfigured: true };
}

function assertNoCrlf(field: string, value: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`SMTP header injection: CRLF detected in ${field}`);
  }
}

export function classifyError(err: unknown): { errorMessage: string; isTransient: boolean } {
  const smtpError = err as { code?: string; responseCode?: number; message?: string };
  const isTransientByCode = smtpError.code ? TRANSIENT_SMTP_CODES.has(smtpError.code) : false;
  const isTransientByResponse =
    typeof smtpError.responseCode === 'number' &&
    smtpError.responseCode >= 400 &&
    smtpError.responseCode < 500;

  return {
    errorMessage: smtpError.message ?? String(err),
    isTransient: isTransientByCode || isTransientByResponse,
  };
}

export async function sendEmail(message: SendEmailMessage): Promise<SendEmailResult>;
export async function sendEmail(
  transporter: Transporter | null,
  smtpFrom: string | null,
  message: Omit<SendEmailMessage, 'transporter' | 'smtpFrom'>,
): Promise<SendEmailResult>;
export async function sendEmail(
  first: Transporter | SendEmailMessage | null,
  second?: string | null,
  third?: Omit<SendEmailMessage, 'transporter' | 'smtpFrom'>,
): Promise<SendEmailResult> {
  const message = third
    ? { ...third, transporter: first as Transporter | null, smtpFrom: second ?? null }
    : first as SendEmailMessage;

  assertNoCrlf('subject', message.subject);
  assertNoCrlf('to', message.to);
  if (message.smtpFrom) {
    assertNoCrlf('from', message.smtpFrom);
  }

  if (!message.transporter || !message.smtpFrom) {
    return { status: 'failed', errorMessage: 'smtp_not_configured', isTransient: false };
  }

  try {
    const info = await message.transporter.sendMail({
      from: message.smtpFrom,
      to: message.to,
      envelope: { from: message.smtpFrom, to: message.to },
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { status: 'sent', messageId: info.messageId, isTransient: false };
  } catch (err: unknown) {
    return { status: 'failed', ...classifyError(err) };
  }
}
