export interface PlatformMediaLimits {
  maxImages: number;
  maxImageSizeMb: number;
  maxVideos: number;
  maxVideoSizeMb: number;
  allowedImageTypes: readonly string[];
  allowedVideoTypes: readonly string[];
  maxImageWidth?: number;
  maxImageHeight?: number;
}

export const PLATFORM_MEDIA_LIMITS: Record<string, PlatformMediaLimits> = {
  twitter: {
    maxImages: 4,
    maxImageSizeMb: 5,
    maxVideos: 1,
    maxVideoSizeMb: 15,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedVideoTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'],
    maxImageWidth: 4096,
    maxImageHeight: 4096,
  },
  linkedin: {
    maxImages: 1,
    maxImageSizeMb: 20,
    maxVideos: 1,
    maxVideoSizeMb: 200,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif'],
    allowedVideoTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'],
  },
  facebook: {
    maxImages: 10,
    maxImageSizeMb: 5,
    maxVideos: 1,
    maxVideoSizeMb: 100,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff'],
    allowedVideoTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'],
  },
} as const;
