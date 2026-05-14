import { Link as LinkIcon } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { MediaDropZone } from './MediaDropZone';
import { MediaThumbnailGrid } from './MediaThumbnailGrid';
import type { MediaItem } from './MediaThumbnail';
import type { UploadFileState } from '../../hooks/use-media-upload';

interface FacebookPostFieldsProps {
  linkUrl: string;
  onLinkUrlChange: (value: string) => void;
  linkUrlError?: string | null;
  mediaItems: MediaItem[];
  uploadingFiles: Map<string, UploadFileState>;
  onFilesSelected: (files: File[]) => void;
  onRemoveMedia: (id: string) => void;
  onReorderMedia: (ids: string[]) => void;
  onRetryTranscode: (id: string) => void;
  disabled?: boolean;
}

/**
 * Facebook-specific subform fields (POST-FB-02, POST-FB-03, POST-FB-04).
 *
 * Renders the optional URL field + 10-image / 1-video MediaDropZone. Mounted
 * inside the platform branch in NewPostPage / EditPostPage when the selected
 * profile's platform is `facebook`.
 */
export function FacebookPostFields({
  linkUrl,
  onLinkUrlChange,
  linkUrlError,
  mediaItems,
  uploadingFiles,
  onFilesSelected,
  onRemoveMedia,
  onReorderMedia,
  onRetryTranscode,
  disabled,
}: FacebookPostFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="link-url" className="text-sm font-semibold inline-flex items-center gap-1">
          <LinkIcon size={14} aria-hidden="true" /> Link (optional)
        </Label>
        <Input
          id="link-url"
          type="url"
          placeholder="https://example.com"
          value={linkUrl}
          onChange={(event) => onLinkUrlChange(event.target.value)}
          aria-invalid={linkUrlError ? 'true' : undefined}
          aria-describedby="link-url-helper"
          disabled={disabled}
        />
        <p id="link-url-helper" className="text-xs text-muted-foreground">
          Facebook generates a link preview at publish time.
        </p>
        {linkUrlError && (
          <p className="text-xs text-destructive">{linkUrlError}</p>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Up to 10 images (JPG, GIF, PNG, BMP, TIFF, max 5 MB each) or 1 video (max 100 MB)
        </p>
        <MediaDropZone
          platform="facebook"
          existingMediaCount={mediaItems.length}
          maxFiles={10}
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
