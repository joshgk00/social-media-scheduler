import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { Platform } from './use-profiles';

export interface PendingAccountOption {
  platformAccountId: string | null;
  kind: 'personal' | 'organization' | 'page';
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  followerCount?: number | null;
  orgName?: string | null;
  pageName?: string | null;
}

export interface PendingSelection {
  platform: Platform;
  accounts: PendingAccountOption[];
}

export interface FinalizeOAuthInput {
  tempToken: string;
  platformAccountId: string | null;
}

// Thrown by `useFinalizeOAuthConnection` when the server returns HTTP 409
// with `error: 'mismatched_account'`. Callers catch this to open
// `ReconnectMismatchDialog` with the two handles.
export class MismatchedAccountError extends Error {
  readonly existingHandle: string;
  readonly incomingHandle: string;
  readonly tempToken: string;

  constructor(args: {
    existingHandle: string;
    incomingHandle: string;
    tempToken: string;
  }) {
    super('mismatched_account');
    this.name = 'MismatchedAccountError';
    this.existingHandle = args.existingHandle;
    this.incomingHandle = args.incomingHandle;
    this.tempToken = args.tempToken;
  }
}

export function usePendingSelection(tempToken: string | null) {
  return useQuery({
    queryKey: ['oauth-pending', tempToken],
    queryFn: () =>
      apiClient.get<PendingSelection>(`/api/oauth/pending/${tempToken}`),
    enabled: !!tempToken,
    staleTime: 0,
    retry: false,
  });
}

interface ApiError extends Error {
  status?: number;
  body?: Record<string, unknown>;
}

function isMismatchError(err: ApiError): boolean {
  if (err.status !== 409) return false;
  const body = err.body ?? {};
  return body.error === 'mismatched_account';
}

export function useFinalizeOAuthConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FinalizeOAuthInput) => {
      try {
        return await apiClient.post<{ profileId: string }>(
          '/api/oauth/finalize',
          input,
        );
      } catch (err) {
        const apiErr = err as ApiError;
        if (isMismatchError(apiErr)) {
          const body = apiErr.body ?? {};
          throw new MismatchedAccountError({
            existingHandle: (body.existingHandle as string) ?? '',
            incomingHandle: (body.incomingHandle as string) ?? '',
            tempToken:
              (body.tempToken as string) ?? input.tempToken,
          });
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export function useFinalizeAsNew() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FinalizeOAuthInput) =>
      apiClient.post<{ profileId: string }>(
        '/api/oauth/finalize-as-new',
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}
