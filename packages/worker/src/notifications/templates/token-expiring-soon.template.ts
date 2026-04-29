import type { TokenNotificationEvent } from '@sms/shared';
import { renderEmailShell } from './email-shell.js';
import type { RenderedNotificationEmail } from './types.js';

export function renderTokenExpiringSoonEmail(
  payload: TokenNotificationEvent,
  appBaseUrl: string,
): RenderedNotificationEmail {
  const subject = `[SMS] Token expiring soon - ${payload.platform}`;
  const profileUrl = `${appBaseUrl}/profiles/${payload.profileId}`;
  const text = [
    'A connected profile token expires soon.',
    '',
    `Platform: ${payload.platform}`,
    `Reason: ${payload.reason}`,
    '',
    `Open profile: ${profileUrl}`,
  ].join('\n');
  const html = renderEmailShell({
    appBaseUrl,
    heading: 'Token expiring soon',
    bodyParagraphs: [
      `A ${payload.platform} profile token expires soon.`,
      `Reason: ${payload.reason}`,
    ],
    cta: { url: profileUrl, label: 'Open profile' },
  });

  return { subject, text, html };
}
