import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

interface User {
  id: string;
  email: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImagePath: string | null;
  timezone: string;
  dateFormat: string;
  entriesPerPage: number;
  defaultLandingPage: string;
  totpEnabled: boolean;
  lastLoginAt: string | null;
}

interface SetupStatus {
  needsSetup: boolean;
}

interface LoginResponse {
  requiresTwoFactor: boolean;
  defaultLandingPage?: string;
}

interface Verify2FAResponse {
  success: boolean;
  defaultLandingPage?: string;
}

export function useAuth() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<User>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ['auth', 'setup-status'],
    queryFn: () => apiClient.get<SetupStatus>('/api/auth/setup-status'),
    staleTime: Infinity,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      apiClient.post<LoginResponse>('/api/auth/login', credentials),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth'] }); },
  });
}

export function useVerify2FA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { code: string }) =>
      apiClient.post<Verify2FAResponse>('/api/auth/login/verify-2fa', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth'] }); },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/api/auth/logout'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth'] }); },
  });
}

export function useSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; password: string; confirmPassword: string; timezone: string }) =>
      apiClient.post('/api/auth/setup', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth', 'setup-status'] }); },
  });
}

export type { User, SetupStatus };
