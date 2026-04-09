import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => apiClient.get<Tag[]>('/api/tags'),
    staleTime: 30_000,
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagInput: { name: string; color?: string }) =>
      apiClient.post<Tag>('/api/tags', tagInput),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, tagInput }: { tagId: string; tagInput: { name?: string; color?: string } }) =>
      apiClient.patch<Tag>(`/api/tags/${tagId}`, tagInput),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) =>
      apiClient.delete<{ success: boolean }>(`/api/tags/${tagId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export type { Tag };
