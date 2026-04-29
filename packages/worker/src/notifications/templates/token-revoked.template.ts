import type { TokenNotificationEvent } from '@sms/shared';
import { renderEmailShell } from './email-shell.js';
import type { RenderedNotificationEmail } from './types.js';

export function renderTokenRevokedEmail(
  payload: TokenNotificationEvent,
  appBaseUrl: string,
): RenderedNotificationEmail {
  const subject = `[SMS] Token revoked - ${payload.platform}`;
  const profileUrl = `${appBaseUrl}/profiles/${payload.profileId}`;
  const text = [
    'A platform revoked one of your connected profile tokens.',
    '',
    `Platform: ${payload.platform}`,
    `Reason: ${payload.reason}`,
    '',
    `Open profile: ${profileUrl}`,
  ].join('\n');
  const html = renderEmailShell({
    appBaseUrl,
    heading: 'Token revoked',
    bodyParagraphs: [
      `A ${payload.platform} token was revoked by the platform.`,
      `Reason: ${payload.reason}`,
    ],
    cta: { url: profileUrl, label: 'Open profile' },
  });

  return { subject, text, html };
}
