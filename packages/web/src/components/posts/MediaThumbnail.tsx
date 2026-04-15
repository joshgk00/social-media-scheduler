import { useState, useEffect } from 'react';
import {
  X,
  GripVertical,
  Film,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { Progress } from '../ui/progress';
import type { TranscodeStatus } from '@sms/shared';

export interface MediaItem {
  id: string;
  fileName: string;
  mimeType: string;
  thumbnailUrl: string | null;
  transcodeStatus: TranscodeStatus;
  transcodeError: string | null;
}

interface MediaThumbnailProps {
  media: MediaItem;
  uploadProgress?: number;
  isUploading: boolean;
  onRemove: () => void;
  onRetryTranscode: () => void;
  showDragHandle: boolean;
  readOnly: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
}

export function MediaThumbnail({
  media,
  uploadProgress,
  isUploading,
  onRemove,
  onRetryTranscode,
  showDragHandle,
  readOnly,
  dragAttributes,
  dragListeners,
}: MediaThumbnailProps) {
  const [showCompleteCheck, setShowCompleteCheck] = useState(false);
  const isVideo = media.mimeType.startsWith('video/');
  const isTranscoding =
    media.transcodeStatus === 'pending' || media.transcodeStatus === 'processing';
  const isTranscodeFailed = media.transcodeStatus === 'failed';
  const isTranscodeComplete = media.transcodeStatus === 'completed';

  useEffect(() => {
    if (isTranscodeComplete && isVideo) {
      setShowCompleteCheck(true);
      const timer = setTimeout(() => setShowCompleteCheck(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isTranscodeComplete, isVideo]);

  const shouldShowDragHandle =
    showDragHandle && !readOnly && !isUploading && !isTranscoding;

  return (
    <div
      className={`aspect-square rounded-md overflow-hidden relative bg-card ${
        readOnly ? 'opacity-80' : ''
      }`}
      aria-label={`${media.fileName}, ${getStatusLabel(media, isUploading)}`}
    >
      {/* Image or video placeholder */}
      {isVideo && !media.thumbnailUrl ? (
        <div className="w-full h-full flex flex-col items-center justify-center">
          <Film className="h-8 w-8 text-muted-foreground" />
          <span className="text-xs text-muted-foreground mt-1 truncate max-w-full px-2">
            {media.fileName}
          </span>
        </div>
      ) : (
        <img
          src={media.thumbnailUrl ?? ''}
          alt={media.fileName}
          className="object-cover w-full h-full"
        />
      )}

      {/* Upload progress overlay */}
      {isUploading && uploadProgress !== undefined && (
        <div className="absolute inset-0 bg-background/60 flex flex-col items-center justify-center gap-2 p-2">
          <Progress
            value={uploadProgress}
            className="w-3/4"
            aria-label={`Uploading ${media.fileName}`}
          />
          <span className="text-xs text-foreground">{uploadProgress}%</span>
        </div>
      )}

      {/* Transcode queued overlay */}
      {!isUploading && media.transcodeStatus === 'pending' && (
        <div className="absolute inset-0 bg-background/60 flex flex-col items-center justify-center gap-1">
          <Loader2 className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Queued...</span>
        </div>
      )}

      {/* Transcoding in progress overlay */}
      {!isUploading && media.transcodeStatus === 'processing' && (
        <div className="absolute inset-0 bg-background/60 flex flex-col items-center justify-center gap-1">
          <Loader2 className="h-6 w-6 text-warning animate-spin" />
          <span className="text-xs text-warning">Transcoding...</span>
        </div>
      )}

      {/* Transcode complete check (momentary) */}
      {!isUploading && showCompleteCheck && (
        <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
          <CheckCircle className="h-6 w-6 text-success" />
        </div>
      )}

      {/* Transcode failed overlay */}
      {!isUploading && isTranscodeFailed && (
        <div className="absolute inset-0 bg-destructive/10 flex flex-col items-center justify-center gap-1 p-2">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <span className="text-xs text-destructive font-semibold">Transcode failed</span>
          {media.transcodeError && (
            <span className="text-xs text-destructive text-center truncate max-w-full">
              {media.transcodeError}
            </span>
          )}
          <div className="flex gap-3 mt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetryTranscode();
              }}
              className="text-xs text-primary cursor-pointer hover:underline"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-xs text-destructive cursor-pointer hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Drag handle */}
      {shouldShowDragHandle && (
        <button
          type="button"
          className="absolute top-1 left-1 p-1 rounded bg-background/80 backdrop-blur-sm cursor-grab text-muted-foreground"
          aria-label={`Reorder ${media.fileName}`}
          {...dragAttributes}
          {...dragListeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Remove button */}
      {!readOnly && !isUploading && !isTranscodeFailed && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1 right-1 p-1 rounded-full bg-background/80 backdrop-blur-sm hover:text-destructive transition-colors"
          aria-label={`Remove ${media.fileName}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function getStatusLabel(media: MediaItem, isUploading: boolean): string {
  if (isUploading) return 'uploading';
  switch (media.transcodeStatus) {
    case 'pending':
      return 'queued';
    case 'processing':
      return 'transcoding';
    case 'failed':
      return 'transcode failed';
    case 'completed':
      return 'ready';
    case 'not_applicable':
      return 'uploaded';
    default:
      return 'uploaded';
  }
}
