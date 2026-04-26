import { PLATFORM_TEXT_LIMITS } from '@sms/shared';

/**
 * Pure helper for D-04 cross-platform profile switching on the post-create form.
 *
 * When the user changes profile and the new profile's platform differs from the
 * current form platform, this function:
 *   1. Truncates `text` to the new platform's code-point limit (astral-safe).
 *   2. Drops fields that don't exist on the new platform's schema variant.
 *   3. Caps `mediaIds` at the new platform's image budget.
 *   4. Returns a human-readable toast string describing what changed, or null
 *      when nothing changed (no-op switch).
 *
 * Toast copy is sourced verbatim from 08-UI-SPEC.md §Cross-platform profile
 * switch toast (D-04). Behavior is unit-tested in
 * `src/__tests__/cross-platform-switch.test.ts` — that test is the contract.
 */

export type Platform = 'twitter' | 'linkedin' | 'facebook';

export interface PostFormSwitchState {
  text: string;
  visibility?: 'PUBLIC' | 'CONNECTIONS' | undefined;
  linkUrl?: string | null;
  isThread?: boolean;
  threadContinuation?: string;
  mediaIds: string[];
}

export interface PlatformSwitchResult {
  state: PostFormSwitchState;
  toast: string | null;
}

const MAX_IMAGES_BY_PLATFORM: Record<Platform, number> = {
  twitter: 4,
  linkedin: 1,
  facebook: 10,
};

function platformLabel(p: Platform): string {
  if (p === 'twitter') return 'Twitter';
  if (p === 'linkedin') return 'LinkedIn';
  return 'Facebook';
}

/**
 * Truncate a string to `maxCodePoints` Unicode code points using the spread
 * iterator. Avoids splitting astral-plane code points (U+10000+) that occupy
 * two UTF-16 code units, which a naive `slice` would corrupt.
 */
function truncateByCodePoints(text: string, maxCodePoints: number): string {
  const codePoints = [...text];
  if (codePoints.length <= maxCodePoints) return text;
  return codePoints.slice(0, maxCodePoints).join('');
}

export function applyPlatformSwitch(
  fromPlatform: Platform,
  toPlatform: Platform,
  state: PostFormSwitchState,
): PlatformSwitchResult {
  // No-op: same platform, return as-is. Toast is null because nothing changed.
  if (fromPlatform === toPlatform) {
    return { state: { ...state }, toast: null };
  }

  const next: PostFormSwitchState = { ...state, mediaIds: [...state.mediaIds] };
  const dropped: string[] = [];
  let textTruncated = false;

  // Step 1: truncate text by code point if the new platform is more restrictive.
  const newLimit = PLATFORM_TEXT_LIMITS[toPlatform];
  const truncated = truncateByCodePoints(next.text, newLimit);
  if (truncated !== next.text) {
    next.text = truncated;
    textTruncated = true;
  }

  // Step 2: drop fields that don't exist on the new platform's schema variant.
  // LinkedIn owns `visibility`; Facebook owns `linkUrl`; Twitter owns
  // `isThread` + `threadContinuation`. Anything not owned by `toPlatform` is
  // removed from the form state so the discriminated-union schema accepts it.

  if (toPlatform !== 'linkedin') {
    if (next.visibility !== undefined) {
      next.visibility = undefined;
      dropped.push('visibility');
    }
  } else {
    // Switching INTO LinkedIn — default visibility to PUBLIC if not already set.
    next.visibility = next.visibility ?? 'PUBLIC';
  }

  if (toPlatform !== 'facebook') {
    if (next.linkUrl) {
      next.linkUrl = null;
      dropped.push('link');
    }
  }

  if (toPlatform !== 'twitter') {
    if (next.isThread || (next.threadContinuation && next.threadContinuation.length > 0)) {
      next.isThread = false;
      next.threadContinuation = '';
      dropped.push('thread continuation');
    }
  }

  // Step 3: cap mediaIds at the new platform's image budget. Note that the FB
  // schema also forbids mixing image+video — that's enforced separately by
  // MediaDropZone; this helper just trims excess items from the array.
  const maxMedia = MAX_IMAGES_BY_PLATFORM[toPlatform];
  if (next.mediaIds.length > maxMedia) {
    next.mediaIds = next.mediaIds.slice(0, maxMedia);
    if (!dropped.includes('extra media')) dropped.push('extra media');
  }
  // FB→LI / FB→TW also drops video conceptually — represented in the toast as
  // "video" when leaving Facebook with media (plan reference toast table).
  if (fromPlatform === 'facebook' && toPlatform !== 'facebook' && state.mediaIds.length > 0) {
    if (!dropped.includes('video')) {
      // "video" is the canonical phrasing in the UI-SPEC toast table even
      // though we cannot tell image-vs-video from id alone. The downstream
      // MediaDropZone reconciles actual mime types when the user re-uploads.
      dropped.push('video');
    }
  }

  // Step 4: build the toast string, or null if nothing changed.
  if (dropped.length === 0 && !textTruncated) {
    return { state: next, toast: null };
  }

  // The UI-SPEC toast table phrases "visibility removed" with a postfix verb
  // (LI→FB row), but other items use the prefix "removed X" form
  // (TW→FB: "removed thread continuation"). We split the dropped list:
  //   - visibility goes into a postfix clause: "visibility removed"
  //   - everything else goes into a prefix clause: "removed X, Y, Z"
  // Both phrasings can coexist, e.g. FB→LI: "removed link, video; visibility removed".
  const visibilityDropped = dropped.includes('visibility');
  const otherDropped = dropped.filter((d) => d !== 'visibility');

  const clauses: string[] = [];
  if (otherDropped.length > 0) {
    clauses.push(`removed ${humanList(otherDropped)}`);
  }
  if (visibilityDropped) {
    clauses.push('visibility removed');
  }

  const droppedClause = clauses.length > 0 ? ` — ${clauses.join('; ')}` : '';

  const visibilitySetClause =
    fromPlatform === 'facebook' && toPlatform === 'linkedin'
      ? '; visibility set to Anyone'
      : '';
  const truncationClause = textTruncated
    ? ` Text truncated to ${newLimit} characters.`
    : '';

  const toast =
    `Switched to ${platformLabel(toPlatform)}${droppedClause}${visibilitySetClause}.${truncationClause}`.trim();

  return { state: next, toast };
}

function humanList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
