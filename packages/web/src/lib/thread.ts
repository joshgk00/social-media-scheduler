export const THREAD_SEPARATOR = '[[tweet]]';

export interface TweetSegment {
  id: string;
  text: string;
}

export function serializeThread(tweets: TweetSegment[]): string {
  return tweets.map(t => t.text).join(THREAD_SEPARATOR);
}

export function deserializeThread(text: string): TweetSegment[] {
  return text.split(THREAD_SEPARATOR).map(segment => ({
    id: crypto.randomUUID(),
    text: segment.trim(),
  }));
}
