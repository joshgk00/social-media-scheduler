import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { NotificationEventType } from '@sms/shared';

export interface NotificationRow {
  id: string;
  eventType: NotificationEventType;
  severity: 'info' | 'warning' | 'error';
  title: string;
  body: string;
  linkPath: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  rows: NotificationRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface NotificationPrefRow {
  eventType: NotificationEventType;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  updatedAt?: string;
}

export interface NotificationPrefsResponse {
  rows: NotificationPrefRow[];
}

export interface EmailLogRow {
  id: string;
  eventType: NotificationEventType;
  recipientEmail: string;
  subject: string;
  status: 'sent' | 'failed';
  errorMessage: string | null;
  smtpMessageId?: string | null;
  sentAt: string;
}

export interface EmailLogListResponse {
  rows: EmailLogRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface NotificationsFilters {
  page?: number;
  pageSize?: number;
  eventType?: ReadonlyArray<NotificationEventType>;
  eventTypes?: ReadonlyArray<NotificationEventType>;
  readStatus?: 'all' | 'read' | 'unread';
}

export interface EmailLogsFilters {
  page?: number;
  pageSize?: number;
  eventType?: ReadonlyArray<NotificationEventType>;
  status?: 'sent' | 'failed';
  recipient?: string;
}

interface NotificationsSnapshot {
  queryKey: QueryKey;
  notificationList: NotificationListResponse | undefined;
}

function buildQuery(params: object): string {
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) queryParams.set(key, value.join(','));
      continue;
    }
    queryParams.set(key, String(value));
  }

  const queryString = queryParams.toString();
  return queryString ? `?${queryString}` : '';
}

function normalizeNotificationFilters(filters: NotificationsFilters): Record<string, unknown> {
  const { eventType, eventTypes, ...rest } = filters;
  return { ...rest, eventTypes: eventTypes ?? eventType };
}

function withReadAt(notificationList: NotificationListResponse, notificationId: string): NotificationListResponse {
  const readAt = new Date().toISOString();
  return {
    ...notificationList,
    rows: notificationList.rows.map((notificationRow) =>
      notificationRow.id === notificationId && notificationRow.readAt === null
        ? { ...notificationRow, readAt }
        : notificationRow,
    ),
  };
}

function allRead(notificationList: NotificationListResponse): NotificationListResponse {
  const readAt = new Date().toISOString();
  return {
    ...notificationList,
    rows: notificationList.rows.map((notificationRow) =>
      notificationRow.readAt === null ? { ...notificationRow, readAt } : notificationRow,
    ),
  };
}

export function useUnreadCount() {
  const query = useQuery({
    queryKey: ['notifications', 'unreadCount'] as const,
    queryFn: () => apiClient.get<{ count: number }>('/api/notifications/unread-count', { cache: 'no-store' }),
    staleTime: 25_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    notifyOnChangeProps: ['data'],
  });

  return Object.assign(query, {
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useNotifications(filters: NotificationsFilters = {}) {
  return useQuery({
    queryKey: ['notifications', filters] as QueryKey,
    queryFn: () =>
      apiClient.get<NotificationListResponse>(
        `/api/notifications${buildQuery(normalizeNotificationFilters(filters))}`,
        { cache: 'no-store' },
      ),
    staleTime: 15_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      apiClient.post<{ ok: boolean }>(`/api/notifications/${notificationId}/read`),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const snapshots: NotificationsSnapshot[] = queryClient
        .getQueriesData<NotificationListResponse>({ queryKey: ['notifications'] })
        .map(([queryKey, notificationList]) => ({ queryKey, notificationList }));

      for (const { queryKey, notificationList } of snapshots) {
        if (!notificationList?.rows) continue;
        queryClient.setQueryData(queryKey, withReadAt(notificationList, notificationId));
      }

      return { snapshots };
    },
    onError: (_error, _notificationId, context) => {
      for (const snapshot of context?.snapshots ?? []) {
        queryClient.setQueryData(snapshot.queryKey, snapshot.notificationList);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<{ ok: boolean; updated: number }>('/api/notifications/read-all'),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const snapshots: NotificationsSnapshot[] = queryClient
        .getQueriesData<NotificationListResponse>({ queryKey: ['notifications'] })
        .map(([queryKey, notificationList]) => ({ queryKey, notificationList }));

      for (const { queryKey, notificationList } of snapshots) {
        if (!notificationList?.rows) continue;
        queryClient.setQueryData(queryKey, allRead(notificationList));
      }

      queryClient.setQueryData(['notifications', 'unreadCount'], { count: 0 });
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const snapshot of context?.snapshots ?? []) {
        queryClient.setQueryData(snapshot.queryKey, snapshot.notificationList);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] });
    },
  });
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ['notification-prefs'] as const,
    queryFn: () => apiClient.get<NotificationPrefsResponse>('/api/users/me/notification-prefs'),
    staleTime: 60_000,
  });
}

export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (prefs: NotificationPrefRow[]) =>
      apiClient.patch<{ ok: boolean }>('/api/users/me/notification-prefs', { prefs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
}

export function useEmailLogs(filters: EmailLogsFilters = {}) {
  return useQuery({
    queryKey: ['email-logs', filters] as QueryKey,
    queryFn: () => apiClient.get<EmailLogListResponse>(`/api/email-logs${buildQuery(filters)}`),
    staleTime: 15_000,
  });
}

export function useSmtpStatus() {
  return useQuery({
    queryKey: ['system', 'smtp-status'] as const,
    queryFn: () => apiClient.get<{ configured: boolean }>('/api/system/smtp-status'),
    staleTime: 300_000,
  });
}
