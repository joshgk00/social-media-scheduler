import { JOB_NAMES, type BulkJobPayload, type JobName } from '@sms/shared';

const userId = '00000000-0000-4000-8000-000000000001';
const profileId = '00000000-0000-4000-8000-000000000002';
const queueId = '00000000-0000-4000-8000-000000000003';
const targetQueueId = '00000000-0000-4000-8000-000000000004';
const bulkOperationId = '00000000-0000-4000-8000-000000000005';
const idempotencyKey = '00000000-0000-4000-8000-000000000006';

function baseJob(
  name: JobName,
  params: Record<string, unknown> = {},
  overrides: Partial<BulkJobPayload> = {},
) {
  return {
    name,
    data: {
      bulkOperationId,
      userId,
      operationType: name,
      targetKind: 'queue' as const,
      targetId: queueId,
      idempotencyKey,
      params,
      correlationId: '00000000-0000-4000-8000-000000000007',
      ...overrides,
    },
  };
}

export function makeCsvImportScheduledJob() {
  return baseJob(
    JOB_NAMES.bulkCsvImportScheduled,
    { profileId, rows: [], errors: [] },
    { targetKind: 'profile', targetId: profileId },
  );
}

export function makeCsvImportQueueJob() {
  return baseJob(JOB_NAMES.bulkCsvImportQueue, { profileId, queueId, rows: [], errors: [] });
}

export function makeQueueRandomizeJob() {
  return baseJob(JOB_NAMES.bulkQueueRandomize);
}

export function makeQueuePurgeJob() {
  return baseJob(JOB_NAMES.bulkQueuePurge, { typedConfirmation: 'Main Queue' });
}

export function makeQueueCopyJob() {
  return baseJob(JOB_NAMES.bulkQueueCopy, { targetQueueId, randomizeAfter: false });
}

export function makeQueueTextModifyJob() {
  return baseJob(JOB_NAMES.bulkQueueTextModify, { mode: 'append', text: '#launch', separator: ' ' });
}

export function makeQueueDedupeJob() {
  return baseJob(JOB_NAMES.bulkQueueDedupe);
}

export function makeProfilePauseJob() {
  return baseJob(JOB_NAMES.bulkProfilePause, { scope: 'both' }, { targetKind: 'profile', targetId: profileId });
}

export function makeProfileResumeJob() {
  return baseJob(JOB_NAMES.bulkProfileResume, { scope: 'both' }, { targetKind: 'profile', targetId: profileId });
}

export function makeProfileBulkDeleteJob() {
  return baseJob(
    JOB_NAMES.bulkProfileBulkDelete,
    { postIds: [targetQueueId], typedConfirmation: 'DELETE 1 POSTS', postCount: 1 },
    { targetKind: 'scheduled-list', targetId: null },
  );
}
