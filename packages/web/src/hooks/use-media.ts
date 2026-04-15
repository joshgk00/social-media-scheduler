import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { MediaStatusResponse } from '@sms/shared';

export function useMediaStatus(mediaId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['media-status', mediaId],
    queryFn: () =>
      apiClient.get<MediaStatusResponse>(`/api/media/${mediaId}/status`),
    refetchInterval: 3000,
    enabled,
    refetchIntervalInBackground: false,
  });
}

export function useDeleteMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string) =>
      apiClient.delete(`/api/media/${mediaId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-status'] });
    },
  });
}

export function useRetryTranscode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string) =>
      apiClient.post(`/api/media/${mediaId}/retry`),
    onSuccess: (_data, mediaId) => {
      queryClient.invalidateQueries({ queryKey: ['media-status', mediaId] });
    },
  });
}

interface StorageUsageResponse {
  totalSize: number;
  imageSize: number;
  imageCount: number;
  videoSize: number;
  videoCount: number;
}

export function useStorageUsage() {
  return useQuery({
    queryKey: ['storage-usage'],
    queryFn: () =>
      apiClient.get<StorageUsageResponse>('/api/settings/storage'),
  });
}
