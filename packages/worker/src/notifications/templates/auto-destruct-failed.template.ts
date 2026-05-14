import type { AutoDestructFailedNotificationEvent } from '@sms/shared';
import { renderEmailShell } from './email-shell.js';
import type { RenderedNotificationEmail } from './types.js';

export function renderAutoDestructFailedEmail(
  payload: AutoDestructFailedNotificationEvent,
  appBaseUrl: string,
): RenderedNotificationEmail {
  const subject = `[SMS] Auto-destruct failed - ${payload.postId}`;
  const postUrl = `${appBaseUrl}/posts/${payload.postId}`;
  const text = [
    'A scheduled post deletion failed.',
    '',
    `Post: ${payload.postId}`,
    `Reason: ${payload.errorMessage}`,
    '',
    `Open the post: ${postUrl}`,
  ].join('\n');
  const html = renderEmailShell({
    appBaseUrl,
    heading: 'Auto-destruct failed',
    bodyParagraphs: [
      `Post ${payload.postId} could not be deleted from the platform.`,
      `Reason: ${payload.errorMessage}`,
    ],
    cta: { url: postUrl, label: 'Open the post' },
  });

  return { subject, text, html };
}
