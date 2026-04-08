import { describe, it } from 'vitest';

describe('TweetComposer', () => {
  describe('character counting', () => {
    it.todo('shows character count ring with correct remaining count');
    it.todo('ring is green under 260 characters');
    it.todo('ring turns yellow between 261-280 characters');
    it.todo('ring turns red when over 280 characters');
    it.todo('uses twitter-text parseTweet for weighted counting');
    it.todo('counts per-segment in thread mode, not full concatenated text');
  });

  describe('thread mode', () => {
    it.todo('toggle switches between single and thread mode');
    it.todo('each thread card has its own character counter');
    it.todo('cards can be reordered via drag-and-drop');
    it.todo('add tweet button creates new card');
    it.todo('remove button deletes card (when more than 1)');
    it.todo('thread text joins with [[tweet]] separator for storage');
    it.todo('only parses [[tweet]] separator when isThread flag is true');
  });
});
