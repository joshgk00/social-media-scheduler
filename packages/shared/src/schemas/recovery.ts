import { z } from 'zod';

export const recoveryVerifyEmailSchema = z.object({
  email: z.string().email('Valid email required'),
});

export const recoveryVerifyAnswersSchema = z.object({
  email: z.string().email(),
  answers: z.array(z.string().min(1, 'Answer required')).length(3, 'All 3 answers required'),
});

export const recoveryResetPasswordSchema = z.object({
  newPassword: z.string().min(12, 'Password must be at least 12 characters'),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: 'Passwords do not match',
  path: ['confirmNewPassword'],
});

export const securityQuestionsSchema = z.object({
  questions: z.array(z.object({
    questionIndex: z.number().int().min(0).max(9),
    answer: z.string().min(1, 'Answer required'),
  })).length(3, 'Exactly 3 questions required'),
}).refine((data) => {
  const indices = data.questions.map(q => q.questionIndex);
  return new Set(indices).size === 3;
}, { message: 'All 3 questions must be different' });

export type RecoveryVerifyEmailInput = z.infer<typeof recoveryVerifyEmailSchema>;
export type RecoveryVerifyAnswersInput = z.infer<typeof recoveryVerifyAnswersSchema>;
export type RecoveryResetPasswordInput = z.infer<typeof recoveryResetPasswordSchema>;
export type SecurityQuestionsInput = z.infer<typeof securityQuestionsSchema>;
