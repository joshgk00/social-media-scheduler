import { z } from 'zod';

export const MAX_BULK_CSV_ROWS = 5_000;

const durationLiteral = z
  .string()
  .regex(/^\d+[smhd]$/i, 'Use formats like 7d, 12h, 30m');

const booleanCellSchema = z
  .union([z.literal('true'), z.literal('false'), z.literal('')])
  .optional();

const tagCellSchema = z
  .string()
  .optional()
  .transform((tagCell) =>
    tagCell ? tagCell.split(';').map((tag) => tag.trim()).filter(Boolean) : [],
  );

const autoDestructCellSchema = z
  .union([durationLiteral, z.literal('')])
  .optional()
  .transform((duration) => duration || undefined);

export const csvScheduledRowSchema = z
  .object({
    text: z
      .string()
      .min(1)
      .max(10_000)
      .refine((text) => !text.startsWith('\uFEFF'), 'Remove UTF-8 BOM from text cell'),
    scheduled_at: z.string().datetime({ offset: true }),
    tags: tagCellSchema,
    spinnable: booleanCellSchema.transform((value) => value === 'true'),
    auto_destruct_after: autoDestructCellSchema,
    recycle: booleanCellSchema,
    notes: z.string().max(2_000).optional(),
  })
  .strict();

export type CsvScheduledRow = z.infer<typeof csvScheduledRowSchema>;

export const csvQueueRowSchema = csvScheduledRowSchema
  .omit({ scheduled_at: true, recycle: true })
  .extend({
    queue_name: z.string().min(1).max(255),
    position: z
      .union([z.coerce.number().int().min(1), z.literal('')])
      .optional()
      .transform((position) => (position === '' ? undefined : position)),
  })
  .strict();

export type CsvQueueRow = z.infer<typeof csvQueueRowSchema>;

const csvScheduledJobRowSchema = z
  .object({
    rowNumber: z.number().int().min(2).optional(),
    text: z
      .string()
      .min(1)
      .max(10_000)
      .refine((text) => !text.startsWith('\uFEFF'), 'Remove UTF-8 BOM from text cell'),
    scheduled_at: z.string().datetime({ offset: true }),
    tags: z.array(z.string()),
    spinnable: z.boolean(),
    auto_destruct_after: z.string().regex(/^\d+[smhd]$/i, 'Use formats like 7d, 12h, 30m').optional(),
    recycle: z.union([z.literal('true'), z.literal('false'), z.literal('')]).optional(),
    notes: z.string().max(2_000).optional(),
  })
  .strict();

const csvQueueJobRowSchema = z
  .object({
    rowNumber: z.number().int().min(2).optional(),
    text: z
      .string()
      .min(1)
      .max(10_000)
      .refine((text) => !text.startsWith('\uFEFF'), 'Remove UTF-8 BOM from text cell'),
    queue_name: z.string().min(1).max(255),
    position: z.number().int().min(1).optional(),
    tags: z.array(z.string()),
    spinnable: z.boolean(),
    auto_destruct_after: z.string().regex(/^\d+[smhd]$/i, 'Use formats like 7d, 12h, 30m').optional(),
    notes: z.string().max(2_000).optional(),
  })
  .strict();

export const csvImportScheduledJobDataSchema = z
  .object({
    profileId: z.string().uuid(),
    rows: z.array(csvScheduledJobRowSchema).max(MAX_BULK_CSV_ROWS),
    errors: z.array(z.unknown()).default([]),
  })
  .strict();

export const csvImportQueueJobDataSchema = z
  .object({
    profileId: z.string().uuid(),
    queueId: z.string().uuid(),
    rows: z.array(csvQueueJobRowSchema).max(MAX_BULK_CSV_ROWS),
    errors: z.array(z.unknown()).default([]),
  })
  .strict();

export const bulkImportRequestSchema = z
  .object({
    target: z.enum(['scheduled', 'queue']),
    profileId: z.string().uuid(),
    queueId: z.string().uuid().optional(),
  })
  .strict()
  .refine((data) => data.target !== 'queue' || data.queueId !== undefined, {
    message: 'queueId required when target=queue',
    path: ['queueId'],
  });

export type BulkImportRequest = z.infer<typeof bulkImportRequestSchema>;
export type CsvImportScheduledJobData = z.infer<typeof csvImportScheduledJobDataSchema>;
export type CsvImportQueueJobData = z.infer<typeof csvImportQueueJobDataSchema>;
