import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PLATFORM_MEDIA_LIMITS } from '@sms/shared';
import type { MediaItem } from '../components/posts/MediaThumbnail';
import { useDeleteMedia, useRetryTranscode } from './use-media';
import { useMediaUpload } from './use-media-upload';
import type { Platform } from './use-profiles';

export function usePostMedia(profileId: string, platform: Platform) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const { upload, uploadingFiles, isUploading } = useMediaUpload();
  const { mutate: deleteMedia } = useDeleteMedia();
  const { mutate: retryTranscode } = useRetryTranscode();

  const maxFilesForPlatform = useMemo(() => {
    const platformLimits = PLATFORM_MEDIA_LIMITS[platform];
    if (!platformLimits) return 4;
    const hasVideo = mediaItems.some((m) => m.mimeType.startsWith('video/'));
    return hasVideo ? platformLimits.maxVideos : platformLimits.maxImages;
  }, [mediaItems, platform]);

  const hasTranscodingMedia = mediaItems.some(
    (m) => m.transcodeStatus === 'pending' || m.transcodeStatus === 'processing',
  );
  const hasFailedMedia = mediaItems.some((m) => m.transcodeStatus === 'failed');
  const isMediaBlocking = hasTranscodingMedia || hasFailedMedia;

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!profileId || !platform) return;
      await Promise.all(
        files.map(async (file) => {
          try {
            const response = await upload(file, profileId, platform);
            const uploadedMediaItem: MediaItem = {
              id: response.id,
              fileName: response.fileName,
              mimeType: response.mimeType,
              thumbnailUrl: response.thumbnailUrl,
              transcodeStatus: response.transcodeStatus,
              transcodeError: null,
            };
            setMediaItems((prev) => [...prev, uploadedMediaItem]);
            toast.success('File uploaded.');
          } catch (uploadError) {
            const errorMessage = uploadError instanceof Error ? uploadError.message : 'Upload failed';
            toast.error(`Upload failed: ${errorMessage}`);
          }
        }),
      );
    },
    [platform, profileId, upload],
  );

  const handleRemoveMedia = useCallback(
    (mediaId: string) => {
      deleteMedia(mediaId, {
        onSuccess: () => {
          setMediaItems((prev) => prev.filter((m) => m.id !== mediaId));
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to remove media.');
        },
      });
    },
    [deleteMedia],
  );

  const handleReorderMedia = useCallback((newOrder: string[]) => {
    setMediaItems((prev) => {
      const itemMap = new Map(prev.map((m) => [m.id, m]));
      return newOrder.map((id) => itemMap.get(id)).filter((m): m is MediaItem => m !== undefined);
    });
  }, []);

  const handleRetryTranscode = useCallback(
    (mediaId: string) => {
      retryTranscode(mediaId, {
        onSuccess: () => {
          setMediaItems((prev) =>
            prev.map((m) =>
              m.id === mediaId
                ? { ...m, transcodeStatus: 'pending' as const, transcodeError: null }
                : m,
            ),
          );
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Retry failed.');
        },
      });
    },
    [retryTranscode],
  );

  const handleMediaStatusUpdate = useCallback(
    (
      mediaId: string,
      status: MediaItem['transcodeStatus'],
      error: string | null,
    ) => {
      setMediaItems((prev) =>
        prev.map((m) => {
          if (m.id !== mediaId) return m;
          if (m.transcodeStatus === status && m.transcodeError === error) {
            return m;
          }
          return { ...m, transcodeStatus: status, transcodeError: error };
        }),
      );
    },
    [],
  );

  return {
    mediaItems,
    setMediaItems,
    uploadingFiles,
    isUploading,
    maxFilesForPlatform,
    hasTranscodingMedia,
    hasFailedMedia,
    isMediaBlocking,
    handleFilesSelected,
    handleRemoveMedia,
    handleReorderMedia,
    handleRetryTranscode,
    handleMediaStatusUpdate,
  };
}
