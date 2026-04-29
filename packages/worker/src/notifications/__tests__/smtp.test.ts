import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockTransporter } from './helpers/build-smtp-transporter.js';

import { buildSmtpTransporter, sendEmail } from '../smtp.js';

const smtpEnv = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'sender@example.com',
  SMTP_PASS: 'secret',
  SMTP_FROM: 'Social Media Scheduler <sender@example.com>',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  for (const envKey of Object.keys(smtpEnv)) {
    delete process.env[envKey];
  }
});

describe('buildSmtpTransporter', () => {
  it.each(Object.keys(smtpEnv))('returns in-app-only mode when %s is missing', (missingEnvKey) => {
    Object.assign(process.env, smtpEnv);
    delete process.env[missingEnvKey];

    expect(buildSmtpTransporter()).toEqual({ transporter: null, smtpFrom: null });
  });

  it('creates a secure transporter only for SMTP port 465', () => {
    Object.assign(process.env, smtpEnv);

    const smtpTransport = buildSmtpTransporter();

    expect(smtpTransport.transporter).toBeTruthy();
    expect(smtpTransport.smtpFrom).toBe(smtpEnv.SMTP_FROM);
    expect(smtpTransport.isConfigured).toBe(true);
  });

  it.each(['abc', '123abc', '0', '65536'])('returns in-app-only mode when SMTP_PORT is invalid: %s', (smtpPort) => {
    Object.assign(process.env, smtpEnv, { SMTP_PORT: smtpPort });

    expect(buildSmtpTransporter()).toEqual({ transporter: null, smtpFrom: null });
  });
});

describe('sendEmail', () => {
  it('records smtp_not_configured without calling sendMail', async () => {
    const emailStatus = await sendEmail({
      transporter: null,
      smtpFrom: null,
      to: 'recipient@example.com',
      subject: '[SMS] Publish failed',
      text: 'Failure',
      html: '<p>Failure</p>',
    });

    expect(emailStatus).toMatchObject({
      status: 'failed',
      errorMessage: 'smtp_not_configured',
      isTransient: false,
    });
  });

  it.each(['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'EDNS', 'ESOCKET'])('classifies %s errors', async (errorCode) => {
    const smtpError = Object.assign(new Error(errorCode), { code: errorCode });
    const emailStatus = await sendEmail({
      transporter: createMockTransporter({ rejectWith: smtpError }),
      smtpFrom: smtpEnv.SMTP_FROM,
      to: 'recipient@example.com',
      subject: '[SMS] Publish failed',
      text: 'Failure',
      html: '<p>Failure</p>',
    });

    expect(emailStatus.isTransient).toBe(errorCode !== 'EAUTH');
  });

  it.each([421, 451, 550, 554])('classifies SMTP response code %s', async (responseCode) => {
    const smtpError = Object.assign(new Error(String(responseCode)), { responseCode });
    const emailStatus = await sendEmail({
      transporter: createMockTransporter({ rejectWith: smtpError }),
      smtpFrom: smtpEnv.SMTP_FROM,
      to: 'recipient@example.com',
      subject: '[SMS] Publish failed',
      text: 'Failure',
      html: '<p>Failure</p>',
    });

    expect(emailStatus.isTransient).toBe(responseCode >= 400 && responseCode < 500);
  });

  it.each(['[SMS] Bad\nSubject', '[SMS] Bad\rSubject'])('rejects CRLF subject injection before sendMail', async (subject) => {
    const transporter = createMockTransporter();

    await expect(sendEmail({
      transporter,
      smtpFrom: smtpEnv.SMTP_FROM,
      to: 'recipient@example.com',
      subject,
      text: 'Failure',
      html: '<p>Failure</p>',
    })).rejects.toThrow(/subject/i);

    expect(transporter.sendMail).not.toHaveBeenCalled();
  });
});
