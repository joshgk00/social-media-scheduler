import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import NewPostPage from '../NewPostPage';

const navigate = vi.fn();
const createPostMutate = vi.fn();
const uploadMedia = vi.fn();

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
    upload: uploadMedia,
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
    mediaItems,
    onFilesSelected,
    onMediaStatusUpdate,
  }: {
    text: string;
    onTextChange: (value: string) => void;
    mediaItems: Array<{ id: string }>;
    onFilesSelected: (files: File[]) => void;
    onMediaStatusUpdate: (
      id: string,
      status: 'completed',
      error: string | null,
    ) => void;
  }) => (
    <div>
      <textarea
        aria-label="Tweet text"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() => onFilesSelected([new File(['video'], 'video.mp4')])}
      >
        Add pending video
      </button>
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
      <button
        type="button"
        onClick={() => onMediaStatusUpdate(mediaItems[0].id, 'completed', null)}
        disabled={mediaItems.length === 0}
      >
        Complete transcode
      </button>
    </div>
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
    uploadMedia.mockResolvedValue({
      id: 'media-1',
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      thumbnailUrl: null,
      transcodeStatus: 'pending',
    });
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

  it('reenables scheduling when media polling reports a completed transcode', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Use Twitter profile' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add pending video' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Schedule Post' })).toBeDisabled(),
    );

    await user.click(screen.getByRole('button', { name: 'Complete transcode' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Schedule Post' })).not.toBeDisabled(),
    );
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

    await user.click(
      screen.getByRole('button', { name: 'Use Twitter profile' }),
    );
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
