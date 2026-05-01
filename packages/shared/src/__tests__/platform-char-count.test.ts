import { describe, expect, it } from 'vitest';
import { getPlatformCharCount } from '../lib/platform-char-count.js';

describe('getPlatformCharCount', () => {
  it('twitter weighted-length matches parseTweet', () => {
    expect(getPlatformCharCount('https://example.com/x', 'twitter')).toEqual({
      count: 23,
      exceedsCap: false,
    });
  });

  it('linkedin uses code-point count vs 3000 cap', () => {
    expect(getPlatformCharCount('a'.repeat(3_001), 'linkedin')).toEqual({
      count: 3_001,
      exceedsCap: true,
    });
  });

  it('facebook uses code-point count vs 63206 cap', () => {
    expect(getPlatformCharCount('a'.repeat(63_206), 'facebook')).toEqual({
      count: 63_206,
      exceedsCap: false,
    });
  });

  it('reports exceedsCap when over', () => {
    expect(getPlatformCharCount('a'.repeat(63_207), 'facebook').exceedsCap).toBe(true);
  });
});
