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

vi.mock('@sms/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sms/shared')>();
  return {
    ...actual,
    NON_INTERACTIVE_STATES: ['publishing', 'auto_destructing', 'destroyed'],
  };
});

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
    it.todo('stores single tweet text directly — needs tweet text parsing service function');
    it.todo('stores thread text with [[tweet]] separators — needs tweet text parsing service function');
    it.todo('only parses [[tweet]] separators when isThread is true — needs tweet text parsing service function');
    it.todo('validates tweet text is non-empty — needs tweet text validation service function');
  });

  describe('media attachment', () => {
    it.todo('accepts up to 4 images per tweet — needs media validation service function');
    it.todo('accepts 1 animated GIF per tweet — needs media validation service function');
    it.todo('accepts 1 video per tweet — needs media validation service function');
    it.todo('attaches media to first tweet only in threads — needs media validation service function');
  });
});
