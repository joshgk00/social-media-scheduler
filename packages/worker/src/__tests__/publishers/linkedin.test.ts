import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishFailure, type PublishablePost } from '@sms/shared';
import type { OAuth2Credentials, SafeProfile } from '@sms/shared/tokens';
import { createFakeLinkedInPublisher, createLinkedInPublisher } from '../../publishers/linkedin.js';

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

const baseProfile: SafeProfile = {
  platform: 'linkedin',
  platformAccountId: 'urn:li:person:abc',
  linkedinAccountType: 'person',
};

const oauth2Credentials: OAuth2Credentials = {
  kind: 'oauth2',
  accessToken: 'test-bearer-token',
};

const basePost: PublishablePost = {
  text: 'hello linkedin',
  platform: 'linkedin',
  isThread: false,
  visibility: 'PUBLIC',
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

describe('createLinkedInPublisher', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('publishes an image post with initializeUpload, PUT, and /posts', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: {
              uploadUrl: 'https://upload.example/abc',
              image: 'urn:li:image:xyz',
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 201,
          headers: { 'x-restli-id': 'urn:li:share:7000000000000000001' },
        }),
      );

    const publisher = createLinkedInPublisher();
    const result = await publisher.publish(
      baseProfile,
      oauth2Credentials,
      {
        ...basePost,
        media: [
          {
            id: 'media-1',
            kind: 'image',
            bytes: Buffer.from('fake-jpeg-bytes'),
            mimeType: 'image/jpeg',
          },
        ],
      },
      { correlationId: 'corr-li-1' },
    );

    expect(result).toEqual({ platformPostId: 'urn:li:share:7000000000000000001' });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/images?action=initializeUpload');
    expect(String(fetchSpy.mock.calls[1][0])).toBe('https://upload.example/abc');
    expect(String(fetchSpy.mock.calls[2][0])).toContain('/posts');
  });

  it('throws a permanent PublishFailure for non-retryable LinkedIn responses', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    const publisher = createLinkedInPublisher();

    const failure = await capturePublishFailure(
      publisher.publish(baseProfile, oauth2Credentials, basePost, { correlationId: 'corr-li-2' }),
    );

    expect(failure.kind).toBe('permanent');
    expect(failure.errorCode).toBe('auth_revoked');
    expect(failure.httpStatus).toBe(401);
  });

  it('throws a transient PublishFailure for retryable LinkedIn responses', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('rate limit', { status: 429 }));
    const publisher = createLinkedInPublisher();

    const failure = await capturePublishFailure(
      publisher.publish(baseProfile, oauth2Credentials, basePost, { correlationId: 'corr-li-3' }),
    );

    expect(failure.kind).toBe('transient');
    expect(failure.errorCode).toBe('rate_limited');
    expect(failure.httpStatus).toBe(429);
  });

  it('redacts token-shaped substrings before messages escape the publisher', async () => {
    const token = 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEF';
    fetchSpy.mockResolvedValueOnce(
      new Response(`request failed access_token="${token}"`, { status: 400 }),
    );
    const publisher = createLinkedInPublisher();

    const failure = await capturePublishFailure(
      publisher.publish(baseProfile, oauth2Credentials, basePost, { correlationId: 'corr-li-4' }),
    );

    expect(failure.kind).toBe('permanent');
    expect(failure.message).not.toContain(token);
    expect(failure.message).toContain('[redacted]');
  });

  it('aborts before /posts when image PUT fails', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: {
              uploadUrl: 'https://upload.example/abc',
              image: 'urn:li:image:xyz',
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    const publisher = createLinkedInPublisher();
    await capturePublishFailure(
      publisher.publish(
        baseProfile,
        oauth2Credentials,
        {
          ...basePost,
          media: [
            {
              id: 'media-1',
              kind: 'image',
              bytes: Buffer.from('fake-jpeg-bytes'),
              mimeType: 'image/jpeg',
            },
          ],
        },
        { correlationId: 'corr-li-5' },
      ),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(
      fetchSpy.mock.calls.some((call: unknown[]) => String(call[0]).includes('/posts')),
    ).toBe(false);
  });

  it('exposes a fake fixture for downstream publisher tests', async () => {
    const publisher = createFakeLinkedInPublisher({
      result: { platformPostId: 'li_fake_result' },
    });

    await expect(
      publisher.publish(baseProfile, oauth2Credentials, basePost, { correlationId: 'corr-li-6' }),
    ).resolves.toEqual({ platformPostId: 'li_fake_result' });
  });
});
