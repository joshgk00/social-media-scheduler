import { z } from 'zod';
import { JOB_NAMES } from '../constants/queues.js';

export const bulkOperationNotificationSchema = z.enum([
  JOB_NAMES.bulkCsvImportScheduled,
  JOB_NAMES.bulkCsvImportQueue,
  JOB_NAMES.bulkQueueRandomize,
  JOB_NAMES.bulkQueuePurge,
  JOB_NAMES.bulkQueueCopy,
  JOB_NAMES.bulkQueueTextModify,
  JOB_NAMES.bulkQueueDedupe,
  JOB_NAMES.bulkProfilePause,
  JOB_NAMES.bulkProfileResume,
  JOB_NAMES.bulkProfileBulkDelete,
  JOB_NAMES.bulkProfileModifyTags,
]);

export const bulkCompletedNotificationSchema = z
  .object({
    eventType: z.literal('bulk_completed'),
    userId: z.string().uuid(),
    bulkOperationId: z.string().uuid(),
    operation: bulkOperationNotificationSchema,
    successCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
    errorReportPath: z.string().nullable().optional(),
    correlationId: z.string().uuid(),
  })
  .strict();

export type BulkCompletedNotification = z.infer<typeof bulkCompletedNotificationSchema>;
