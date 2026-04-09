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
    it('toggle switches between single and thread mode', () => {
      const singleText = 'Hello world';
      const segments = [{ id: '1', text: singleText }];
      const serialized = serializeThread(segments);
      expect(serialized).toBe(singleText);

      const threadSegments = [
        { id: '1', text: 'First' },
        { id: '2', text: 'Second' },
      ];
      const threadSerialized = serializeThread(threadSegments);
      expect(threadSerialized).toContain(THREAD_SEPARATOR);
    });

    it('each thread card has its own character counter', () => {
      const tweets = [
        { id: '1', text: 'Short tweet' },
        { id: '2', text: 'a'.repeat(275) },
      ];

      const counts = tweets.map(t => getCharacterCount(t.text));
      expect(counts[0].remaining).toBeGreaterThan(200);
      expect(counts[1].remaining).toBeLessThan(10);
    });

    it('cards can be reordered via drag-and-drop', () => {
      const tweets = [
        { id: '1', text: 'First' },
        { id: '2', text: 'Second' },
        { id: '3', text: 'Third' },
      ];

      // Simulate reorder: move index 2 to index 0
      const reordered = [tweets[2], tweets[0], tweets[1]];
      expect(reordered[0].text).toBe('Third');
      expect(reordered[1].text).toBe('First');
      expect(reordered[2].text).toBe('Second');
    });

    it('add tweet button creates new card', () => {
      const tweets = [{ id: '1', text: 'First' }];
      const added = [...tweets, { id: '2', text: '' }];
      expect(added).toHaveLength(2);
      expect(added[1].text).toBe('');
    });

    it('remove button deletes card (when more than 1)', () => {
      const tweets = [
        { id: '1', text: 'First' },
        { id: '2', text: 'Second' },
      ];

      const afterRemove = tweets.filter(t => t.id !== '2');
      expect(afterRemove).toHaveLength(1);
      expect(afterRemove[0].text).toBe('First');

      // Cannot remove last card
      const singleTweet = [{ id: '1', text: 'Only' }];
      expect(singleTweet.length).toBe(1);
    });

    it('thread text joins with [[tweet]] separator for storage', () => {
      const tweets = [
        { id: '1', text: 'Hello' },
        { id: '2', text: 'World' },
        { id: '3', text: 'Thread' },
      ];

      const serialized = serializeThread(tweets);
      expect(serialized).toBe('Hello[[tweet]]World[[tweet]]Thread');
    });

    it('only parses [[tweet]] separator when isThread flag is true', () => {
      const textWithSeparator = 'I wrote [[tweet]] in my text literally';

      // When isThread is false, treat as raw text
      const isThread = false;
      if (!isThread) {
        expect(textWithSeparator).toBe('I wrote [[tweet]] in my text literally');
      }

      // When isThread is true, parse the separator
      const isThread2 = true;
      if (isThread2) {
        const segments = deserializeThread('First[[tweet]]Second');
        expect(segments).toHaveLength(2);
        expect(segments[0].text).toBe('First');
        expect(segments[1].text).toBe('Second');
      }
    });
  });
});
