import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RateLimitState, RateLimitUpdate } from '@sms/shared';
import { apiClient } from '../lib/api-client';

export function useRateLimit(profileId: string | null) {
  return useQuery({
    queryKey: ['rate-limit', profileId],
    queryFn: () => apiClient.getRateLimit<RateLimitState>(profileId!),
    enabled: !!profileId,
    staleTime: 30_000, // Budget rarely changes mid-session.
  });
}

export function useUpdateRateLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, body }: { profileId: string; body: RateLimitUpdate }) =>
      apiClient.updateRateLimit<RateLimitState>(profileId, body),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rate-limit', variables.profileId] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}
