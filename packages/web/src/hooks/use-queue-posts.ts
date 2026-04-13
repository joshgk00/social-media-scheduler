import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '../lib/api-client';

export interface QueuePost {
  id: string;
  text: string;
  status: string;
  hasSpinnableText: boolean;
  autoDestructAfter: string | null;
  queuePosition: number | null;
  platformPostId: string | null;
  publishedAt: string | null;
}

export function useQueuePosts(queueId: string) {
  return useQuery({
    queryKey: ['queue-posts', queueId],
    queryFn: () => apiClient.get<QueuePost[]>(`/api/queues/${queueId}/posts`),
    enabled: !!queueId,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

export function useMovePostUp(queueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      apiClient.post<{ success: boolean }>(
        `/api/queues/${queueId}/posts/${postId}/move-up`,
      ),
    onMutate: async (postId: string) => {
      await queryClient.cancelQueries({ queryKey: ['queue-posts', queueId] });
      const previousPosts = queryClient.getQueryData<QueuePost[]>([
        'queue-posts',
        queueId,
      ]);

      if (previousPosts) {
        const sorted = [...previousPosts].sort(
          (a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0),
        );
        const targetIndex = sorted.findIndex((p) => p.id === postId);
        if (targetIndex > 0) {
          const targetPosition = sorted[targetIndex].queuePosition;
          const previousPosition = sorted[targetIndex - 1].queuePosition;
          sorted[targetIndex] = { ...sorted[targetIndex], queuePosition: previousPosition };
          sorted[targetIndex - 1] = { ...sorted[targetIndex - 1], queuePosition: targetPosition };
          sorted.sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
          queryClient.setQueryData(['queue-posts', queueId], sorted);
        }
      }

      return { previousPosts };
    },
    onError: (_error, _postId, context) => {
      if (context?.previousPosts) {
        queryClient.setQueryData(
          ['queue-posts', queueId],
          context.previousPosts,
        );
      }
      toast.error("Couldn't reorder post. Try again.");
    },
    onSuccess: () => {
      toast.success('Post moved.');
      queryClient.invalidateQueries({ queryKey: ['queue-posts', queueId] });
    },
  });
}

export function useMovePostDown(queueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      apiClient.post<{ success: boolean }>(
        `/api/queues/${queueId}/posts/${postId}/move-down`,
      ),
    onMutate: async (postId: string) => {
      await queryClient.cancelQueries({ queryKey: ['queue-posts', queueId] });
      const previousPosts = queryClient.getQueryData<QueuePost[]>([
        'queue-posts',
        queueId,
      ]);

      if (previousPosts) {
        const sorted = [...previousPosts].sort(
          (a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0),
        );
        const targetIndex = sorted.findIndex((p) => p.id === postId);
        if (targetIndex >= 0 && targetIndex < sorted.length - 1) {
          const targetPosition = sorted[targetIndex].queuePosition;
          const nextPosition = sorted[targetIndex + 1].queuePosition;
          sorted[targetIndex] = { ...sorted[targetIndex], queuePosition: nextPosition };
          sorted[targetIndex + 1] = { ...sorted[targetIndex + 1], queuePosition: targetPosition };
          sorted.sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
          queryClient.setQueryData(['queue-posts', queueId], sorted);
        }
      }

      return { previousPosts };
    },
    onError: (_error, _postId, context) => {
      if (context?.previousPosts) {
        queryClient.setQueryData(
          ['queue-posts', queueId],
          context.previousPosts,
        );
      }
      toast.error("Couldn't reorder post. Try again.");
    },
    onSuccess: () => {
      toast.success('Post moved.');
      queryClient.invalidateQueries({ queryKey: ['queue-posts', queueId] });
    },
  });
}

export function useRemoveFromQueue(queueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      apiClient.delete<{ success: boolean }>(
        `/api/queues/${queueId}/posts/${postId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-posts', queueId] });
    },
  });
}

export function useAddToQueue(queueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      apiClient.post<{ success: boolean }>(`/api/queues/${queueId}/posts`, {
        postId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-posts', queueId] });
    },
  });
}
