import twitterText from 'twitter-text';
import { PLATFORM_TEXT_LIMITS, countCodePoints } from './platform-text-limits.js';

const { parseTweet } = twitterText;

export interface PlatformCharCountResult {
  count: number;
  exceedsCap: boolean;
}

export type PlatformCharCountKey = 'twitter' | 'linkedin' | 'facebook';

export function getPlatformCharCount(
  text: string,
  platform: PlatformCharCountKey,
): PlatformCharCountResult {
  if (platform === 'twitter') {
    const parsedTweet = parseTweet(text);
    return {
      count: parsedTweet.weightedLength,
      exceedsCap: !parsedTweet.valid,
    };
  }

  const count = countCodePoints(text);
  return {
    count,
    exceedsCap: count > PLATFORM_TEXT_LIMITS[platform],
  };
}
