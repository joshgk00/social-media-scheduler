import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostMedia } from '../use-post-media';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  deleteMedia: vi.fn(),
  retryTranscode: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../use-media-upload', () => ({
  useMediaUpload: () => ({
    upload: mocks.upload,
    uploadingFiles: new Map(),
    isUploading: false,
  }),
}));

vi.mock('../use-media', () => ({
  useDeleteMedia: () => ({ mutate: mocks.deleteMedia }),
  useRetryTranscode: () => ({ mutate: mocks.retryTranscode }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePostMedia', () => {
  it('derives platform limits and media blocking state from media items', () => {
    const { result } = renderHook(() => usePostMedia('profile-1', 'twitter'));

    expect(result.current.maxFilesForPlatform).toBe(4);

    act(() => {
      result.current.setMediaItems([
        {
          id: 'media-1',
          fileName: 'video.mp4',
          mimeType: 'video/mp4',
          thumbnailUrl: null,
          transcodeStatus: 'pending',
          transcodeError: null,
        },
      ]);
    });

    expect(result.current.maxFilesForPlatform).toBe(1);
    expect(result.current.hasTranscodingMedia).toBe(true);
    expect(result.current.isMediaBlocking).toBe(true);

    act(() => {
      result.current.handleMediaStatusUpdate('media-1', 'completed', null);
    });

    expect(result.current.hasTranscodingMedia).toBe(false);
    expect(result.current.isMediaBlocking).toBe(false);
  });

  it('uploads selected files concurrently and appends successful media', async () => {
    const resolvers: Array<() => void> = [];
    mocks.upload.mockImplementation((file: File) =>
      new Promise((resolve) => {
        const mediaNumber = resolvers.length + 1;
        resolvers.push(() =>
          resolve({
            id: `media-${mediaNumber}`,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            thumbnailUrl: null,
            transcodeStatus: 'completed',
          }),
        );
      }),
    );
    const { result } = renderHook(() => usePostMedia('profile-1', 'twitter'));

    await act(async () => {
      const uploadPromise = result.current.handleFilesSelected([
        new File(['first'], 'first.png', { type: 'image/png' }),
        new File(['second'], 'second.png', { type: 'image/png' }),
      ]);

      expect(mocks.upload).toHaveBeenCalledTimes(2);
      expect(mocks.upload.mock.calls.map(([file]) => (file as File).name)).toEqual([
        'first.png',
        'second.png',
      ]);

      resolvers.forEach((resolve) => resolve());
      await uploadPromise;
    });

    await waitFor(() => {
      expect(result.current.mediaItems.map((item) => item.fileName)).toEqual([
        'first.png',
        'second.png',
      ]);
    });
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(2);
  });
});
