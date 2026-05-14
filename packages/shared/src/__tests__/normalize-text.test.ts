import { describe, expect, it } from 'vitest';
import { dedupeKey, normalizePostText } from '../lib/normalize-text.js';

describe('normalizePostText', () => {
  it('normalizes whitespace and lowercase per D-17', () => {
    expect(normalizePostText('  Hello   World  ')).toBe('hello world');
  });

  it('returns raw text for spinnable templates', () => {
    expect(dedupeKey({ text: '{Hi|Hello}', hasSpinnableText: true })).toBe('{Hi|Hello}');
  });
});
