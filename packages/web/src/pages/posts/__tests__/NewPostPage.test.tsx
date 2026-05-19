import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NewPostPage from '../NewPostPage';

const navigate = vi.fn();
const createPostMutate = vi.fn();

vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => navigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock('../../../hooks/use-auth', () => ({
  useAuth: () => ({ data: { timezone: 'America/Detroit' } }),
}));

vi.mock('../../../hooks/use-profiles', () => ({
  useProfiles: () => ({
    data: [
      {
        id: '99999999-9999-4999-8999-999999999998',
        platform: 'twitter',
        displayName: 'Codex Repro Twitter',
        handle: 'codexrepro',
        avatarUrl: '',
      },
    ],
  }),
}));

vi.mock('../../../hooks/use-posts', () => ({
  useCreatePost: () => ({
    mutate: createPostMutate,
    isPending: false,
  }),
  useCheckConflicts: () => ({ data: [] }),
}));

vi.mock('../../../hooks/use-queues', () => ({
  useQueue: () => ({ data: null }),
}));

vi.mock('../../../hooks/use-queue-posts', () => ({
  useAddToQueue: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../../hooks/use-media-upload', () => ({
  useMediaUpload: () => ({
    upload: vi.fn(),
    uploadingFiles: new Map(),
    isUploading: false,
  }),
}));

vi.mock('../../../hooks/use-media', () => ({
  useDeleteMedia: () => ({ mutate: vi.fn() }),
  useRetryTranscode: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../../hooks/use-tags', () => ({
  useTags: () => ({ data: [] }),
}));

vi.mock('../../../components/posts/ProfilePicker', () => ({
  ProfilePicker: ({
    onValueChange,
  }: {
    onValueChange: (profileId: string, platform: 'twitter') => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onValueChange('99999999-9999-4999-8999-999999999998', 'twitter')
      }
    >
      Use Twitter profile
    </button>
  ),
}));

vi.mock('../../../components/posts/TwitterPostFields', () => ({
  TwitterPostFields: ({
    text,
    onTextChange,
  }: {
    text: string;
    onTextChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Tweet text"
      value={text}
      onChange={(event) => onTextChange(event.target.value)}
    />
  ),
}));

vi.mock('../../../components/posts/TweetPreview', () => ({
  TweetPreview: () => null,
}));

vi.mock('../../../components/posts/LinkedInPreview', () => ({
  LinkedInPreview: () => null,
}));

vi.mock('../../../components/posts/FacebookPreview', () => ({
  FacebookPreview: () => null,
}));

vi.mock('../../../components/posts/TagSelector', () => ({
  TagSelector: () => <button type="button">Select tags...</button>,
}));

vi.mock('../../../components/posts/AutoDestructPicker', () => ({
  AutoDestructPicker: () => <div>Auto-destruct</div>,
}));

vi.mock('../../../components/posts/TagManagementDialog', () => ({
  TagManagementDialog: () => null,
}));

vi.mock('../../../components/posts/RateLimitBanner', () => ({
  RateLimitBanner: () => null,
}));

vi.mock('../../../components/profiles/RateLimitSettingsDialog', () => ({
  RateLimitSettingsDialog: () => null,
}));

vi.mock('../../../components/snippets/SnippetPicker', () => ({
  SnippetPicker: () => <button type="button">Insert snippet</button>,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NewPostPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NewPostPage scheduling validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the user on the form and focuses an inline schedule error when schedule time is missing', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Use Twitter profile' }),
    );
    await user.type(screen.getByLabelText('Tweet text'), 'A test tweet');
    await user.click(screen.getByRole('button', { name: 'Schedule Post' }));

    expect(createPostMutate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(
      screen.getByText('Select a scheduled time before scheduling.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Schedule')).toHaveFocus();
  });
});
