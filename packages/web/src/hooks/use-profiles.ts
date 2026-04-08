import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

interface Profile {
  id: string;
  platform: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  tokenStatus: string;
  createdAt: string;
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => apiClient.get<Profile[]>('/api/profiles'),
    staleTime: 30_000,
  });
}

export type { Profile };
