import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import EditPostPage from '../EditPostPage';

const navigate = vi.fn();
const updatePostMutate = vi.fn();
const uploadMedia = vi.fn();
const mocks = vi.hoisted(() => ({
  post: {
    id: 'post-1',
    profileId: 'profile-1',
    text: 'Queued import with typo',
    isThread: false,
    status: 'queued',
    scheduledAt: '2026-06-01T14:00:00.000Z',
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
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ id: 'post-1' }),
  };
});

vi.mock('../../../hooks/use-auth', () => ({
  useAuth: () => ({ data: { timezone: 'UTC' } }),
}));

vi.mock('../../../hooks/use-profiles', () => ({
  useProfiles: () => ({
    data: [
      {
        id: 'profile-1',
        platform: 'twitter',
        displayName: 'Codex Repro Twitter',
        handle: 'codexrepro',
        avatarUrl: '',
      },
    ],
  }),
}));

vi.mock('../../../hooks/use-posts', () => ({
  usePost: () => ({
    data: mocks.post,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdatePost: () => ({
    mutate: updatePostMutate,
    isPending: false,
  }),
}));

vi.mock('../../../hooks/use-media-upload', () => ({
  useMediaUpload: () => ({
    upload: uploadMedia,
    uploadingFiles: new Map(),
    isUploading: false,
  }),
}));

vi.mock('../../../hooks/use-media', () => ({
  useDeleteMedia: () => ({ mutate: vi.fn() }),
  useRetryTranscode: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../../components/posts/ProfilePicker', () => ({
  ProfilePicker: () => <div>Profile picker</div>,
}));

vi.mock('../../../components/posts/TwitterPostFields', () => ({
  TwitterPostFields: ({
    text,
    onTextChange,
    onFilesSelected,
  }: {
    text: string;
    onTextChange: (value: string) => void;
    onFilesSelected: (files: File[]) => void;
  }) => (
    <div>
      <textarea
        aria-label="Tweet text"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() =>
          onFilesSelected([
            new File(['first'], 'first.png', { type: 'image/png' }),
            new File(['second'], 'second.png', { type: 'image/png' }),
          ])
        }
      >
        Add two images
      </button>
    </div>
  ),
}));

vi.mock('../../../components/posts/SharedPostFields', () => ({
  SharedPostFields: ({ mode }: { mode: string }) => (
    <div data-testid="shared-fields-mode">{mode}</div>
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

vi.mock('../../../components/posts/TagManagementDialog', () => ({
  TagManagementDialog: () => null,
}));

vi.mock('../../../components/posts/RateLimitBanner', () => ({
  RateLimitBanner: () => null,
}));

vi.mock('../../../components/profiles/RateLimitSettingsDialog', () => ({
  RateLimitSettingsDialog: () => null,
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
        <EditPostPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EditPostPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses the queued update label for queued post edits', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Update Queued Post' })).toBeInTheDocument();
  });

  it('keeps queued edits queued when the primary action is submitted', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByTestId('shared-fields-mode')).toHaveTextContent('queue');

    const textarea = await screen.findByDisplayValue('Queued import with typo');
    await user.clear(textarea);
    await user.type(textarea, 'Queued import typo fixed');
    await user.click(screen.getByRole('button', { name: 'Update Queued Post' }));

    expect(updatePostMutate).toHaveBeenCalledTimes(1);
    const [mutationInput] = updatePostMutate.mock.calls[0];
    expect(mutationInput).toMatchObject({
      postId: 'post-1',
      postVersion: 1,
      postInput: {
        platform: 'twitter',
        text: 'Queued import typo fixed',
        isThread: false,
      },
    });
    expect(mutationInput.postInput).not.toHaveProperty('status');
    expect(mutationInput.postInput).not.toHaveProperty('scheduledAt');
  });

  it('starts selected media uploads concurrently', async () => {
    const user = userEvent.setup();
    const resolvers: Array<() => void> = [];
    uploadMedia.mockImplementation((file: File) => {
      const response = {
        id: `media-${resolvers.length + 1}`,
        fileName: file.name,
        mimeType: file.type,
        thumbnailUrl: null,
        transcodeStatus: 'completed',
      };

      return new Promise((resolve) => {
        resolvers.push(() => resolve(response));
      });
    });
    renderPage();

    await screen.findByDisplayValue('Queued import with typo');
    await user.click(screen.getByRole('button', { name: 'Add two images' }));

    expect(uploadMedia).toHaveBeenCalledTimes(2);
    expect(uploadMedia.mock.calls.map(([file]) => (file as File).name)).toEqual([
      'first.png',
      'second.png',
    ]);

    resolvers.forEach((resolve) => resolve());

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2));
  });
});
