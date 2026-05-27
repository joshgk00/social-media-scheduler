import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';

import { useToggleQueuePaused } from '../use-queues';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: vi.fn(),
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
  vi.mocked(apiClient.put).mockResolvedValue({ id: 'queue-1', isPaused: true });
});

describe('useToggleQueuePaused', () => {
  it('sends the pause patch and invalidates queue caches', async () => {
    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useToggleQueuePaused(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ id: 'queue-1', isPaused: true });
    });

    expect(apiClient.put).toHaveBeenCalledWith('/api/queues/queue-1', {
      isPaused: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['queues'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['queues', 'queue-1'],
    });
  });
});
