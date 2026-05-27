import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostMedia } from '../use-post-media';
import type { MediaItem } from '../../components/posts/MediaThumbnail';

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
  vi.resetAllMocks();
});

describe('usePostMedia', () => {
  function mediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
    return {
      id: 'media-1',
      fileName: 'media.png',
      mimeType: 'image/png',
      thumbnailUrl: null,
      transcodeStatus: 'completed',
      transcodeError: null,
      ...overrides,
    };
  }

  it('derives platform limits and media blocking state from media items', () => {
    const { result } = renderHook(() => usePostMedia('profile-1', 'twitter'));

    expect(result.current.maxFilesForPlatform).toBe(4);

    act(() => {
      result.current.setMediaItems([
        mediaItem({
          id: 'media-1',
          fileName: 'video.mp4',
          mimeType: 'video/mp4',
          transcodeStatus: 'pending',
        }),
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

  it('uploads selected files concurrently and appends successful media in selection order', async () => {
    const resolvers = new Map<string, () => void>();
    mocks.upload.mockImplementation((file: File) =>
      new Promise((resolve) => {
        resolvers.set(file.name, () =>
          resolve({
            id: `media-${file.name}`,
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

    let uploadPromise!: Promise<void>;
    act(() => {
      uploadPromise = result.current.handleFilesSelected([
        new File(['first'], 'first.png', { type: 'image/png' }),
        new File(['second'], 'second.png', { type: 'image/png' }),
      ]);

      expect(mocks.upload).toHaveBeenCalledTimes(2);
      expect(mocks.upload.mock.calls.map(([file]) => (file as File).name)).toEqual([
        'first.png',
        'second.png',
      ]);
    });

    await act(async () => {
      resolvers.get('second.png')?.();
      await Promise.resolve();
    });
    expect(result.current.mediaItems).toEqual([]);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolvers.get('first.png')?.();
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

  it('shows upload errors without appending failed media', async () => {
    mocks.upload
      .mockResolvedValueOnce({
        id: 'media-1',
        fileName: 'first.png',
        mimeType: 'image/png',
        thumbnailUrl: null,
        transcodeStatus: 'completed',
      })
      .mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => usePostMedia('profile-1', 'twitter'));

    await act(async () => {
      await result.current.handleFilesSelected([
        new File(['first'], 'first.png', { type: 'image/png' }),
        new File(['second'], 'second.png', { type: 'image/png' }),
      ]);
    });

    expect(result.current.mediaItems.map((item) => item.fileName)).toEqual(['first.png']);
    expect(mocks.toastSuccess).toHaveBeenCalledOnce();
    expect(mocks.toastError).toHaveBeenCalledWith('Upload failed: network down');
  });

  it('removes media after the delete mutation succeeds and reports delete errors', () => {
    const { result } = renderHook(() => usePostMedia('profile-1', 'twitter'));

    act(() => {
      result.current.setMediaItems([
        mediaItem({ id: 'media-1', fileName: 'first.png' }),
        mediaItem({ id: 'media-2', fileName: 'second.png' }),
      ]);
    });

    act(() => {
      result.current.handleRemoveMedia('media-1');
    });

    expect(mocks.deleteMedia).toHaveBeenCalledWith('media-1', expect.objectContaining({
      onSuccess: expect.any(Function),
      onError: expect.any(Function),
    }));

    act(() => {
      mocks.deleteMedia.mock.calls[0][1].onSuccess();
    });

    expect(result.current.mediaItems.map((item) => item.id)).toEqual(['media-2']);

    act(() => {
      result.current.handleRemoveMedia('media-2');
      mocks.deleteMedia.mock.calls[1][1].onError(new Error('delete failed'));
    });

    expect(mocks.toastError).toHaveBeenCalledWith('delete failed');
  });

  it('reorders media and ignores missing ids', () => {
    const { result } = renderHook(() => usePostMedia('profile-1', 'twitter'));

    act(() => {
      result.current.setMediaItems([
        mediaItem({ id: 'media-1', fileName: 'first.png' }),
        mediaItem({ id: 'media-2', fileName: 'second.png' }),
      ]);
      result.current.handleReorderMedia(['media-2', 'missing', 'media-1']);
    });

    expect(result.current.mediaItems.map((item) => item.id)).toEqual(['media-2', 'media-1']);
  });

  it('retries failed transcodes and reports retry errors', () => {
    const { result } = renderHook(() => usePostMedia('profile-1', 'twitter'));

    act(() => {
      result.current.setMediaItems([
        mediaItem({
          id: 'media-1',
          fileName: 'video.mp4',
          mimeType: 'video/mp4',
          transcodeStatus: 'failed',
          transcodeError: 'codec failed',
        }),
      ]);
      result.current.handleRetryTranscode('media-1');
    });

    expect(mocks.retryTranscode).toHaveBeenCalledWith('media-1', expect.objectContaining({
      onSuccess: expect.any(Function),
      onError: expect.any(Function),
    }));

    act(() => {
      mocks.retryTranscode.mock.calls[0][1].onSuccess();
    });

    expect(result.current.mediaItems[0]).toMatchObject({
      transcodeStatus: 'pending',
      transcodeError: null,
    });

    act(() => {
      result.current.handleRetryTranscode('media-1');
      mocks.retryTranscode.mock.calls[1][1].onError(new Error('retry failed'));
    });

    expect(mocks.toastError).toHaveBeenCalledWith('retry failed');
  });

  it('does not replace media when a status update is unchanged', () => {
    const { result } = renderHook(() => usePostMedia('profile-1', 'twitter'));
    const originalItem = mediaItem({
      id: 'media-1',
      transcodeStatus: 'completed',
      transcodeError: null,
    });

    act(() => {
      result.current.setMediaItems([originalItem]);
    });

    act(() => {
      result.current.handleMediaStatusUpdate('media-1', 'completed', null);
    });

    expect(result.current.mediaItems[0]).toBe(originalItem);

    act(() => {
      result.current.handleMediaStatusUpdate('media-1', 'failed', 'transcode failed');
    });

    expect(result.current.mediaItems[0]).not.toBe(originalItem);
    expect(result.current.mediaItems[0]).toMatchObject({
      transcodeStatus: 'failed',
      transcodeError: 'transcode failed',
    });
  });
});
