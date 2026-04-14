import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { CreateQueueInput, UpdateQueueInput } from '@sms/shared';

interface QueueProfile {
  displayName: string;
  handle: string;
  platform: string;
}

export interface QueueListItem {
  id: string;
  name: string;
  profileId: string;
  intervalType: string;
  intervalValue: number;
  intervalUnit: string;
  daysOfWeek: number[];
  hourSlots: number[];
  startDate: string | null;
  seasonalStart: string | null;
  seasonalEnd: string | null;
  seasonalRepeat: boolean;
  isRecycling: boolean;
  isPaused: boolean;
  notes: string | null;
  postCount: number;
  lastPublishedAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  profile?: QueueProfile;
}

interface QueueDetail extends QueueListItem {
  cursorPosition: number;
}

interface QueueConfig {
  intervalType: string;
  intervalValue: number;
  intervalUnit: string;
  daysOfWeek: number[];
  hourSlots: number[];
  startDate: string | null;
  seasonalStart: string | null;
  seasonalEnd: string | null;
  seasonalRepeat: boolean;
  isRecycling: boolean;
}

export interface QueueFilters {
  network?: string;
  status?: string;
}

export function useQueues(filters: QueueFilters = {}) {
  const params = new URLSearchParams();
  if (filters.network && filters.network !== 'all') params.set('network', filters.network);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  const queryString = params.toString();

  return useQuery({
    queryKey: ['queues', filters],
    queryFn: () => apiClient.get<QueueListItem[]>(`/api/queues${queryString ? `?${queryString}` : ''}`),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useQueue(id: string) {
  return useQuery({
    queryKey: ['queues', id],
    queryFn: () => apiClient.get<QueueDetail>(`/api/queues/${id}`),
    staleTime: 15_000,
    enabled: !!id,
  });
}

export function useCreateQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQueueInput) =>
      apiClient.post<QueueDetail>('/api/queues', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
  });
}

export function useUpdateQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateQueueInput }) =>
      apiClient.put<QueueDetail>(`/api/queues/${id}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['queues', variables.id] });
    },
  });
}

export function useDeleteQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<{ success: boolean }>(`/api/queues/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
  });
}

export function useCopyQueueConfig(id: string) {
  return useQuery({
    queryKey: ['queues', id, 'config'],
    queryFn: () => apiClient.get<QueueConfig>(`/api/queues/${id}/config`),
    enabled: false,
  });
}

export type { QueueDetail, QueueConfig };
