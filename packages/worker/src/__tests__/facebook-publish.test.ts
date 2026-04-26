// Wave 0 RED stubs for the Facebook publish service.
// POST-FB-01 (text-only feed post), POST-FB-02 (multi-photo carousel),
// POST-FB-03 (video upload), POST-FB-04 (link parameter),
// T-WORKER-02 (multi-photo orphan handling — collected photoIds returned
// on partial failure), T-WORKER-03 (no token in logs).
//
// Plan 04 ships `callFacebook` in `../facebook-publish.service.js`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callFacebook } from '../facebook-publish.service.js';

const baseFacebookProfile = {
  id: '00000000-0000-4000-8000-000000000020',
  platform: 'facebook' as const,
  platformAccountId: '123456789',
  oauth2AccessTokenCiphertext: Buffer.from('enc-cipher'),
  oauth2AccessTokenIv: Buffer.from('iv-bytes-12345678'),
  oauth2AccessTokenAuthTag: Buffer.from('auth-tag-bytes-1'),
  tokenEncryptionVersion: 1,
};

describe('callFacebook', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.ENCRYPTION_KEY;
  });

  it('text-only post: POST /{pageId}/feed with message + access_token (POST-FB-01)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '123_999' }), { status: 200 }),
    );

    const result = await callFacebook({
      profile: baseFacebookProfile as any,
      postText: 'hello facebook',
      correlationId: 'corr-fb-1',
    });

    expect(result.platformPostId).toBe('123_999');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/123456789/feed');
  });

  it('linkUrl post: passes link parameter (POST-FB-04)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '123_888' }), { status: 200 }),
    );

    await callFacebook({
      profile: baseFacebookProfile as any,
      postText: 'check this',
      linkUrl: 'https://example.com/article',
      correlationId: 'corr-fb-2',
    });

    const callUrl = String(fetchSpy.mock.calls[0][0]);
    const callBody = String((fetchSpy.mock.calls[0][1] as RequestInit).body ?? '');
    const combined = `${callUrl}\n${callBody}`;
    expect(combined).toContain('https%3A%2F%2Fexample.com%2Farticle');
  });

  it('multi-photo: 3 photos = 3 unpublished POSTs + 1 feed POST with attached_media (POST-FB-02)', async () => {
    // Three /photos?published=false uploads + one /feed with attached_media[0..2].
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'photo_1' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'photo_2' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'photo_3' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: '123_777' }), { status: 200 }),
      );

    const result = await callFacebook({
      profile: baseFacebookProfile as any,
      postText: 'three pics',
      mediaItems: [
        { kind: 'image', bytes: Buffer.from('img1') },
        { kind: 'image', bytes: Buffer.from('img2') },
        { kind: 'image', bytes: Buffer.from('img3') },
      ],
      correlationId: 'corr-fb-3',
    });

    expect(result.platformPostId).toBe('123_777');
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    // First 3 calls hit /photos
    for (let i = 0; i < 3; i++) {
      expect(String(fetchSpy.mock.calls[i][0])).toContain('/photos');
    }
    // 4th call hits /feed
    expect(String(fetchSpy.mock.calls[3][0])).toContain('/feed');
  });

  it('video post: single POST /{pageId}/videos (POST-FB-03)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '123_video_1' }), { status: 200 }),
    );

    const result = await callFacebook({
      profile: baseFacebookProfile as any,
      postText: 'watch this',
      mediaItems: [{ kind: 'video', bytes: Buffer.from('mp4-bytes') }],
      correlationId: 'corr-fb-4',
    });

    expect(result.platformPostId).toBe('123_video_1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/123456789/videos');
  });

  it('multi-photo failure on photo 3 of 3: no feed POST, photoIds returned for cleanup (T-WORKER-02)', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'photo_1' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'photo_2' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('upload failed', { status: 500 }));

    await expect(
      callFacebook({
        profile: baseFacebookProfile as any,
        postText: 'three pics',
        mediaItems: [
          { kind: 'image', bytes: Buffer.from('img1') },
          { kind: 'image', bytes: Buffer.from('img2') },
          { kind: 'image', bytes: Buffer.from('img3') },
        ],
        correlationId: 'corr-fb-5',
      }),
    ).rejects.toMatchObject({
      // The error must carry the orphaned photo ids so the caller can clean up.
      orphanedPhotoIds: ['photo_1', 'photo_2'],
    });

    // No /feed call was made.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(
      fetchSpy.mock.calls.some((call) => String(call[0]).includes('/feed')),
    ).toBe(false);
  });

  it('does not log the page access token (T-WORKER-03)', async () => {
    // Wave 0 sentinel — Plan 04 wires a captured pino destination to assert
    // the bearer/access token never appears in any logger.info / .error
    // payload.
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '123_111' }), { status: 200 }),
    );

    const result = await callFacebook({
      profile: baseFacebookProfile as any,
      postText: 'hi',
      correlationId: 'corr-fb-6',
    });

    expect(result.platformPostId).toBe('123_111');
  });
});
