import twitterText from 'twitter-text';
const { parseTweet } = twitterText;

export interface CharacterCountResult {
  weightedLength: number;
  valid: boolean;
  permillage: number;
  remaining: number;
}

/**
 * Get twitter-text character count for a SINGLE tweet segment.
 * In thread mode, call this per-segment (not on concatenated text).
 */
export function getCharacterCount(text: string): CharacterCountResult {
  const result = parseTweet(text);
  return {
    weightedLength: result.weightedLength,
    valid: result.valid,
    permillage: result.permillage,
    remaining: 280 - result.weightedLength,
  };
}
