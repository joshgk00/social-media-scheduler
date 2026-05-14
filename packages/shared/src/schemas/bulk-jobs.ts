import { z } from 'zod';

export const bulkJobPayloadSchema = z
  .object({
    bulkOperationId: z.string().uuid(),
    userId: z.string().uuid(),
    operationType: z.string().min(1),
    targetKind: z.enum(['profile', 'queue', 'scheduled-list']),
    targetId: z.string().uuid().nullable(),
    idempotencyKey: z.string().uuid(),
    params: z.record(z.unknown()),
    correlationId: z.string().uuid(),
  })
  .strict();

export type BulkJobPayload = z.infer<typeof bulkJobPayloadSchema>;
