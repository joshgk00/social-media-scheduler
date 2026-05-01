import { JOB_NAMES } from '@sms/shared';

const userId = '00000000-0000-4000-8000-000000000001';
const profileId = '00000000-0000-4000-8000-000000000002';
const queueId = '00000000-0000-4000-8000-000000000003';
const targetQueueId = '00000000-0000-4000-8000-000000000004';
const bulkOperationId = '00000000-0000-4000-8000-000000000005';
const idempotencyKey = '00000000-0000-4000-8000-000000000006';

function baseData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId,
    profileId,
    queueId,
    bulkOperationId,
    idempotencyKey,
    correlationId: '00000000-0000-4000-8000-000000000007',
    ...overrides,
  };
}

export function makeCsvImportScheduledJob() {
  return { name: JOB_NAMES.bulkCsvImportScheduled, data: baseData({ csvPath: '/tmp/scheduled.csv' }) };
}

export function makeCsvImportQueueJob() {
  return { name: JOB_NAMES.bulkCsvImportQueue, data: baseData({ csvPath: '/tmp/queue.csv' }) };
}

export function makeQueueRandomizeJob() {
  return { name: JOB_NAMES.bulkQueueRandomize, data: baseData() };
}

export function makeQueuePurgeJob() {
  return { name: JOB_NAMES.bulkQueuePurge, data: baseData({ typedConfirmation: 'Main Queue' }) };
}

export function makeQueueCopyJob() {
  return { name: JOB_NAMES.bulkQueueCopy, data: baseData({ targetQueueId, randomizeAfter: false }) };
}

export function makeQueueTextModifyJob() {
  return { name: JOB_NAMES.bulkQueueTextModify, data: baseData({ mode: 'append', text: '#launch', separator: ' ' }) };
}

export function makeQueueDedupeJob() {
  return { name: JOB_NAMES.bulkQueueDedupe, data: baseData() };
}

export function makeProfilePauseJob() {
  return { name: JOB_NAMES.bulkProfilePause, data: baseData({ scope: 'both' }) };
}

export function makeProfileResumeJob() {
  return { name: JOB_NAMES.bulkProfileResume, data: baseData({ scope: 'both' }) };
}

export function makeProfileBulkDeleteJob() {
  return { name: JOB_NAMES.bulkProfileBulkDelete, data: baseData({ filter: { profileId }, typedConfirmation: 'DELETE 3 POSTS' }) };
}
