import type { TokenNotificationEvent } from '@sms/shared';
import { renderEmailShell } from './email-shell.js';
import type { RenderedNotificationEmail } from './types.js';

export function renderTokenReauthRequiredEmail(
  payload: TokenNotificationEvent,
  appBaseUrl: string,
): RenderedNotificationEmail {
  const subject = `[SMS] Re-authentication required - ${payload.platform}`;
  const profileUrl = `${appBaseUrl}/profiles/${payload.profileId}`;
  const text = [
    'A connected profile needs you to sign in again.',
    '',
    `Platform: ${payload.platform}`,
    `Reason: ${payload.reason}`,
    '',
    `Open profile: ${profileUrl}`,
  ].join('\n');
  const html = renderEmailShell({
    appBaseUrl,
    heading: 'Re-authentication required',
    bodyParagraphs: [
      `A ${payload.platform} profile needs you to sign in again.`,
      `Reason: ${payload.reason}`,
    ],
    cta: { url: profileUrl, label: 'Open profile' },
  });

  return { subject, text, html };
}
