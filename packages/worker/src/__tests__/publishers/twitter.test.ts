import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishFailure, type PublishablePost } from '@sms/shared';
import type { Credentials, SafeProfile, TwitterCredentials } from '@sms/shared/tokens';
import { createFakeTwitterPublisher, createTwitterPublisher } from '../../publishers/twitter.js';
import {
  buildApiRequestError,
  buildApiResponseError,
  buildSuccessfulTweetResponse,
} from '../helpers/mock-twitter.js';

const twitterMocks = vi.hoisted(() => {
  const tweet = vi.fn();
  const TwitterApi = vi.fn(function TwitterApi() {
    return { v2: { tweet } };
  });
  return { tweet, TwitterApi };
});

vi.mock('@sms/shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

vi.mock('twitter-api-v2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('twitter-api-v2')>();
  return {
    ...actual,
    TwitterApi: twitterMocks.TwitterApi,
  };
});

const baseProfile: SafeProfile = {
  platform: 'twitter',
  platformAccountId: null,
  linkedinAccountType: 'person',
};

const twitterCredentials: TwitterCredentials = {
  kind: 'twitter',
  consumerKey: 'test-consumer-key',
  consumerSecret: 'test-consumer-secret',
  accessToken: 'test-access-token',
  accessTokenSecret: 'test-access-token-secret',
};

const basePost: PublishablePost = {
  text: 'hello from publisher',
  platform: 'twitter',
  isThread: false,
  visibility: null,
  linkUrl: null,
  media: [],
};

async function capturePublishFailure(
  promise: Promise<unknown>,
): Promise<PublishFailure> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(PublishFailure);
    return err as PublishFailure;
  }
  throw new Error('Expected PublishFailure');
}

describe('createTwitterPublisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    twitterMocks.tweet.mockResolvedValue(buildSuccessfulTweetResponse('tw_123'));
  });

  it('publishes a single tweet and returns the platform post id', async () => {
    const publisher = createTwitterPublisher();

    const result = await publisher.publish(
      baseProfile,
      twitterCredentials,
      basePost,
      { correlationId: 'corr-1' },
    );

    expect(result).toEqual({ platformPostId: 'tw_123' });
    expect(twitterMocks.TwitterApi).toHaveBeenCalledWith({
      appKey: 'test-consumer-key',
      appSecret: 'test-consumer-secret',
      accessToken: 'test-access-token',
      accessSecret: 'test-access-token-secret',
    });
    expect(twitterMocks.tweet).toHaveBeenCalledWith({ text: basePost.text });
  });

  it('throws a permanent PublishFailure for non-retryable Twitter errors', async () => {
    twitterMocks.tweet.mockRejectedValueOnce(
      buildApiResponseError({ httpStatus: 401, detail: 'auth revoked' }),
    );
    const publisher = createTwitterPublisher();

    const failure = await capturePublishFailure(
      publisher.publish(baseProfile, twitterCredentials, basePost, { correlationId: 'corr-2' }),
    );

    expect(failure.kind).toBe('permanent');
    expect(failure.errorCode).toBe('auth_revoked');
    expect(failure.httpStatus).toBe(401);
  });

  it('throws a transient PublishFailure for retryable Twitter errors', async () => {
    twitterMocks.tweet.mockRejectedValueOnce(buildApiRequestError('ECONNRESET'));
    const publisher = createTwitterPublisher();

    const failure = await capturePublishFailure(
      publisher.publish(baseProfile, twitterCredentials, basePost, { correlationId: 'corr-3' }),
    );

    expect(failure.kind).toBe('transient');
    expect(failure.errorCode).toBe('ECONNRESET');
  });

  it('throws a permanent credential_error when credentials are for another platform', async () => {
    const publisher = createTwitterPublisher();
    const credentials: Credentials = { kind: 'oauth2', accessToken: 'not-twitter' };

    const failure = await capturePublishFailure(
      publisher.publish(baseProfile, credentials, basePost, { correlationId: 'corr-cred' }),
    );

    expect(failure.kind).toBe('permanent');
    expect(failure.errorCode).toBe('credential_error');
    expect(twitterMocks.TwitterApi).not.toHaveBeenCalled();
    expect(twitterMocks.tweet).not.toHaveBeenCalled();
  });

  it('redacts token-shaped substrings before messages escape the publisher', async () => {
    const token = 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEF';
    twitterMocks.tweet.mockRejectedValueOnce(
      buildApiResponseError({
        httpStatus: 400,
        detail: `request failed oauth_token=${token} access_token="${token}"`,
      }),
    );
    const publisher = createTwitterPublisher();

    const failure = await capturePublishFailure(
      publisher.publish(baseProfile, twitterCredentials, basePost, { correlationId: 'corr-4' }),
    );

    expect(failure.kind).toBe('permanent');
    expect(failure.message).not.toContain(token);
    expect(failure.message).toContain('[redacted]');
  });

  it('throws thread_unsupported when called directly with a thread post', async () => {
    const publisher = createTwitterPublisher();

    const failure = await capturePublishFailure(
      publisher.publish(
        baseProfile,
        twitterCredentials,
        { ...basePost, isThread: true },
        { correlationId: 'corr-5' },
      ),
    );

    expect(failure.kind).toBe('permanent');
    expect(failure.errorCode).toBe('thread_unsupported');
    expect(twitterMocks.tweet).not.toHaveBeenCalled();
  });

  it('exposes a fake fixture for downstream publisher tests', async () => {
    const publisher = createFakeTwitterPublisher({
      result: { platformPostId: 'tw_fake_result' },
    });

    await expect(
      publisher.publish(baseProfile, twitterCredentials, basePost, { correlationId: 'corr-6' }),
    ).resolves.toEqual({ platformPostId: 'tw_fake_result' });
  });
});
