import { z } from 'zod';

export const transcodeStatusValues = ['pending', 'processing', 'completed', 'failed', 'not_applicable'] as const;
export type TranscodeStatus = typeof transcodeStatusValues[number];

export const mediaUploadResponseSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  thumbnailUrl: z.string().nullable(),
  transcodeStatus: z.enum(transcodeStatusValues),
});
export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;

export const mediaStatusResponseSchema = z.object({
  id: z.string().uuid(),
  transcodeStatus: z.enum(transcodeStatusValues),
  transcodeError: z.string().nullable(),
});
export type MediaStatusResponse = z.infer<typeof mediaStatusResponseSchema>;
