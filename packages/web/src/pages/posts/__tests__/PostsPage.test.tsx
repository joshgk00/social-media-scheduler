import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PostsPage from '../PostsPage';

const setSearchParams = vi.fn();
const mocks = vi.hoisted(() => ({
  posts: [] as Array<{
    id: string;
    profileId: string | null;
    text: string;
    isThread: boolean;
    status: string;
    scheduledAt: string | null;
    publishedAt: string | null;
    platformPostId: string | null;
    postVersion: number;
    hasSpinnableText: boolean;
    autoDestructAfter: string | null;
    notes: string | null;
    failureReason: string | null;
    createdAt: string;
    updatedAt: string;
    tags: Array<{ id: string; name: string; color: string }>;
    headline?: string;
  }>,
  counts: {
    total: 0,
    byStatus: {} as Record<string, number>,
  },
  bulkModifyTagsMutate: vi.fn(),
  deletePostMutate: vi.fn(),
}));

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
    data: { posts: mocks.posts, total: mocks.posts.length, limit: 25, page: 1 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    dataUpdatedAt: 0,
  }),
  usePostStatusCounts: () => ({
    data: mocks.counts,
  }),
  useDeletePost: () => ({ mutate: mocks.deletePostMutate, isPending: false }),
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
  useBulkModifyTags: () => ({ mutate: mocks.bulkModifyTagsMutate, isPending: false }),
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
  ModifyTagsDialog: ({ open, selectionCount }: { open: boolean; selectionCount: number }) =>
    open ? <div>Modify tags dialog for {selectionCount} posts</div> : null,
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
    mocks.posts = [];
    mocks.counts = { total: 0, byStatus: {} };
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

  it('shows every lifecycle status filter from the shared status model', () => {
    mocks.counts = {
      total: 9,
      byStatus: {
        draft: 1,
        scheduled: 1,
        queued: 1,
        paused: 1,
        publishing: 1,
        published: 1,
        failed: 1,
        auto_destructing: 1,
        destroyed: 1,
      },
    };

    renderPage();

    expect(screen.getByText('Paused (1)')).toBeInTheDocument();
    expect(screen.getByText('Publishing (1)')).toBeInTheDocument();
    expect(screen.getByText('Published (1)')).toBeInTheDocument();
    expect(screen.getByText('Auto-destructing (1)')).toBeInTheDocument();
    expect(screen.getByText('Destroyed (1)')).toBeInTheDocument();
  });

  it('restores the bulk tag editing dialog from the bulk actions menu', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    mocks.posts = [
      {
        id: 'post-1',
        profileId: null,
        text: 'Queued launch copy',
        isThread: false,
        status: 'draft',
        scheduledAt: null,
        publishedAt: null,
        platformPostId: null,
        postVersion: 1,
        hasSpinnableText: false,
        autoDestructAfter: null,
        notes: null,
        failureReason: null,
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:00.000Z',
        tags: [],
      },
    ];

    renderPage();

    await user.click(screen.getByLabelText('Select post post-1'));
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    await user.click(await screen.findByText('Modify tags...'));

    expect(screen.getByText('Modify tags dialog for 1 posts')).toBeInTheDocument();
  });

  it('does not offer deletion as an active action for non-deletable statuses', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    mocks.posts = [
      {
        id: 'post-1',
        profileId: null,
        text: 'Queued launch copy',
        isThread: false,
        status: 'queued',
        scheduledAt: null,
        publishedAt: null,
        platformPostId: null,
        postVersion: 1,
        hasSpinnableText: false,
        autoDestructAfter: null,
        notes: null,
        failureReason: null,
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:00.000Z',
        tags: [],
      },
    ];

    renderPage();

    await user.click(screen.getByLabelText('Post actions'));
    const deleteUnavailable = await screen.findByText('Delete unavailable');
    await user.click(deleteUnavailable);

    expect(screen.queryByText('Delete post?')).not.toBeInTheDocument();
    expect(mocks.deletePostMutate).not.toHaveBeenCalled();
  });
});
