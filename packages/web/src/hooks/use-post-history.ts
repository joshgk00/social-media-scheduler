import { useQuery } from '@tanstack/react-query';
import type { PostHistoryResponse } from '@sms/shared';
import { apiClient } from '../lib/api-client';

export function usePostHistory(postId: string | null) {
  return useQuery({
    queryKey: ['post-history', postId],
    queryFn: () => apiClient.getPostHistory<PostHistoryResponse>(postId!),
    enabled: !!postId,
    staleTime: 10_000,
  });
}
