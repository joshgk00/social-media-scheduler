import type { PublishFailedNotificationEvent } from '@sms/shared';
import { renderEmailShell } from './email-shell.js';
import type { RenderedNotificationEmail } from './types.js';

export interface PublishFailedEmailPayload extends PublishFailedNotificationEvent {
  profileLabel: string;
  postPreview: string;
}

export function renderPublishFailedEmail(
  payload: PublishFailedEmailPayload,
  appBaseUrl: string,
): RenderedNotificationEmail {
  const subject = `[SMS] Publish failed - ${payload.profileLabel}`;
  const postUrl = `${appBaseUrl}/posts/${payload.postId}`;
  const text = [
    'A scheduled post failed all retry attempts.',
    '',
    `Profile: ${payload.profileLabel}`,
    `Preview: ${payload.postPreview}`,
    `Reason: ${payload.errorMessage}`,
    '',
    `Open the post: ${postUrl}`,
  ].join('\n');
  const html = renderEmailShell({
    appBaseUrl,
    heading: 'Publish failed',
    bodyParagraphs: [
      `A scheduled post on ${payload.profileLabel} failed all retry attempts.`,
      `Preview: ${payload.postPreview}`,
      `Reason: ${payload.errorMessage}`,
    ],
    cta: { url: postUrl, label: 'Open the post' },
  });

  return { subject, text, html };
}
