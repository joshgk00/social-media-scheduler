import { z } from 'zod';

// Response contract for the post-history modal (SCHED-04).
// GET /api/posts/:id/history returns a `cycles` array where each inner array
// is one retry cycle grouped by attempt_num reset (D-17). The UI renders
// each cycle as a collapsible section.

export const postAttemptOutcomeSchema = z.enum([
  'success',
  'transient_fail',
  'permanent_fail',
  'cancelled',
]);

export const postAttemptSchema = z.object({
  id: z.string().uuid(),
  postId: z.string().uuid(),
  attemptNum: z.number().int().positive(),
  startedAt: z.string(), // ISO-8601
  finishedAt: z.string().nullable(),
  outcome: postAttemptOutcomeSchema,
  httpStatus: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  platformPostId: z.string().nullable(),
});

export const postHistoryResponseSchema = z.object({
  postId: z.string().uuid(),
  cycles: z.array(z.array(postAttemptSchema)),
});

export type PostAttemptDto = z.infer<typeof postAttemptSchema>;
export type PostHistoryResponse = z.infer<typeof postHistoryResponseSchema>;
export type PostAttemptOutcome = z.infer<typeof postAttemptOutcomeSchema>;
