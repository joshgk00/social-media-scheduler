import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});

export const setupSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  confirmPassword: z.string(),
  timezone: z.string().min(1, 'Timezone required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: z.string().min(12, 'Password must be at least 12 characters'),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: 'Passwords do not match',
  path: ['confirmNewPassword'],
});

export const totpVerifySchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^[0-9]{6}$/, 'Code must be numeric'),
});

export const totpDisableSchema = z.object({
  password: z.string().min(1, 'Password required'),
  code: z.string().length(6, 'Code must be 6 digits').regex(/^[0-9]{6}$/, 'Code must be numeric'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SetupInput = z.infer<typeof setupSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type TotpVerifyInput = z.infer<typeof totpVerifySchema>;
export type TotpDisableInput = z.infer<typeof totpDisableSchema>;
