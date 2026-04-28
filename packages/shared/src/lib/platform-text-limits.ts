/**
 * Platform-specific text length limits and a code-point-aware counter.
 *
 * LinkedIn and Facebook count by Unicode code points, not by JavaScript
 * UTF-16 code units (which would split astral-plane emoji incorrectly).
 * Twitter uses weighted counting via the twitter-text library — that is
 * NOT handled here; consumers route Twitter through `twitter-text.parseTweet`
 * directly because URLs count as 23 chars regardless of length and
 * grapheme-cluster weighting differs from a raw code-point count.
 */

export const PLATFORM_TEXT_LIMITS = {
  // Thread-aware combined max. Per-tweet 280 char limit is enforced via twitter-text.
  twitter: 25_000,
  // POST-LI-04: LinkedIn share text max length.
  linkedin: 3_000,
  // POST-FB-05: Facebook post max length.
  facebook: 63_206,
} as const;

export type PlatformTextLimitKey = keyof typeof PLATFORM_TEXT_LIMITS;

/**
 * Counts Unicode code points using the spread iterator.
 *
 * The spread iterator walks the string by code point, so astral-plane
 * code points (U+10000+) are counted as one code point each rather than
 * as two UTF-16 code units. Family ZWJ sequences (e.g. man + ZWJ +
 * woman + ZWJ + girl) count as 5 code points (3 people + 2 ZWJ joiners),
 * matching the LinkedIn/Facebook server-side counter.
 *
 * Use for LinkedIn and Facebook char counts. Do NOT use for Twitter —
 * Twitter counts t.co URLs as 23 chars regardless of length and applies
 * grapheme-cluster weighting; route Twitter through `twitter-text` instead.
 */
export function countCodePoints(text: string): number {
  return [...text].length;
}

export function isWithinPlatformLimit(
  text: string,
  platform: PlatformTextLimitKey,
): boolean {
  return countCodePoints(text) <= PLATFORM_TEXT_LIMITS[platform];
}
