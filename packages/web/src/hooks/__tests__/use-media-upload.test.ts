import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadMediaFile } from '../use-media-upload';

interface MockXHRInstance {
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  withCredentials: boolean;
  status: number;
  responseText: string;
  upload: {
    onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  };
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

let mockXHR: MockXHRInstance;

function createMockXHR(): MockXHRInstance {
  return {
    open: vi.fn(),
    send: vi.fn(),
    setRequestHeader: vi.fn(),
    withCredentials: false,
    status: 0,
    responseText: '',
    upload: { onprogress: null },
    onload: null,
    onerror: null,
  };
}

beforeEach(() => {
  mockXHR = createMockXHR();
  // Use a class so `new XMLHttpRequest()` works
  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      open = mockXHR.open;
      send = mockXHR.send;
      setRequestHeader = mockXHR.setRequestHeader;
      withCredentials = mockXHR.withCredentials;
      get status() { return mockXHR.status; }
      get responseText() { return mockXHR.responseText; }
      upload = mockXHR.upload;
      set onload(fn: (() => void) | null) { mockXHR.onload = fn; }
      get onload() { return mockXHR.onload; }
      set onerror(fn: (() => void) | null) { mockXHR.onerror = fn; }
      get onerror() { return mockXHR.onerror; }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadMediaFile', () => {
  it('sends FormData with file, profileId, platform via XHR', () => {
    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    const onProgress = vi.fn();

    uploadMediaFile(file, 'profile-1', 'twitter', 'csrf-tok', onProgress);

    expect(mockXHR.open).toHaveBeenCalledWith('POST', '/api/media/upload');
    expect(mockXHR.setRequestHeader).toHaveBeenCalledWith('x-csrf-token', 'csrf-tok');
    expect(mockXHR.send).toHaveBeenCalled();

    const sentFormData = mockXHR.send.mock.calls[0][0] as FormData;
    expect(sentFormData.get('file')).toBeInstanceOf(File);
    expect(sentFormData.get('profileId')).toBe('profile-1');
    expect(sentFormData.get('platform')).toBe('twitter');
  });

  it('calls onProgress with percentage during upload', () => {
    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    const onProgress = vi.fn();

    uploadMediaFile(file, 'p-1', 'twitter', 'tok', onProgress);

    mockXHR.upload.onprogress!({
      lengthComputable: true,
      loaded: 50,
      total: 100,
    });
    expect(onProgress).toHaveBeenCalledWith(50);

    mockXHR.upload.onprogress!({
      lengthComputable: true,
      loaded: 100,
      total: 100,
    });
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it('resolves with parsed JSON on success (status 201)', async () => {
    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    const onProgress = vi.fn();

    const promise = uploadMediaFile(file, 'p-1', 'twitter', 'tok', onProgress);

    const serverResponse = {
      id: 'media-1',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024,
      thumbnailUrl: '/media/thumb.jpg',
      transcodeStatus: 'not_applicable',
    };

    mockXHR.status = 201;
    mockXHR.responseText = JSON.stringify(serverResponse);
    mockXHR.onload!();

    const result = await promise;
    expect(result).toEqual(serverResponse);
  });

  it('rejects with error message on server error (status 400)', async () => {
    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    const onProgress = vi.fn();

    const promise = uploadMediaFile(file, 'p-1', 'twitter', 'tok', onProgress);

    mockXHR.status = 400;
    mockXHR.responseText = JSON.stringify({ error: 'File too large' });
    mockXHR.onload!();

    await expect(promise).rejects.toThrow('File too large');
  });

  it('rejects with "Network error during upload" on XHR error', async () => {
    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    const onProgress = vi.fn();

    const promise = uploadMediaFile(file, 'p-1', 'twitter', 'tok', onProgress);

    mockXHR.onerror!();

    await expect(promise).rejects.toThrow('Network error during upload');
  });
});
