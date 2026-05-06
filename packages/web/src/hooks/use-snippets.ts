import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSnippetInput, UpdateSnippetInput, SnippetCategory } from '@sms/shared';
import { apiClient } from '../lib/api-client';

export interface Snippet {
  id: string;
  userId: string;
  name: string;
  category: SnippetCategory;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export function useSnippets() {
  return useQuery({
    queryKey: ['snippets'],
    queryFn: () => apiClient.get<Snippet[]>('/api/snippets'),
    staleTime: 60_000,
  });
}

export function useCreateSnippet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (snippetInput: CreateSnippetInput) =>
      apiClient.post<Snippet>('/api/snippets', snippetInput),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snippets'] });
    },
  });
}

export function useUpdateSnippet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSnippetInput }) =>
      apiClient.patch<Snippet>(`/api/snippets/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snippets'] });
    },
  });
}

export function useDeleteSnippet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/snippets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snippets'] });
    },
  });
}
