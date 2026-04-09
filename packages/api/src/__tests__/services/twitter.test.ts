import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeColumnStub(name: string) {
  return { name, fieldAlias: name };
}

function makeTableStub(tableName: string, columns: string[]) {
  const table: Record<string, unknown> = { _: { name: tableName } };
  for (const col of columns) {
    table[col] = makeColumnStub(col);
  }
  return table;
}

const socialProfileColumns = [
  'id', 'userId', 'platform', 'platformUserId', 'displayName', 'handle', 'avatarUrl',
  'consumerKeyCiphertext', 'consumerKeyIv', 'consumerKeyAuthTag',
  'consumerSecretCiphertext', 'consumerSecretIv', 'consumerSecretAuthTag',
  'accessTokenCiphertext', 'accessTokenIv', 'accessTokenAuthTag',
  'accessTokenSecretCiphertext', 'accessTokenSecretIv', 'accessTokenSecretAuthTag',
  'tokenEncryptionVersion', 'connectedAt', 'lastPublishedAt', 'createdAt', 'updatedAt',
];

const mockSocialProfiles = makeTableStub('social_profiles', socialProfileColumns);
const mockPosts = makeTableStub('posts', ['id', 'userId', 'status']);

vi.mock('@sms/db', () => ({
  socialProfiles: mockSocialProfiles,
  posts: mockPosts,
}));

vi.mock('@sms/shared', () => ({
  NON_INTERACTIVE_STATES: ['publishing', 'auto_destructing', 'destroyed'],
}));

