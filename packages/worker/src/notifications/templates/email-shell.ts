import { escapeHtml } from './escape-html.js';

export interface EmailShellInput {
  appBaseUrl: string;
  heading: string;
  bodyParagraphs: ReadonlyArray<string>;
  cta?: {
    url: string;
    label: string;
  };
}

export function renderEmailShell(input: EmailShellInput): string {
  const escapedHeading = escapeHtml(input.heading);
  const paragraphs = input.bodyParagraphs
    .map((paragraph) => `<p style="margin:0 0 16px;color:#27272a;font-size:14px;line-height:20px;">${escapeHtml(paragraph)}</p>`)
    .join('');
  const ctaHtml = input.cta
    ? `<tr><td style="padding:8px 0 24px;"><a href="${escapeHtml(input.cta.url)}" style="display:inline-block;background:#18181b;color:#fafafa;text-decoration:none;border-radius:6px;padding:10px 14px;font-size:14px;">${escapeHtml(input.cta.label)}</a></td></tr>`
    : '';
  const prefsUrl = `${input.appBaseUrl}/settings?tab=notifications`;

  return [
    '<!doctype html>',
    '<html>',
    '<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">',
    '<tr><td align="center">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-collapse:collapse;">',
    '<tr><td style="background:#18181b;color:#fafafa;padding:16px 24px;font-size:16px;font-weight:600;">Social Media Scheduler</td></tr>',
    `<tr><td style="padding:24px 24px 8px;"><h1 style="margin:0;color:#18181b;font-size:20px;line-height:28px;font-weight:600;">${escapedHeading}</h1></td></tr>`,
    `<tr><td style="padding:8px 24px 0;">${paragraphs}</td></tr>`,
    ctaHtml ? `<tr><td style="padding:0 24px;">${ctaHtml}</td></tr>` : '',
    `<tr><td style="padding:16px 24px 24px;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px;line-height:16px;">You can change which notifications send email at <a href="${escapeHtml(prefsUrl)}" style="color:#18181b;">/settings/notifications</a>.</td></tr>`,
    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('');
}
