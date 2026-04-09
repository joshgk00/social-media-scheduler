import { z } from 'zod';

export const SUPPORTED_PLATFORMS = ['twitter', 'linkedin', 'facebook'] as const;
export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export const createProfileSchema = z.object({
  platform: z.enum(SUPPORTED_PLATFORMS),
  consumerKey: z.string().min(1, 'Consumer Key is required').max(255),
  consumerSecret: z.string().min(1, 'Consumer Secret is required').max(255),
  accessToken: z.string().min(1, 'Access Token is required').max(255),
  accessTokenSecret: z.string().min(1, 'Access Token Secret is required').max(255),
});

export const updateProfileSchema = z.object({
  displayName: z.string().max(255).optional(),
});

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