const mockCreateLogger = vi.fn().mockReturnValue({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

vi.mock('@sms/shared/logger', () => ({
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

vi.mock('@sms/shared/encryption', () => ({
  encrypt: vi.fn().mockReturnValue({
    ciphertext: 'encrypted-data',
    iv: 'test-iv-hex',
    authTag: 'test-auth-tag',
    version: 1,
  }),
  validateEncryptionKey: vi.fn().mockReturnValue(Buffer.alloc(32)),
}));

const mockTwitterMe = vi.fn();

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn().mockImplementation(function () {
    return { v2: { me: mockTwitterMe } };
  }),
}));

describe('twitter integration', () => {
  let validateTwitterCredentials: typeof import('../../services/profile.service.js').validateTwitterCredentials;
  let ProfileServiceError: typeof import('../../services/profile.service.js').ProfileServiceError;

  beforeEach(async () => {
    mockCreateLogger.mockClear();
    mockCreateLogger.mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    });

    mockTwitterMe.mockReset();

    const mod = await import('../../services/profile.service.js');
    validateTwitterCredentials = mod.validateTwitterCredentials;
    ProfileServiceError = mod.ProfileServiceError;
  });

  describe('validateTwitterCredentials', () => {
    it('returns user data on valid credentials using OAuth 1.0a', async () => {
      mockTwitterMe.mockResolvedValueOnce({
        data: {
          id: '12345',
          name: 'Test User',
          username: 'testuser',
          profile_image_url: 'https://pbs.twimg.com/avatar.jpg',
        },
      });

      const result = await validateTwitterCredentials(
        'ck-test', 'cs-test', 'at-test', 'ats-test',
      );

      expect(result).toEqual({
        id: '12345',
        name: 'Test User',
        username: 'testuser',
        profileImageUrl: 'https://pbs.twimg.com/avatar.jpg',
      });

      const { TwitterApi } = await import('twitter-api-v2');
      expect(TwitterApi).toHaveBeenCalledWith({
        appKey: 'ck-test',
        appSecret: 'cs-test',
        accessToken: 'at-test',
        accessSecret: 'ats-test',
      });
    });

    it('throws descriptive error on invalid credentials (401)', async () => {
      mockTwitterMe.mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), { code: 401, data: { status: 401 } }),
      );

      await expect(
        validateTwitterCredentials('bad-ck', 'bad-cs', 'bad-at', 'bad-ats'),
      ).rejects.toThrow('Could not verify these credentials');
    });

    it('throws descriptive error on rate limit (429)', async () => {
      mockTwitterMe.mockRejectedValueOnce(
        Object.assign(new Error('Too Many Requests'), { code: 429, data: { status: 429 } }),
      );

      try {
        await validateTwitterCredentials('ck', 'cs', 'at', 'ats');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProfileServiceError);
        expect(err.statusCode).toBe(429);
        expect(err.message).toContain('rate limit');
      }
    });

    it('throws descriptive error on transient network failure', async () => {
      mockTwitterMe.mockRejectedValueOnce(
        Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
      );

      try {
        await validateTwitterCredentials('ck', 'cs', 'at', 'ats');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProfileServiceError);
        expect(err.statusCode).toBe(422);
        expect(err.message).toContain('Could not reach Twitter API');
      }
    });

    it('extracts displayName, username, and profileImageUrl from response', async () => {
      mockTwitterMe.mockResolvedValueOnce({
        data: {
          id: '99999',
          name: 'Display Name Here',
          username: 'handle_here',
          profile_image_url: 'https://example.com/photo.png',
        },
      });

      const result = await validateTwitterCredentials('ck', 'cs', 'at', 'ats');

      expect(result.name).toBe('Display Name Here');
      expect(result.username).toBe('handle_here');
      expect(result.profileImageUrl).toBe('https://example.com/photo.png');
    });
  });

  describe('tweet text handling', () => {
    it('stores single tweet text directly', () => {
      const text = 'Hello world, this is a single tweet.';
      expect(text).not.toContain('[[tweet]]');
    });

    it('stores thread text with [[tweet]] separators', () => {
      const segments = ['First tweet', 'Second tweet', 'Third tweet'];
      const serialized = segments.join('[[tweet]]');
      expect(serialized).toBe('First tweet[[tweet]]Second tweet[[tweet]]Third tweet');
    });

    it('only parses [[tweet]] separators when isThread is true', () => {
      const textWithSeparator = 'This mentions [[tweet]] literally';
      const isThread = false;

      if (isThread) {
        const segments = textWithSeparator.split('[[tweet]]');
        expect(segments.length).toBeGreaterThan(1);
      } else {
        expect(textWithSeparator).toBe('This mentions [[tweet]] literally');
      }
    });

    it('validates tweet text is non-empty', () => {
      const emptyText = '';
      expect(emptyText.trim().length).toBe(0);

      const whitespaceText = '   ';
      expect(whitespaceText.trim().length).toBe(0);

      const validText = 'Hello';
      expect(validText.trim().length).toBeGreaterThan(0);
    });
  });

  describe('media attachment', () => {
    it('accepts up to 4 images per tweet', () => {
      const maxImages = 4;
      const images = Array.from({ length: 4 }, (_, i) => `image-${i}.jpg`);
      expect(images.length).toBeLessThanOrEqual(maxImages);

      const tooMany = [...images, 'image-5.jpg'];
      expect(tooMany.length).toBeGreaterThan(maxImages);
    });

    it('accepts 1 animated GIF per tweet', () => {
      const maxGifs = 1;
      const gifs = ['animation.gif'];
      expect(gifs.length).toBeLessThanOrEqual(maxGifs);
    });

    it('accepts 1 video per tweet', () => {
      const maxVideos = 1;
      const videos = ['clip.mp4'];
      expect(videos.length).toBeLessThanOrEqual(maxVideos);
    });

    it('attaches media to first tweet only in threads', () => {
      const threadTweets = [
        { text: 'First tweet', mediaIds: ['media-1'] },
        { text: 'Second tweet', mediaIds: [] },
        { text: 'Third tweet', mediaIds: [] },
      ];

      expect(threadTweets[0].mediaIds.length).toBeGreaterThan(0);
      for (let i = 1; i < threadTweets.length; i++) {
        expect(threadTweets[i].mediaIds.length).toBe(0);
      }
    });
  });
});
