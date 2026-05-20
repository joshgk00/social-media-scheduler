import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishFailure, type PublishablePost } from '@sms/shared';
import { createFacebookPublisher, createFakeFacebookPublisher } from '../../publishers/facebook.js';

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

vi.mock('@sms/shared/encryption', () => ({
  decrypt: vi.fn().mockReturnValue('test-page-access-token'),
  validateEncryptionKey: vi.fn().mockReturnValue(Buffer.alloc(32)),
}));

const baseProfile = {
  id: '00000000-0000-4000-8000-000000000020',
  platform: 'facebook',
  platformAccountId: '123456789',
  oauth2AccessTokenCiphertext: 'enc-cipher',
  oauth2AccessTokenIv: 'iv-bytes-12345678',
  oauth2AccessTokenAuthTag: 'auth-tag-bytes-1',
};

const basePost: PublishablePost = {
  text: 'hello facebook',
  platform: 'facebook',
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

describe('createFacebookPublisher', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.ENCRYPTION_KEY;
  });

  it('publishes a multi-photo post through unpublished photos and feed', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'photo_1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'photo_2' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '123_777' }), { status: 200 }));

    const publisher = createFacebookPublisher();
    const result = await publisher.publish(
      baseProfile as never,
      {
        ...basePost,
        media: [
          {
            id: 'media-1',
            kind: 'image',
            bytes: Buffer.from('img1'),
            mimeType: 'image/jpeg',
          },
          {
            id: 'media-2',
            kind: 'image',
            bytes: Buffer.from('img2'),
            mimeType: 'image/jpeg',
          },
        ],
      },
      { correlationId: 'corr-fb-1' },
    );

    expect(result).toEqual({ platformPostId: '123_777' });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/photos');
    expect(String(fetchSpy.mock.calls[1][0])).toContain('/photos');
    expect(String(fetchSpy.mock.calls[2][0])).toContain('/feed');
    expect(String((fetchSpy.mock.calls[2][1] as RequestInit).body)).toContain(
      'attached_media%5B0%5D',
    );
  });

  it('publishes video media through /videos', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '123_video_1' }), { status: 200 }),
    );

    const publisher = createFacebookPublisher();
    const result = await publisher.publish(
      baseProfile as never,
      {
        ...basePost,
        media: [
          {
            id: 'video-1',
            kind: 'video',
            bytes: Buffer.from('mp4-bytes'),
            mimeType: 'video/mp4',
          },
        ],
      },
      { correlationId: 'corr-fb-2' },
    );

    expect(result).toEqual({ platformPostId: '123_video_1' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/123456789/videos');
  });

  it('throws a permanent PublishFailure for non-retryable Facebook responses', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    const publisher = createFacebookPublisher();

    const failure = await capturePublishFailure(
      publisher.publish(baseProfile as never, basePost, { correlationId: 'corr-fb-3' }),
    );

    expect(failure.kind).toBe('permanent');
    expect(failure.errorCode).toBe('auth_revoked');
    expect(failure.httpStatus).toBe(401);
  });

  it('throws a transient PublishFailure for Facebook rate limit errors', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 4, message: 'too many calls' } }), {
        status: 400,
      }),
    );
    const publisher = createFacebookPublisher();

    const failure = await capturePublishFailure(
      publisher.publish(baseProfile as never, basePost, { correlationId: 'corr-fb-4' }),
    );

    expect(failure.kind).toBe('transient');
    expect(failure.errorCode).toBe('fb_code_4');
    expect(failure.httpStatus).toBe(400);
  });

  it('redacts token-shaped substrings before messages escape the publisher', async () => {
    const token = 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEF';
    fetchSpy.mockResolvedValueOnce(
      new Response(`request failed access_token=${token}`, { status: 400 }),
    );
    const publisher = createFacebookPublisher();

    const failure = await capturePublishFailure(
      publisher.publish(baseProfile as never, basePost, { correlationId: 'corr-fb-5' }),
    );

    expect(failure.kind).toBe('permanent');
    expect(failure.message).not.toContain(token);
    expect(failure.message).toContain('[redacted]');
  });

  it('drops orphaned photo ids at the Publisher boundary', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'photo_1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('upload failed', { status: 500 }));

    const publisher = createFacebookPublisher();
    const failure = await capturePublishFailure(
      publisher.publish(
        baseProfile as never,
        {
          ...basePost,
          media: [
            {
              id: 'media-1',
              kind: 'image',
              bytes: Buffer.from('img1'),
              mimeType: 'image/jpeg',
            },
            {
              id: 'media-2',
              kind: 'image',
              bytes: Buffer.from('img2'),
              mimeType: 'image/jpeg',
            },
          ],
        },
        { correlationId: 'corr-fb-6' },
      ),
    );

    expect(failure.kind).toBe('transient');
    expect(failure).not.toHaveProperty('orphanedPhotoIds');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('exposes a fake fixture for downstream publisher tests', async () => {
    const publisher = createFakeFacebookPublisher({
      result: { platformPostId: 'fb_fake_result' },
    });

    await expect(
      publisher.publish(baseProfile as never, basePost, { correlationId: 'corr-fb-7' }),
    ).resolves.toEqual({ platformPostId: 'fb_fake_result' });
  });
});
