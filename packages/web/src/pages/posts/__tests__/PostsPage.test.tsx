import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PostsPage from '../PostsPage';

const setSearchParams = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), setSearchParams],
  };
});

vi.mock('../../../hooks/use-posts', () => ({
  usePosts: () => ({
    data: { posts: [], total: 0, limit: 25, page: 1 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    dataUpdatedAt: 0,
  }),
  useDeletePost: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../../hooks/use-tags', () => ({
  useTags: () => ({ data: [] }),
}));

vi.mock('../../../hooks/use-profiles', () => ({
  useProfiles: () => ({ data: [] }),
}));

vi.mock('../../../hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 't@e.x', entriesPerPage: 25 } }),
}));

vi.mock('../../../hooks/use-bulk-ops', () => ({
  useBulkDelete: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkExport: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkModifyTags: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkPause: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkResume: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../../components/posts/PostHistoryDialog', () => ({
  PostHistoryDialog: () => null,
}));

vi.mock('../../../components/posts/PostFullTextDialog', () => ({
  PostFullTextDialog: () => null,
}));

vi.mock('../../../components/posts/PostActionsMenu', () => ({
  PostActionsMenu: () => null,
}));

vi.mock('../../../components/bulk/BulkActionsDropdown', () => ({
  BulkActionsDropdown: () => <div>Bulk actions</div>,
}));

vi.mock('../../../components/bulk/BulkDeleteDialog', () => ({
  BulkDeleteDialog: () => null,
}));

vi.mock('../../../components/bulk/BulkPauseResumeDialog', () => ({
  BulkPauseResumeDialog: () => null,
}));

vi.mock('../../../components/bulk/ModifyTagsDialog', () => ({
  ModifyTagsDialog: () => null,
}));

vi.mock('../../../components/bulk/SelectionSummaryBar', () => ({
  SelectionSummaryBar: () => null,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PostsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PostsPage URL-state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it('renders the posts search input', () => {
    renderPage();
    expect(screen.getByLabelText('Search posts')).toBeInTheDocument();
  });

  it('updates the URL with the debounced search term', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Search posts'), {
      target: { value: 'announcement' },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(setSearchParams).toHaveBeenLastCalledWith(
      { search: 'announcement' },
      { replace: true },
    );
  });

  it('removes the search param when the input is cleared', () => {
    renderPage();
    const input = screen.getByLabelText('Search posts');

    fireEvent.change(input, { target: { value: 'announcement' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.change(input, { target: { value: '' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(setSearchParams).toHaveBeenLastCalledWith({}, { replace: true });
  });
});
