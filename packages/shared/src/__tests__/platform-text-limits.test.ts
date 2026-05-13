// Wave 0 RED stubs for POST-LI-04 / POST-FB-05 char counting.
// Imports yet-to-exist symbols from `../lib/platform-text-limits.js`. Plan 02
// drives these GREEN by shipping the module.

import { describe, it, expect } from 'vitest';
import {
  countCodePoints,
  PLATFORM_TEXT_LIMITS,
  PLATFORM_COMPOSER_CHAR_LIMIT,
  getComposerCharLimit,
} from '../lib/platform-text-limits.js';

describe('countCodePoints', () => {
  it('counts ASCII characters by code point', () => {
    expect(countCodePoints('hello')).toBe(5);
  });

  it('counts ZWJ-joined emoji clusters by code point (5 code points for the family ZWJ sequence)', () => {
    // Family emoji = 5 code points (3 people + 2 ZWJ joiners), NOT 1 grapheme.
    expect(countCodePoints('\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}')).toBe(5);
  });

  it('handles strings at exactly the linkedin limit', () => {
    expect(countCodePoints('a'.repeat(3000))).toBe(3000);
  });

  it('handles strings one over the linkedin limit', () => {
    expect(countCodePoints('a'.repeat(3001))).toBe(3001);
  });
});

describe('PLATFORM_TEXT_LIMITS', () => {
  it('exports linkedin = 3000', () => {
    expect(PLATFORM_TEXT_LIMITS.linkedin).toBe(3000);
  });

  it('exports facebook = 63206', () => {
    expect(PLATFORM_TEXT_LIMITS.facebook).toBe(63206);
  });

  it('exports twitter = 25000', () => {
    expect(PLATFORM_TEXT_LIMITS.twitter).toBe(25000);
  });
});

describe('PLATFORM_COMPOSER_CHAR_LIMIT (issue #33)', () => {
  it('twitter composer counter caps at 280 (per-tweet, distinct from the thread combined max)', () => {
    expect(PLATFORM_COMPOSER_CHAR_LIMIT.twitter).toBe(280);
  });

  it('linkedin composer counter caps at 3000', () => {
    expect(PLATFORM_COMPOSER_CHAR_LIMIT.linkedin).toBe(3000);
  });

  it('facebook composer counter caps at 63206', () => {
    expect(PLATFORM_COMPOSER_CHAR_LIMIT.facebook).toBe(63206);
  });

  it('linkedin composer limit tracks PLATFORM_TEXT_LIMITS.linkedin', () => {
    expect(PLATFORM_COMPOSER_CHAR_LIMIT.linkedin).toBe(PLATFORM_TEXT_LIMITS.linkedin);
  });

  it('facebook composer limit tracks PLATFORM_TEXT_LIMITS.facebook', () => {
    expect(PLATFORM_COMPOSER_CHAR_LIMIT.facebook).toBe(PLATFORM_TEXT_LIMITS.facebook);
  });
});

describe('getComposerCharLimit', () => {
  it('returns 280 for twitter', () => {
    expect(getComposerCharLimit('twitter')).toBe(280);
  });

  it('returns 3000 for linkedin', () => {
    expect(getComposerCharLimit('linkedin')).toBe(3000);
  });

  it('returns 63206 for facebook', () => {
    expect(getComposerCharLimit('facebook')).toBe(63206);
  });
});
