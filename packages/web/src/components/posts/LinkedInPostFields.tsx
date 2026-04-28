import { VisibilitySelector } from './VisibilitySelector';
import { MediaDropZone } from './MediaDropZone';
import { MediaThumbnailGrid } from './MediaThumbnailGrid';
import type { MediaItem } from './MediaThumbnail';
import type { UploadFileState } from '../../hooks/use-media-upload';

interface LinkedInPostFieldsProps {
  visibility: 'PUBLIC' | 'CONNECTIONS';
  onVisibilityChange: (value: 'PUBLIC' | 'CONNECTIONS') => void;
  mediaItems: MediaItem[];
  uploadingFiles: Map<string, UploadFileState>;
  onFilesSelected: (files: File[]) => void;
  onRemoveMedia: (id: string) => void;
  onReorderMedia: (ids: string[]) => void;
  onRetryTranscode: (id: string) => void;
  disabled?: boolean;
}

/**
 * LinkedIn-specific subform fields (POST-LI-03 + POST-LI-02).
 *
 * Renders the visibility selector + 1-image MediaDropZone. Mounted inside the
 * platform branch in NewPostPage / EditPostPage when the selected profile's
 * platform is `linkedin`.
 */
export function LinkedInPostFields({
  visibility,
  onVisibilityChange,
  mediaItems,
  uploadingFiles,
  onFilesSelected,
  onRemoveMedia,
  onReorderMedia,
  onRetryTranscode,
  disabled,
}: LinkedInPostFieldsProps) {
  return (
    <div className="space-y-4">
      <VisibilitySelector
        value={visibility}
        onValueChange={onVisibilityChange}
        disabled={disabled}
      />
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          1 image (JPG, GIF, PNG, max 20 MB)
        </p>
        <MediaDropZone
          platform="linkedin"
          existingMediaCount={mediaItems.length}
          maxFiles={1}
          onFilesSelected={onFilesSelected}
          disabled={disabled}
          hasVideo={mediaItems.some((m) => m.mimeType.startsWith('video/'))}
        />
        {mediaItems.length > 0 && (
          <MediaThumbnailGrid
            mediaItems={mediaItems}
            uploadingFiles={uploadingFiles}
            onRemove={onRemoveMedia}
            onReorder={onReorderMedia}
            onRetryTranscode={onRetryTranscode}
            readOnly={false}
          />
        )}
      </div>
    </div>
  );
}
