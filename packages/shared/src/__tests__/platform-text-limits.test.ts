// Wave 0 RED stubs for POST-LI-04 / POST-FB-05 char counting.
// Imports yet-to-exist symbols from `../lib/platform-text-limits.js`. Plan 02
// drives these GREEN by shipping the module.

import { describe, it, expect } from 'vitest';
import { countCodePoints, PLATFORM_TEXT_LIMITS } from '../lib/platform-text-limits.js';

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
