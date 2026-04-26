import { Play } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Card } from '../ui/card';

interface FacebookPreviewProps {
  text: string;
  imageUrls: string[];
  linkUrl: string | null;
  videoUrl: string | null;
  profileName?: string;
  profileAvatarUrl?: string | null;
  scheduledAt?: string | null;
}

const SPINNABLE_PATTERN = /\{[^{}|]+\|[^{}|]+(?:\|[^{}|]+)*\}/g;

function renderTextWithHighlights(text: string): React.ReactNode {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  SPINNABLE_PATTERN.lastIndex = 0;
  while ((match = SPINNABLE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={`spin-${match.index}`} className="text-primary font-medium">
        {match[0]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

interface FacebookImageGridProps {
  imageUrls: string[];
}

/**
 * Per UI-SPEC §Facebook Preview Card image-count table:
 *   1     → single full-width image
 *   2     → 2-col grid, both aspect-square
 *   3     → first image full-height left, two stacked aspect-square right
 *   4     → 2x2 grid, all aspect-square
 *   5-10  → 3-col grid, first 6 visible. When count > 6, the 6th cell shows
 *           a "+N" overlay where N is `imageUrls.length - 5` (5 are visible
 *           cleanly + 6th becomes the overlay slot for the rest).
 */
function FacebookImageGrid({ imageUrls }: FacebookImageGridProps) {
  const count = imageUrls.length;
  if (count === 0) return null;

  if (count === 1) {
    return (
      <div className="aspect-video w-full rounded-md overflow-hidden bg-muted" data-fb-grid="1">
        <img src={imageUrls[0]} alt="Post image" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="grid grid-cols-2 gap-2 rounded-md overflow-hidden" data-fb-grid="2">
        {imageUrls.map((url, idx) => (
          <div key={`${url}-${idx}`} className="aspect-square bg-muted overflow-hidden">
            <img src={url} alt="Post image" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="grid grid-cols-2 gap-2 rounded-md overflow-hidden" data-fb-grid="3">
        <div className="row-span-2 bg-muted overflow-hidden">
          <img src={imageUrls[0]} alt="Post image" className="w-full h-full object-cover" />
        </div>
        <div className="aspect-square bg-muted overflow-hidden">
          <img src={imageUrls[1]} alt="Post image" className="w-full h-full object-cover" />
        </div>
        <div className="aspect-square bg-muted overflow-hidden">
          <img src={imageUrls[2]} alt="Post image" className="w-full h-full object-cover" />
        </div>
      </div>
    );
  }

  if (count === 4) {
    return (
      <div className="grid grid-cols-2 gap-2 rounded-md overflow-hidden" data-fb-grid="4">
        {imageUrls.map((url, idx) => (
          <div key={`${url}-${idx}`} className="aspect-square bg-muted overflow-hidden">
            <img src={url} alt="Post image" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    );
  }

  // 5-10 images: 3-col grid. Show first 5 cleanly + a 6th cell. When count > 6,
  // the 6th cell renders the 6th image with a "+N" overlay where N = count - 6
  // (the 6th image is visible underneath the dimmed overlay). When count === 6,
  // the 6th cell renders the 6th image cleanly with no overlay.
  const showOverlay = count > 6;
  const overflowCount = showOverlay ? count - 6 : 0;
  return (
    <div className="grid grid-cols-3 gap-2 rounded-md overflow-hidden" data-fb-grid={String(count)}>
      {imageUrls.slice(0, 5).map((url, idx) => (
        <div key={`${url}-${idx}`} className="aspect-square bg-muted overflow-hidden">
          <img src={url} alt="Post image" className="w-full h-full object-cover" />
        </div>
      ))}
      {imageUrls[5] && (
        <div
          className="aspect-square bg-muted overflow-hidden relative"
          {...(showOverlay
            ? { 'aria-label': `${overflowCount} more images not shown in preview` }
            : {})}
        >
          <img src={imageUrls[5]} alt="Post image" className="w-full h-full object-cover" />
          {showOverlay && (
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
              <span className="text-lg font-semibold">+{overflowCount}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Medium-fidelity Facebook post preview (POST-FB-06).
 *
 * Layout matches UI-SPEC §Facebook Preview Card:
 *   - Avatar + name + timestamp
 *   - Post text (whitespace-pre-wrap, spinnable variants highlighted)
 *   - Optional linkUrl as plain text in `text-primary` (NOT an anchor — D-10)
 *   - Optional image grid (1, 2, 3, 4, 5-10 layouts)
 *   - Optional video aspect-video placeholder with Play icon
 */
export function FacebookPreview({
  text,
  imageUrls,
  linkUrl,
  videoUrl,
  profileName,
  profileAvatarUrl,
  scheduledAt,
}: FacebookPreviewProps) {
  const displayName = profileName ?? 'Select a profile';
  const initials = displayName.slice(0, 2).toUpperCase();
  const timestamp = scheduledAt
    ? new Date(scheduledAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Just now';

  const hasMedia = imageUrls.length > 0 || !!videoUrl;
  const hasAnyContent = text.length > 0 || !!linkUrl || hasMedia;

  return (
    <div className="sticky top-6">
      <h3 className="text-sm font-semibold mb-4">Preview</h3>
      <Card className="bg-card border-border rounded-lg p-4 max-w-[520px]">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            {profileAvatarUrl && <AvatarImage src={profileAvatarUrl} alt={displayName} />}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold truncate">{displayName}</span>
              <span className="text-xs text-muted-foreground shrink-0">{timestamp}</span>
            </div>
          </div>
        </div>

        {!hasAnyContent ? (
          <p className="text-xs text-muted-foreground italic mt-3">
            Type to see your post here…
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {text.length > 0 && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {renderTextWithHighlights(text)}
              </p>
            )}
            {linkUrl && (
              <p className="text-sm text-primary break-all">{linkUrl}</p>
            )}
            {imageUrls.length > 0 && <FacebookImageGrid imageUrls={imageUrls} />}
            {videoUrl && (
              <div className="aspect-video w-full rounded-md overflow-hidden bg-secondary flex items-center justify-center">
                <Play
                  aria-label="Play video"
                  className="h-6 w-6 text-muted-foreground"
                />
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
