import { useState, useCallback } from 'react';
import { getCsrfToken } from '../lib/api-client';
import type { MediaUploadResponse } from '@sms/shared';

export interface UploadFileState {
  progress: number;
  status: 'uploading' | 'done' | 'error';
}

export function uploadMediaFile(
  file: File,
  profileId: string,
  platform: string,
  csrfToken: string,
  onProgress: (percent: number) => void,
): Promise<MediaUploadResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('profileId', profileId);
    formData.append('platform', platform);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload');
    xhr.setRequestHeader('x-csrf-token', csrfToken);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as MediaUploadResponse);
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new Error(body?.error || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

export function useMediaUpload() {
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, UploadFileState>>(new Map());

  const upload = useCallback(async (
    file: File,
    profileId: string,
    platform: string,
  ): Promise<MediaUploadResponse> => {
    const tempId = crypto.randomUUID();
    setUploadingFiles((prev) => {
      const next = new Map(prev);
      next.set(tempId, { progress: 0, status: 'uploading' });
      return next;
    });

    try {
      const csrfToken = await getCsrfToken();
      const response = await uploadMediaFile(
        file,
        profileId,
        platform,
        csrfToken,
        (percent) => {
          setUploadingFiles((prev) => {
            const next = new Map(prev);
            next.set(tempId, { progress: percent, status: 'uploading' });
            return next;
          });
        },
      );

      setUploadingFiles((prev) => {
        const next = new Map(prev);
        next.delete(tempId);
        return next;
      });

      return response;
    } catch (error) {
      setUploadingFiles((prev) => {
        const next = new Map(prev);
        next.set(tempId, { progress: 0, status: 'error' });
        return next;
      });

      // Clean up error entry after a short delay
      setTimeout(() => {
        setUploadingFiles((prev) => {
          const next = new Map(prev);
          next.delete(tempId);
          return next;
        });
      }, 3000);

      throw error;
    }
  }, []);

  const isUploading = Array.from(uploadingFiles.values()).some(
    (f) => f.status === 'uploading',
  );

  return { upload, uploadingFiles, isUploading };
}
