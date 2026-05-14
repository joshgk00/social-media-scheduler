import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FinalizeOAuthInput } from '@sms/shared';
import { apiClient } from '../lib/api-client';
import type { Platform } from './use-profiles';

// Mirrors the response shape of GET /api/oauth/pending/:tempToken. WR-08:
// the previous interface declared `handle` and `avatarUrl`, which the API
// never sends — they've been dropped so the type reflects the actual wire
// contract and the picker's describeAccount() branches on fields that are
// guaranteed to arrive. CR-08: platformAccountId is now non-null because the
// server always populates it (userInfo.sub / org.orgUrn / page.id) — leaving
// it nullable hid the FinalizeOAuthInput drift Copilot flagged.
export interface PendingAccountOption {
  platformAccountId: string;
  displayName: string;
  subLabel?: string;
  kind?: 'personal' | 'organization' | 'page';
  orgName?: string;
  pageName?: string;
  followerCount?: number;
}

export interface PendingSelection {
  platform: Platform;
  accounts: PendingAccountOption[];
}

// Re-export the validated server contract so call sites match the shape the
// API enforces (z.string().min(1)) — the previous local declaration allowed
// `string | null`, which would 400 if null ever made it to the wire.
export type { FinalizeOAuthInput };

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
