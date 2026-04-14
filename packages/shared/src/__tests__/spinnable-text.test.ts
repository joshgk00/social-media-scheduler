import { describe, it, expect } from 'vitest';
import {
  resolveSpinnableText,
  extractVariants,
  countTotalVariants,
} from '../lib/spinnable-text.js';

describe('Spinnable Text Parser', () => {
  describe('resolveSpinnableText', () => {
    it('returns original text when no spin syntax is present', () => {
      expect(resolveSpinnableText('no spin here')).toBe('no spin here');
    });

    it('returns a valid option from a single spin group', () => {
      const validOptions = ['hello', 'world'];
      const resolved = resolveSpinnableText('{hello|world}');
      expect(validOptions).toContain(resolved);
    });

    it('resolves multiple spin groups independently', () => {
      const resolved = resolveSpinnableText('{a|b} and {c|d}');
      const parts = resolved.split(' and ');
      expect(['a', 'b']).toContain(parts[0]);
      expect(['c', 'd']).toContain(parts[1]);
    });

    it('resolves a group with three options', () => {
      const validOptions = ['x', 'y', 'z'];
      const resolved = resolveSpinnableText('{x|y|z}');
      expect(validOptions).toContain(resolved);
    });

    it('handles single-option group by returning that option', () => {
      expect(resolveSpinnableText('{only}')).toBe('only');
    });

    it('handles empty options in a group', () => {
      const validOptions = ['', ''];
      const resolved = resolveSpinnableText('{|}');
      expect(validOptions).toContain(resolved);
    });

    it('preserves surrounding text around spin groups', () => {
      const resolved = resolveSpinnableText('Hello {world|earth}!');
      expect(['Hello world!', 'Hello earth!']).toContain(resolved);
    });

    it('returns empty string when given empty input', () => {
      expect(resolveSpinnableText('')).toBe('');
    });
  });

  describe('extractVariants', () => {
    it('returns empty array when no spin syntax is present', () => {
      expect(extractVariants('no spin')).toEqual([]);
    });

    it('extracts a single spin group', () => {
      expect(extractVariants('{a|b|c}')).toEqual([['a', 'b', 'c']]);
    });

    it('extracts multiple spin groups', () => {
      expect(extractVariants('{a|b} and {c|d|e}')).toEqual([
        ['a', 'b'],
        ['c', 'd', 'e'],
      ]);
    });

    it('extracts single-option group', () => {
      expect(extractVariants('{only}')).toEqual([['only']]);
    });

    it('extracts groups with empty options', () => {
      expect(extractVariants('{|}')).toEqual([['', '']]);
    });
  });

  describe('countTotalVariants', () => {
    it('returns 1 when no spin syntax is present', () => {
      expect(countTotalVariants('no spin')).toBe(1);
    });

    it('counts variants from a single group', () => {
      expect(countTotalVariants('{a|b|c}')).toBe(3);
    });

    it('returns product of multiple groups', () => {
      expect(countTotalVariants('{a|b} and {c|d|e}')).toBe(6);
    });

    it('counts single-option group as 1', () => {
      expect(countTotalVariants('{only}')).toBe(1);
    });

    it('counts empty options in a group', () => {
      expect(countTotalVariants('{|}')).toBe(2);
    });

    it('handles complex text with many groups', () => {
      expect(countTotalVariants('{a|b} {c|d} {e|f|g}')).toBe(12);
    });
  });
});
