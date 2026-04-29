import { JOB_NAMES, type JobName } from '@sms/shared';

interface MockNotificationJob<TPayload> {
  id: string;
  name: JobName;
  data: TPayload;
  attemptsMade: number;
}

function buildJob<TPayload>(
  name: JobName,
  data: TPayload,
  overrides: Partial<MockNotificationJob<TPayload>> = {},
): MockNotificationJob<TPayload> {
  return {
    id: 'notification-job-1',
    name,
    data,
    attemptsMade: 0,
    ...overrides,
  };
}

export function seedPublishFailedJob(overrides: Record<string, unknown> = {}): MockNotificationJob<Record<string, unknown>> {
  return buildJob(JOB_NAMES.publishFailedNotification, {
    eventType: 'publish_failed',
    postId: '11111111-1111-1111-1111-111111111111',
    profileId: '22222222-2222-2222-2222-222222222222',
    errorMessage: 'Permanent publish failure',
    correlationId: '33333333-3333-3333-3333-333333333333',
    occurredAt: '2026-04-28T12:00:00.000Z',
    ...overrides,
  });
}

export function seedRateLimitWarnJob(overrides: Record<string, unknown> = {}): MockNotificationJob<Record<string, unknown>> {
  return buildJob(JOB_NAMES.rateLimitWarnNotification, {
    profileId: '22222222-2222-2222-2222-222222222222',
    currentUsage: 400,
    monthlyBudget: 500,
    warnThresholdPercent: 80,
    triggeredAt: '2026-04-28T12:00:00.000Z',
    ...overrides,
  });
}

export function seedRateLimitReachedJob(overrides: Record<string, unknown> = {}): MockNotificationJob<Record<string, unknown>> {
  return buildJob(JOB_NAMES.rateLimitReachedNotification, {
    kind: 'rate_limit_reached',
    userId: '44444444-4444-4444-4444-444444444444',
    profileId: '22222222-2222-2222-2222-222222222222',
    platform: 'twitter',
    currentUsage: 500,
    limit: 500,
    correlationId: '33333333-3333-3333-3333-333333333333',
    triggeredAt: '2026-04-28T12:00:00.000Z',
    ...overrides,
  });
}

export function seedQueueEmptyJob(overrides: Record<string, unknown> = {}): MockNotificationJob<Record<string, unknown>> {
  return buildJob(JOB_NAMES.queueEmptyNotification, {
    queueId: '55555555-5555-5555-5555-555555555555',
    queueName: 'Evergreen queue',
    profileId: '22222222-2222-2222-2222-222222222222',
    correlationId: '33333333-3333-3333-3333-333333333333',
    occurredAt: '2026-04-28T12:00:00.000Z',
    ...overrides,
  });
}

export function seedAutoDestructFailedJob(overrides: Record<string, unknown> = {}): MockNotificationJob<Record<string, unknown>> {
  return buildJob(JOB_NAMES.autoDestructFailedNotification, {
    postId: '11111111-1111-1111-1111-111111111111',
    profileId: '22222222-2222-2222-2222-222222222222',
    errorMessage: 'Delete failed',
    correlationId: '33333333-3333-3333-3333-333333333333',
    occurredAt: '2026-04-28T12:00:00.000Z',
    ...overrides,
  });
}

export function seedTokenJob(name: JobName, overrides: Record<string, unknown> = {}): MockNotificationJob<Record<string, unknown>> {
  return buildJob(name, {
    eventType: 'token_revoked',
    profileId: '22222222-2222-2222-2222-222222222222',
    userId: '44444444-4444-4444-4444-444444444444',
    platform: 'twitter',
    reason: 'Token revoked by platform',
    correlationId: '33333333-3333-3333-3333-333333333333',
    occurredAt: '2026-04-28T12:00:00.000Z',
    ...overrides,
  });
}
