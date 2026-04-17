import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRemoveFromQueue } from '../../hooks/use-queue-posts';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    delete: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useRemoveFromQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WR-05: calls toast.error when remove mutation fails', async () => {
    const { apiClient } = await import('../../lib/api-client');
    vi.mocked(apiClient.delete).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useRemoveFromQueue('queue-123'), {
      wrapper: createWrapper(),
    });

    result.current.mutate('post-456');

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't remove post from queue. Try again.",
      );
    });
  });

  it('WR-05: does not call toast.error on success', async () => {
    const { apiClient } = await import('../../lib/api-client');
    vi.mocked(apiClient.delete).mockResolvedValue({ success: true });

    const { result } = renderHook(() => useRemoveFromQueue('queue-123'), {
      wrapper: createWrapper(),
    });

    result.current.mutate('post-456');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.error).not.toHaveBeenCalled();
  });
});
