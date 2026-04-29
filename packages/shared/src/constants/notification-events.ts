import { z } from 'zod';

export const notificationEventTypes = [
  'publish_failed',
  'token_expiring_soon',
  'token_reauth_required',
  'token_revoked',
  'token_refresh_failed',
  'rate_limit_warn',
  'rate_limit_reached',
  'queue_empty',
  'auto_destruct_failed',
  'bulk_completed',
] as const;

export type NotificationEventType = (typeof notificationEventTypes)[number];

export const notificationEventTypeSchema = z.enum(notificationEventTypes);

export interface NotificationEventSpec {
  eventType: NotificationEventType;
  label: string;
  helpText: string;
  severity: 'info' | 'warning' | 'error';
  supportsEmail: boolean;
  alwaysOn: boolean;
  deferred?: boolean;
}

export const NOTIFICATION_EVENTS: ReadonlyArray<NotificationEventSpec> = [
  {
    eventType: 'publish_failed',
    label: 'Publish failed',
    helpText: 'A scheduled post failed all retry attempts.',
    severity: 'error',
    supportsEmail: true,
    alwaysOn: false,
  },
  {
    eventType: 'token_expiring_soon',
    label: 'Token expiring soon',
    helpText: "A connected profile's token expires within 7 days.",
    severity: 'warning',
    supportsEmail: true,
    alwaysOn: false,
  },
  {
    eventType: 'token_reauth_required',
    label: 'Re-authentication required',
    helpText: 'A profile needs you to log in again.',
    severity: 'error',
    supportsEmail: true,
    alwaysOn: true,
  },
  {
    eventType: 'token_revoked',
    label: 'Token revoked',
    helpText: "A profile's token was revoked by the platform.",
    severity: 'error',
    supportsEmail: true,
    alwaysOn: true,
  },
  {
    eventType: 'token_refresh_failed',
    label: 'Token refresh failed',
    helpText: 'Automatic token refresh hit an error.',
    severity: 'error',
    supportsEmail: true,
    alwaysOn: true,
  },
  {
    eventType: 'rate_limit_warn',
    label: 'Rate limit warning',
    helpText: 'A profile is approaching its monthly publish budget.',
    severity: 'warning',
    supportsEmail: false,
    alwaysOn: false,
  },
  {
    eventType: 'rate_limit_reached',
    label: 'Rate limit reached',
    helpText: 'Publishing is paused for the rest of the billing month.',
    severity: 'error',
    supportsEmail: true,
    alwaysOn: true,
  },
  {
    eventType: 'queue_empty',
    label: 'Queue empty',
    helpText: 'A queue has run out of posts to publish.',
    severity: 'info',
    supportsEmail: false,
    alwaysOn: false,
  },
  {
    eventType: 'auto_destruct_failed',
    label: 'Auto-destruct failed',
    helpText: "A scheduled post deletion didn't go through.",
    severity: 'error',
    supportsEmail: true,
    alwaysOn: false,
  },
  {
    eventType: 'bulk_completed',
    label: 'Bulk operation completed',
    helpText: 'Available when bulk operations ship in Phase 10.',
    severity: 'info',
    supportsEmail: false,
    alwaysOn: false,
    deferred: true,
  },
];

export const ALWAYS_ON_EVENT_TYPES: ReadonlySet<NotificationEventType> = new Set(
  NOTIFICATION_EVENTS.filter((eventSpec) => eventSpec.alwaysOn).map((eventSpec) => eventSpec.eventType),
);

export function getEventSpec(eventType: NotificationEventType): NotificationEventSpec {
  const eventSpec = NOTIFICATION_EVENTS.find((candidateEventSpec) => candidateEventSpec.eventType === eventType);

  if (!eventSpec) {
    throw new Error(`Unknown event_type: ${eventType}`);
  }

  return eventSpec;
}
