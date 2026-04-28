import { Globe, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Card } from '../ui/card';

interface LinkedInPreviewProps {
  text: string;
  visibility: 'PUBLIC' | 'CONNECTIONS';
  profileName?: string;
  profileAvatarUrl?: string | null;
  imageUrl?: string | null;
  scheduledAt?: string | null;
}

const SPINNABLE_PATTERN = /\{[^{}|]+\|[^{}|]+(?:\|[^{}|]+)*\}/g;

/**
 * Renders the post text with `{a|b|c}` spinnable variants highlighted as
 * `text-primary` spans. URLs are left as plain text inside the same span
 * stream — they are NOT rendered as anchors (D-10: medium-fidelity preview
 * does not unfurl, does not click through).
 */
function renderTextWithHighlights(text: string): React.ReactNode {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // Reset the global regex's lastIndex; it persists between calls because
  // `g` flag tracks state on the regex literal.
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

/**
 * Medium-fidelity LinkedIn share preview (POST-LI-05).
 *
 * Layout matches UI-SPEC §LinkedIn Preview Card:
 *   - Avatar + name on first row
 *   - Visibility line (🌐 Anyone on LinkedIn / 👥 Connections only)
 *   - Post text with `whitespace-pre-wrap`
 *   - Optional single image rendered aspect-video
 *
 * Spinnable variants `{a|b|c}` are highlighted with `text-primary`. URLs
 * are plain text in the same paragraph (D-10).
 */
export function LinkedInPreview({
  text,
  visibility,
  profileName,
  profileAvatarUrl,
  imageUrl,
  scheduledAt,
}: LinkedInPreviewProps) {
  const displayName = profileName ?? 'Select a profile';
  const initials = displayName.slice(0, 2).toUpperCase();
  const visibilityLabel =
    visibility === 'PUBLIC' ? 'Anyone on LinkedIn' : 'Connections only';
  const VisibilityIcon = visibility === 'PUBLIC' ? Globe : Users;
  const timestamp = scheduledAt
    ? new Date(scheduledAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Just now';

  const hasContent = text.length > 0 || !!imageUrl;

  return (
    <div className="sticky top-6">
      <h3 className="text-sm font-semibold mb-4">Preview</h3>
      <Card className="bg-card border-border rounded-lg p-4 max-w-[480px]">
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
            <div className="flex items-center gap-1 mt-0.5">
              <VisibilityIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">{visibilityLabel}</span>
            </div>
          </div>
        </div>

        {!hasContent ? (
          <p className="text-xs text-muted-foreground italic mt-3">
            Type to see your post here…
          </p>
        ) : (
          <>
            {text.length > 0 && (
              <p className="text-sm whitespace-pre-wrap break-words mt-3">
                {renderTextWithHighlights(text)}
              </p>
            )}
            {imageUrl && (
              <div className="aspect-video w-full rounded-md overflow-hidden bg-muted mt-3">
                <img
                  src={imageUrl}
                  alt="Post image"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
