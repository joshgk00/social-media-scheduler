import { renderEmailShell } from './email-shell.js';
import { renderAutoDestructFailedEmail } from './auto-destruct-failed.template.js';
import { renderPublishFailedEmail } from './publish-failed.template.js';
import { renderRateLimitReachedEmail } from './rate-limit-reached.template.js';
import { renderTokenExpiringSoonEmail } from './token-expiring-soon.template.js';
import { renderTokenReauthRequiredEmail } from './token-reauth-required.template.js';
import { renderTokenRefreshFailedEmail } from './token-refresh-failed.template.js';
import { renderTokenRevokedEmail } from './token-revoked.template.js';

interface RenderAllTemplatesInput {
  appBaseUrl: string;
  errorMessage: string;
  profileName: string;
}

interface RenderedTemplate {
  subject: string;
  text: string;
  html: string;
}

export function renderAllNotificationTemplates(input: RenderAllTemplatesInput): RenderedTemplate[] {
  const bodyParagraphs = [
    `Profile: ${input.profileName}`,
    `Reason: ${input.errorMessage}`,
  ];

  const publishFailed = {
    eventType: 'publish_failed' as const,
    postId: '11111111-1111-1111-1111-111111111111',
    profileId: '22222222-2222-2222-2222-222222222222',
    errorMessage: input.errorMessage,
    correlationId: '33333333-3333-3333-3333-333333333333',
    occurredAt: '2026-04-28T12:00:00.000Z',
  };
  const tokenPayload = {
    eventType: 'token_revoked' as const,
    profileId: '22222222-2222-2222-2222-222222222222',
    userId: '44444444-4444-4444-4444-444444444444',
    platform: 'twitter' as const,
    reason: input.errorMessage,
    correlationId: '33333333-3333-3333-3333-333333333333',
    occurredAt: '2026-04-28T12:00:00.000Z',
  };

  return [
    {
      subject: `[SMS] Publish failed - ${input.profileName}`,
      text: bodyParagraphs.join('\n'),
      html: renderEmailShell({
        appBaseUrl: input.appBaseUrl,
        heading: 'Publish failed',
        bodyParagraphs,
        cta: { url: `${input.appBaseUrl}/posts`, label: 'Open posts' },
      }),
    },
    renderPublishFailedEmail({ ...publishFailed, profileLabel: input.profileName, postPreview: input.errorMessage }, input.appBaseUrl),
    renderRateLimitReachedEmail({
      kind: 'rate_limit_reached',
      userId: '44444444-4444-4444-4444-444444444444',
      profileId: '22222222-2222-2222-2222-222222222222',
      platform: 'twitter',
      currentUsage: 500,
      limit: 500,
      correlationId: input.errorMessage,
      triggeredAt: '2026-04-28T12:00:00.000Z',
    }, input.appBaseUrl),
    renderAutoDestructFailedEmail({
      postId: '11111111-1111-1111-1111-111111111111',
      profileId: '22222222-2222-2222-2222-222222222222',
      errorMessage: input.errorMessage,
      correlationId: '33333333-3333-3333-3333-333333333333',
      occurredAt: '2026-04-28T12:00:00.000Z',
    }, input.appBaseUrl),
    renderTokenExpiringSoonEmail({ ...tokenPayload, eventType: 'token_expiring_soon' }, input.appBaseUrl),
    renderTokenReauthRequiredEmail({ ...tokenPayload, eventType: 'token_reauth_required' }, input.appBaseUrl),
    renderTokenRevokedEmail(tokenPayload, input.appBaseUrl),
    renderTokenRefreshFailedEmail({ ...tokenPayload, eventType: 'token_refresh_failed' }, input.appBaseUrl),
  ];
}
