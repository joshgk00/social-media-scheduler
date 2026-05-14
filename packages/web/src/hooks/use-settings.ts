import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { firstName?: string; lastName?: string; username?: string; email?: string }) =>
      apiClient.put('/api/settings/profile', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth', 'me'] }); },
  });
}

export function useUploadProfileImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      return apiClient.postFormData<{ profileImagePath: string }>('/api/settings/profile/image', formData);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth', 'me'] }); },
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { timezone: string; dateFormat: string; entriesPerPage: number }) =>
      apiClient.put('/api/settings/preferences', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth', 'me'] }); },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string; confirmNewPassword: string }) =>
      apiClient.put('/api/settings/password', data),
  });
}

export function useSetup2FA() {
  return useMutation({
    mutationFn: () => apiClient.post<{ secret: string; uri: string }>('/api/settings/2fa/setup'),
  });
}

export function useVerifySettings2FA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { code: string }) => apiClient.post('/api/settings/2fa/verify', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth', 'me'] }); },
  });
}

export function useDisable2FA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { password: string; code: string }) => apiClient.post('/api/settings/2fa/disable', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth', 'me'] }); },
  });
}

export function useSecurityQuestionsStatus() {
  return useQuery({
    queryKey: ['settings', 'security-questions'],
    queryFn: () => apiClient.get<{ configured: boolean; questionIndices: number[] }>('/api/settings/security-questions'),
    staleTime: 30_000,
  });
}

export function useUpdateSecurityQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { questions: Array<{ questionIndex: number; answer: string }> }) =>
      apiClient.put('/api/settings/security-questions', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings', 'security-questions'] }); },
  });
}

export function useSessionCount() {
  return useQuery({
    queryKey: ['settings', 'sessions'],
    queryFn: () => apiClient.get<{ count: number }>('/api/settings/sessions'),
    staleTime: 30_000,
  });
}

export function useLogoutOthers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ success: boolean; deleted: number }>('/api/settings/sessions/logout-others'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings', 'sessions'] }); },
  });
}
