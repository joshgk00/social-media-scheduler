import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  autoDestructFailedNotificationSchema,
  bulkCompletedNotificationSchema,
  bulkJobPayloadSchema,
  csvImportQueueJobDataSchema,
  csvImportScheduledJobDataSchema,
  publishFailedNotificationSchema,
  queueEmptyNotificationSchema,
  rateLimitReachedNotificationSchema,
  rateLimitWarnNotificationSchema,
  tokenNotificationEventSchema,
} from '@sms/shared';

const FORBIDDEN_KEY_RE = /openai|api[_-]?key/i;

function getSchemaShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> | null {
  if (schema instanceof z.ZodObject) {
    return schema.shape;
  }

  if ('unwrap' in schema && typeof schema.unwrap === 'function') {
    const unwrapped = schema.unwrap();
    return getSchemaShape(unwrapped);
  }

  const withDef = schema as z.ZodTypeAny & {
    _def?: {
      schema?: z.ZodTypeAny;
      innerType?: z.ZodTypeAny;
      out?: z.ZodTypeAny;
      in?: z.ZodTypeAny;
    };
  };

  if (withDef._def?.schema) {
    return getSchemaShape(withDef._def.schema);
  }

  if (withDef._def?.innerType) {
    return getSchemaShape(withDef._def.innerType);
  }

  if (withDef._def?.out) {
    return getSchemaShape(withDef._def.out);
  }

  if (withDef._def?.in) {
    return getSchemaShape(withDef._def.in);
  }

  return null;
}

const allSchemaEntries: Array<[string, z.ZodTypeAny]> = [
  ['bulkJobs.bulkJobPayloadSchema', bulkJobPayloadSchema],
  ['bulkImport.csvImportScheduledJobDataSchema', csvImportScheduledJobDataSchema],
  ['bulkImport.csvImportQueueJobDataSchema', csvImportQueueJobDataSchema],
  ['bulkNotifications.bulkCompletedNotificationSchema', bulkCompletedNotificationSchema],
  ['notifications.tokenNotificationEventSchema', tokenNotificationEventSchema],
  ['notifications.publishFailedNotificationSchema', publishFailedNotificationSchema],
  ['notifications.rateLimitWarnNotificationSchema', rateLimitWarnNotificationSchema],
  ['notifications.rateLimitReachedNotificationSchema', rateLimitReachedNotificationSchema],
  ['notifications.queueEmptyNotificationSchema', queueEmptyNotificationSchema],
  ['notifications.autoDestructFailedNotificationSchema', autoDestructFailedNotificationSchema],
];

describe('SEC-07: BullMQ job-data schemas reject OpenAI/api-key fields', () => {
  it('discovers at least one schema to inspect', () => {
    expect(allSchemaEntries.length).toBeGreaterThan(0);
  });

  it.each(allSchemaEntries)(
    '%s declares no OpenAI/api-key field',
    (schemaLabel: string, schema: z.ZodTypeAny) => {
      const shape = getSchemaShape(schema);

      if (!shape) {
        expect(shape, `schema "${schemaLabel}" is not object-backed`).not.toBeNull();
        return;
      }

      for (const fieldName of Object.keys(shape)) {
        expect(
          fieldName,
          `field "${fieldName}" in schema "${schemaLabel}" matches forbidden pattern`,
        ).not.toMatch(FORBIDDEN_KEY_RE);
      }
    },
  );
});
