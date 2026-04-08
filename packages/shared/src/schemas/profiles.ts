import { z } from 'zod';

export const createProfileSchema = z.object({
  consumerKey: z.string().min(1, 'Consumer Key is required').max(255),
  consumerSecret: z.string().min(1, 'Consumer Secret is required').max(255),
  accessToken: z.string().min(1, 'Access Token is required').max(255),
  accessTokenSecret: z.string().min(1, 'Access Token Secret is required').max(255),
});

export const updateProfileSchema = z.object({
  displayName: z.string().max(255).optional(),
  notes: z.string().max(5000).optional(),
});

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
