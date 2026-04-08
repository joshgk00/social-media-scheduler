import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { CreateProfileInput } from '@sms/shared';

interface SocialProfile {
  id: string;
  platform: string;
  platformUserId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  connectedAt: string;
  lastPublishedAt: string | null;
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => apiClient.get<SocialProfile[]>('/api/profiles'),
    staleTime: 30_000,
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProfileInput) =>
      apiClient.post<SocialProfile>('/api/profiles', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) =>
      apiClient.delete<{ success: boolean }>(`/api/profiles/${profileId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export type { SocialProfile };
