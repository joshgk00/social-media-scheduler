import { z } from 'zod';

export const profileUpdateSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  username: z.string().min(3).max(100).optional(),
  email: z.string().email().optional(),
});

export const preferencesUpdateSchema = z.object({
  timezone: z.string().min(1),
  dateFormat: z.string().min(1),
  entriesPerPage: z.number().int().min(10).max(100),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PreferencesUpdateInput = z.infer<typeof preferencesUpdateSchema>;
