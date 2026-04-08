import { describe, it } from 'vitest';

describe('twitter integration', () => {
  describe('validateTwitterCredentials', () => {
    it.todo('returns user data on valid credentials using OAuth 1.0a');
    it.todo('throws descriptive error on invalid credentials (401)');
    it.todo('throws descriptive error on rate limit (429)');
    it.todo('throws descriptive error on transient network failure');
    it.todo('extracts displayName, username, and profileImageUrl from response');
  });

  describe('tweet text handling', () => {
    it.todo('stores single tweet text directly');
    it.todo('stores thread text with [[tweet]] separators');
    it.todo('only parses [[tweet]] separators when isThread is true');
    it.todo('validates tweet text is non-empty');
  });

  describe('media attachment', () => {
    it.todo('accepts up to 4 images per tweet');
    it.todo('accepts 1 animated GIF per tweet');
    it.todo('accepts 1 video per tweet');
    it.todo('attaches media to first tweet only in threads');
  });
});
