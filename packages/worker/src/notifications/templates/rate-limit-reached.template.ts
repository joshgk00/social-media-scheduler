import type { RateLimitReachedNotificationEvent } from '@sms/shared';
import { renderEmailShell } from './email-shell.js';
import type { RenderedNotificationEmail } from './types.js';

export function renderRateLimitReachedEmail(
  payload: RateLimitReachedNotificationEvent,
  appBaseUrl: string,
): RenderedNotificationEmail {
  const subject = `[SMS] Rate limit reached - ${payload.platform}`;
  const profileUrl = `${appBaseUrl}/profiles/${payload.profileId}`;
  const usageLine = payload.currentUsage && payload.limit
    ? `Usage: ${payload.currentUsage} of ${payload.limit}`
    : 'Publishing is paused until the platform window resets.';
  const text = [
    'A publishing rate limit has been reached.',
    '',
    `Platform: ${payload.platform}`,
    usageLine,
    `Reference: ${payload.correlationId}`,
    '',
    `Open profile: ${profileUrl}`,
  ].join('\n');
  const html = renderEmailShell({
    appBaseUrl,
    heading: 'Rate limit reached',
    bodyParagraphs: [
      `Publishing to ${payload.platform} is paused until the platform window resets.`,
      usageLine,
      `Reference: ${payload.correlationId}`,
    ],
    cta: { url: profileUrl, label: 'Open profile' },
  });

  return { subject, text, html };
}
