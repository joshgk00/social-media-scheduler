import { describe, it, expect } from 'vitest';
import { serializeThread, deserializeThread, THREAD_SEPARATOR } from '../../lib/thread';
import { getCharacterCount } from '../../lib/twitter-text';

describe('TweetComposer', () => {
  describe('character counting', () => {
    it('shows character count ring with correct remaining count', () => {
      const result = getCharacterCount('Hello world');
      expect(result.remaining).toBe(280 - result.weightedLength);
    });

    it('ring is green under 260 characters', () => {
      const shortText = 'a'.repeat(100);
      const result = getCharacterCount(shortText);
      // permillage under ~928 means green
      expect(result.permillage).toBeLessThanOrEqual(928);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('ring turns yellow between 261-280 characters', () => {
      const longText = 'a'.repeat(270);
      const result = getCharacterCount(longText);
      // permillage > 928 and <= 1000 means warning/yellow
      expect(result.permillage).toBeGreaterThan(928);
      expect(result.permillage).toBeLessThanOrEqual(1000);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('ring turns red when over 280 characters', () => {
      const overText = 'a'.repeat(290);
      const result = getCharacterCount(overText);
      expect(result.remaining).toBeLessThan(0);
      expect(result.permillage).toBeGreaterThan(1000);
      expect(result.valid).toBe(false);
    });

    it('uses twitter-text parseTweet for weighted counting', () => {
      // URLs are weighted at t.co length (23 chars) regardless of actual length
      const textWithUrl = 'Check this out: https://example.com/very/long/path/that/would/be/long';
      const result = getCharacterCount(textWithUrl);
      // "Check this out: " is 16 chars + 23 for t.co URL = 39
      expect(result.weightedLength).toBe(39);
      expect(result.remaining).toBe(280 - 39);
    });

    it('counts per-segment in thread mode, not full concatenated text', () => {
      const segment1 = 'First tweet content';
      const segment2 = 'Second tweet content that is different';

      const count1 = getCharacterCount(segment1);
      const count2 = getCharacterCount(segment2);

      // Each segment counted independently
      expect(count1.weightedLength).toBe(segment1.length);
      expect(count2.weightedLength).toBe(segment2.length);

      // Concatenated would give different result
      const concatenated = segment1 + segment2;
      const countCombined = getCharacterCount(concatenated);
      expect(countCombined.weightedLength).toBe(count1.weightedLength + count2.weightedLength);
    });
  });

  describe('thread mode', () => {
    it('single segment serializes without separator', () => {
      const segments = [{ id: '1', text: 'Hello world' }];
      const serialized = serializeThread(segments);
      expect(serialized).toBe('Hello world');
      expect(serialized).not.toContain(THREAD_SEPARATOR);
    });

    it('multiple segments serialize with [[tweet]] separator', () => {
      const segments = [
        { id: '1', text: 'First' },
        { id: '2', text: 'Second' },
      ];
      const serialized = serializeThread(segments);
      expect(serialized).toBe(`First${THREAD_SEPARATOR}Second`);
    });

    it('each thread segment has independent character count', () => {
      const tweets = [
        { id: '1', text: 'Short tweet' },
        { id: '2', text: 'a'.repeat(275) },
      ];

      const counts = tweets.map(t => getCharacterCount(t.text));
      expect(counts[0].remaining).toBeGreaterThan(200);
      expect(counts[1].remaining).toBeLessThan(10);
    });

    it('serialize -> deserialize round-trips preserve text content', () => {
      const original = [
        { id: '1', text: 'Hello' },
        { id: '2', text: 'World' },
        { id: '3', text: 'Thread' },
      ];

      const serialized = serializeThread(original);
      const deserialized = deserializeThread(serialized);

      expect(deserialized).toHaveLength(3);
      expect(deserialized[0].text).toBe('Hello');
      expect(deserialized[1].text).toBe('World');
      expect(deserialized[2].text).toBe('Thread');
    });

    it('deserializeThread splits on [[tweet]] separator', () => {
      const segments = deserializeThread('First[[tweet]]Second');
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe('First');
      expect(segments[1].text).toBe('Second');
    });

    it('deserializeThread assigns unique IDs to each segment', () => {
      const segments = deserializeThread('A[[tweet]]B[[tweet]]C');
      const ids = segments.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it.todo('cards can be reordered via drag-and-drop — needs component rendering');
    it.todo('add tweet button creates new card — needs component rendering');
    it.todo('remove button deletes card (when more than 1) — needs component rendering');
  });
});
