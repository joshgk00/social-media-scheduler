import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { CreateProfileInput, UpdateProfileMetadata, TokenStatus } from '@sms/shared';

export type Platform = 'twitter' | 'linkedin' | 'facebook';

export interface DeletePreview {
  drafts: number;
  scheduled: number;
  ownedQueues: number;
  tagsLosingLastUse: number;
  inFlight: number;
}

export interface SocialProfile {
  id: string;
  platform: Platform;
  platformUserId: string;
  platformAccountId: string | null;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  connectedAt: string;
  lastPublishedAt: string | null;
  tokenStatus: TokenStatus;
  tokenExpiresAt: string | null;
  tokenHealthCheckedAt: string | null;
  notes: string | null;
  nextScheduledAt: string | null;
  monthlyTweetBudget: number;
  warnThresholdPercent: number;
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

export function useUpdateProfileMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      profileId,
      body,
    }: {
      profileId: string;
      body: UpdateProfileMetadata;
    }) => apiClient.patch<SocialProfile>(`/api/profiles/${profileId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export function useDeletePreview(profileId: string | null) {
  return useQuery({
    queryKey: ['profile-delete-preview', profileId],
    queryFn: () =>
      apiClient.get<DeletePreview>(`/api/profiles/${profileId}/delete-preview`),
    enabled: !!profileId,
    staleTime: 0,
  });
}

// Navigate to the OAuth start URL with a `reconnect` query so the server can
// verify the returning account matches the existing profile row (D-25).
export function useReconnectProfile() {
  return (profileId: string, platform: Platform) => {
    window.location.assign(
      `/api/oauth/start/${platform}?reconnect=${profileId}&returnTo=/profiles`,
    );
  };
}
