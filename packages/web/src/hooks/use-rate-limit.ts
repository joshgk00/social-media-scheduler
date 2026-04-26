import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RateLimitState, RateLimitUpdate } from '@sms/shared';
import { apiClient } from '../lib/api-client';

// Plan 05b: `apiClient.getRateLimit` now routes to the platform-aware
// `/api/rate-limit/:profileId` endpoint shipped in Plan 03. The new endpoint
// returns the discriminated `RateLimitState` (with `platform` tag), which is
// what every Phase 8 component narrows on. Existing tests that
// `vi.spyOn(apiClient, 'getRateLimit')` continue to work — the spy surface
// is unchanged.
export function useRateLimit(profileId: string | null) {
  return useQuery({
    queryKey: ['rate-limit', profileId],
    queryFn: () => apiClient.getRateLimit<RateLimitState>(profileId!),
    enabled: !!profileId,
    staleTime: 30_000, // Budget rarely changes mid-session.
  });
}

// Collection hook backing Plan 05b's `<RateLimitsCard />` dashboard widget
// (LIMIT-08). The route returns `{ profiles: RateLimitState[] }` per the
// Plan 03 contract; we unwrap the envelope via `select` so consumers see a
// flat `RateLimitState[]` array — this matches the Plan 01 RED test contract
// (the test mock returns an array directly).
export function useAllProfilesRateLimits() {
  return useQuery({
    queryKey: ['rate-limit', 'all'],
    queryFn: () =>
      apiClient.get<{ profiles: RateLimitState[] }>('/api/rate-limit'),
    select: (response) => response.profiles,
    staleTime: 30_000,
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
