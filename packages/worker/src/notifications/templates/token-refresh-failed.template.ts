import type { TokenNotificationEvent } from '@sms/shared';
import { renderEmailShell } from './email-shell.js';
import type { RenderedNotificationEmail } from './types.js';

export function renderTokenRefreshFailedEmail(
  payload: TokenNotificationEvent,
  appBaseUrl: string,
): RenderedNotificationEmail {
  const subject = `[SMS] Token refresh failed - ${payload.platform}`;
  const profileUrl = `${appBaseUrl}/profiles/${payload.profileId}`;
  const text = [
    'Automatic token refresh failed.',
    '',
    `Platform: ${payload.platform}`,
    `Reason: ${payload.reason}`,
    '',
    `Open profile: ${profileUrl}`,
  ].join('\n');
  const html = renderEmailShell({
    appBaseUrl,
    heading: 'Token refresh failed',
    bodyParagraphs: [
      `Automatic refresh for a ${payload.platform} token failed.`,
      `Reason: ${payload.reason}`,
    ],
    cta: { url: profileUrl, label: 'Open profile' },
  });

  return { subject, text, html };
}
