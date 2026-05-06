import type { RefObject } from 'react';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { CharacterCountRing } from './CharacterCountRing';
import { ThreadEditor } from './ThreadEditor';
import { MediaDropZone } from './MediaDropZone';
import { MediaThumbnailGrid } from './MediaThumbnailGrid';
import type { MediaItem } from './MediaThumbnail';
import type { TweetSegment } from '../../lib/thread';
import type { UploadFileState } from '../../hooks/use-media-upload';

interface TwitterPostFieldsProps {
  text: string;
  onTextChange: (value: string) => void;
  isThread: boolean;
  onThreadToggle: (checked: boolean) => void;
  tweets: TweetSegment[];
  onTweetsChange: (tweets: TweetSegment[]) => void;
  mediaItems: MediaItem[];
  uploadingFiles: Map<string, UploadFileState>;
  maxFiles: number;
  onFilesSelected: (files: File[]) => void;
  onRemoveMedia: (id: string) => void;
  onReorderMedia: (ids: string[]) => void;
  onRetryTranscode: (id: string) => void;
  disabled?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Twitter-specific subform fields.
 *
 * Renders the thread toggle, single-tweet textarea OR ThreadEditor, and
 * Twitter-shaped MediaDropZone (up to 4 images or 1 video). Mounted inside
 * the platform branch in NewPostPage / EditPostPage when the selected
 * profile's platform is `twitter`.
 */
export function TwitterPostFields({
  text,
  onTextChange,
  isThread,
  onThreadToggle,
  tweets,
  onTweetsChange,
  mediaItems,
  uploadingFiles,
  maxFiles,
  onFilesSelected,
  onRemoveMedia,
  onReorderMedia,
  onRetryTranscode,
  disabled,
  textareaRef,
}: TwitterPostFieldsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch
          id="thread-toggle"
          checked={isThread}
          onCheckedChange={onThreadToggle}
          disabled={disabled}
        />
        <Label htmlFor="thread-toggle">Thread mode</Label>
      </div>

      {isThread ? (
        <ThreadEditor tweets={tweets} onChange={onTweetsChange} />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="tweet-text">Tweet text</Label>
          <div className="relative">
            <Textarea
              id="tweet-text"
              ref={textareaRef}
              placeholder="What's happening?"
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              rows={5}
              disabled={disabled}
            />
            <div className="absolute bottom-2 right-2">
              <CharacterCountRing text={text} />
            </div>
          </div>
        </div>
      )}

      <MediaDropZone
        platform="twitter"
        existingMediaCount={mediaItems.length}
        maxFiles={maxFiles}
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
  );
}
