import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';

import {
  useEmailLogs,
  useMarkAllRead,
  useMarkRead,
  useNotificationPrefs,
  useNotifications,
  useUnreadCount,
  useUpdateNotificationPrefs,
} from '../use-notifications';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }

  return { queryClient, Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ rows: [], page: 1, pageSize: 25, total: 0 });
  vi.mocked(apiClient.post).mockResolvedValue({ ok: true });
  vi.mocked(apiClient.patch).mockResolvedValue({ ok: true });
});

describe('use-notifications hooks', () => {
  it('fetches unread count through the unread-count endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ count: 0 });
    const { Wrapper } = createWrapper();

    renderHook(() => useUnreadCount(), { wrapper: Wrapper });

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/api/notifications/unread-count', { cache: 'no-store' }),
    );
  });

  it('builds list and email-log query strings from filters', async () => {
    const { Wrapper } = createWrapper();

    renderHook(() => useNotifications({ eventType: ['publish_failed'], readStatus: 'unread', page: 1 }), {
      wrapper: Wrapper,
    });
    renderHook(() => useEmailLogs({ eventType: ['publish_failed'], status: 'failed', recipient: 'example.com' }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/notifications?readStatus=unread&page=1&eventTypes=publish_failed',
        { cache: 'no-store' },
      );
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/email-logs?eventType=publish_failed&status=failed&recipient=example.com',
      );
    });
  });

  it('invalidates notification queries after mark-read and mark-all-read mutations', async () => {
    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const markReadHook = renderHook(() => useMarkRead(), { wrapper: Wrapper });
    const markAllReadHook = renderHook(() => useMarkAllRead(), { wrapper: Wrapper });

    await act(async () => {
      await markReadHook.result.current.mutateAsync('notification-1');
      await markAllReadHook.result.current.mutateAsync();
    });

    expect(apiClient.post).toHaveBeenCalledWith('/api/notifications/notification-1/read');
    expect(apiClient.post).toHaveBeenCalledWith('/api/notifications/read-all');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications', 'unreadCount'] });
  });

  it('invalidates notification prefs after preferences update', async () => {
    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const prefsHook = renderHook(() => useNotificationPrefs(), { wrapper: Wrapper });
    const updatePrefsHook = renderHook(() => useUpdateNotificationPrefs(), { wrapper: Wrapper });

    await waitFor(() => expect(prefsHook.result.current.isSuccess).toBe(true));
    await act(async () => {
      await updatePrefsHook.result.current.mutateAsync([
        { eventType: 'publish_failed', inAppEnabled: true, emailEnabled: false },
      ]);
    });

    expect(apiClient.patch).toHaveBeenCalledWith('/api/users/me/notification-prefs', {
      prefs: [{ eventType: 'publish_failed', inAppEnabled: true, emailEnabled: false }],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notification-prefs'] });
  });
});
