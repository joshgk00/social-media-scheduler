import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import QueuePostsPage from '../QueuePostsPage';

const setSearchParams = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useParams: () => ({ id: 'queue-1' }),
    useSearchParams: () => [new URLSearchParams(), setSearchParams],
  };
});

vi.mock('../../../hooks/use-queues', () => ({
  useQueue: () => ({
    data: {
      id: 'queue-1',
      name: 'Morning queue',
      cursorPosition: 0,
      isRecycling: false,
      isPaused: false,
      profileId: 'profile-1',
      nextRunAt: null,
      seasonalStart: null,
      seasonalEnd: null,
    },
    isLoading: false,
  }),
  useQueues: () => ({ data: [] }),
}));

vi.mock('../../../hooks/use-queue-posts', () => ({
  useQueuePosts: () => ({ data: [], isLoading: false, isError: false }),
  useMovePostUp: () => ({ mutate: vi.fn() }),
  useMovePostDown: () => ({ mutate: vi.fn() }),
  useRemoveFromQueue: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../../hooks/use-bulk-ops', () => ({
  useBulkExport: () => ({ mutate: vi.fn() }),
  useQueueCopy: () => ({ mutate: vi.fn(), isPending: false }),
  useQueueDedupe: () => ({ mutate: vi.fn(), isPending: false }),
  useQueueModifyText: () => ({ mutate: vi.fn(), isPending: false }),
  useQueuePurge: () => ({ mutate: vi.fn(), isPending: false }),
  useQueueRandomize: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../../components/bulk/BulkActionsDropdown', () => ({
  BulkActionsDropdown: () => <div>Bulk actions</div>,
}));

vi.mock('../../../components/posts/PostHistoryDialog', () => ({
  PostHistoryDialog: () => null,
}));

vi.mock('../../../components/posts/PostFullTextDialog', () => ({
  PostFullTextDialog: () => null,
}));

vi.mock('../../../components/queues/QueuePostActionsMenu', () => ({
  QueuePostActionsMenu: () => null,
}));

vi.mock('../../../components/queues/QueueStatusBadge', () => ({
  QueueStatusBadge: () => <div>Status badge</div>,
}));

vi.mock('../../../components/queues/SpinnableVariantsDialog', () => ({
  SpinnableVariantsDialog: () => null,
}));

vi.mock('../../../components/bulk/CopyQueueDialog', () => ({
  CopyQueueDialog: () => null,
}));

vi.mock('../../../components/bulk/ModifyTextDialog', () => ({
  ModifyTextDialog: () => null,
}));

vi.mock('../../../components/bulk/PurgeQueueDialog', () => ({
  PurgeQueueDialog: () => null,
}));

vi.mock('../../../components/bulk/RandomizeQueueDialog', () => ({
  RandomizeQueueDialog: () => null,
}));

vi.mock('../../../components/bulk/RemoveDuplicatesDialog', () => ({
  RemoveDuplicatesDialog: () => null,
}));

describe('QueuePostsPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it('renders the queue search input', () => {
    render(<MemoryRouter><QueuePostsPage /></MemoryRouter>);

    expect(screen.getByLabelText('Search posts')).toBeInTheDocument();
  });

  it('updates the URL with the debounced search term', async () => {
    render(<MemoryRouter><QueuePostsPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Search posts'), {
      target: { value: 'announcement' },
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(setSearchParams).toHaveBeenLastCalledWith(
      { search: 'announcement' },
      { replace: true },
    );
  });

  it('removes the search param when the input is cleared', async () => {
    render(<MemoryRouter><QueuePostsPage /></MemoryRouter>);
    const input = screen.getByLabelText('Search posts');

    fireEvent.change(input, { target: { value: 'announcement' } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.change(input, { target: { value: '' } });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(setSearchParams).toHaveBeenLastCalledWith({}, { replace: true });
  });
});
