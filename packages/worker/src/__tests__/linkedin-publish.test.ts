// Wave 0 RED stubs for the LinkedIn publish service.
// POST-LI-01 (text-only post), POST-LI-02 (image upload + reference),
// T-WORKER-01 (no /posts on PUT failure — partial-state rollback),
// T-WORKER-03 (no token in logs).
//
// Plan 04 ships `callLinkedIn` in `../linkedin-publish.service.js`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callLinkedIn } from '../linkedin-publish.service.js';

const baseProfile = {
  id: '00000000-0000-4000-8000-000000000010',
  platform: 'linkedin' as const,
  platformAccountId: 'urn:li:person:abc',
  linkedinAccountType: 'person' as const,
  oauth2AccessTokenCiphertext: Buffer.from('enc-cipher-bytes'),
  oauth2AccessTokenIv: Buffer.from('iv-bytes-12345678'),
  oauth2AccessTokenAuthTag: Buffer.from('auth-tag-bytes-1'),
  tokenEncryptionVersion: 1,
};

describe('callLinkedIn', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.ENCRYPTION_KEY;
  });

  it('text-only post: issues single POST /rest/posts and returns x-restli-id (POST-LI-01)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:share:7000000000000000000' },
      }),
    );

    const result = await callLinkedIn({
      profile: baseProfile as any,
      postText: 'hello',
      visibility: 'PUBLIC',
      correlationId: 'corr-1',
    });

    expect(result.platformPostId).toBe('urn:li:share:7000000000000000000');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0];
    expect(String(callArgs[0])).toContain('/rest/posts');
    const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
    expect(headers['LinkedIn-Version']).toBe('202604');
    expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0');
  });

  it('image post: performs initializeUpload + PUT + /posts (POST-LI-02, T-WORKER-01)', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: {
              uploadUrl: 'https://upload.example/abc',
              image: 'urn:li:image:xyz',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 201 })) // PUT
      .mockResolvedValueOnce(
        new Response(null, {
          status: 201,
          headers: { 'x-restli-id': 'urn:li:share:7000000000000000001' },
        }),
      );

    const result = await callLinkedIn({
      profile: baseProfile as any,
      postText: 'hello with image',
      visibility: 'PUBLIC',
      imageBytes: Buffer.from('fake-jpeg-bytes'),
      correlationId: 'corr-2',
    });

    expect(result.platformPostId).toBe('urn:li:share:7000000000000000001');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('PUT failure aborts before /posts (T-WORKER-01 partial-state rollback)', async () => {
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
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 })); // PUT fails

    await expect(
      callLinkedIn({
        profile: baseProfile as any,
        postText: 'x',
        visibility: 'PUBLIC',
        imageBytes: Buffer.from('bytes'),
        correlationId: 'corr-3',
      }),
    ).rejects.toThrow();

    // The third call (POST /rest/posts) must NOT have been made.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('uses person URN for linkedinAccountType=person', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:share:1' },
      }),
    );

    await callLinkedIn({
      profile: baseProfile as any,
      postText: 't',
      visibility: 'PUBLIC',
      correlationId: 'corr-4',
    });

    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body.author).toBe('urn:li:person:abc');
  });

  it('uses organization URN for linkedinAccountType=organization (Pitfall 9)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:share:2' },
      }),
    );

    const orgProfile = {
      ...baseProfile,
      linkedinAccountType: 'organization' as const,
      platformAccountId: 'urn:li:organization:99',
    };

    await callLinkedIn({
      profile: orgProfile as any,
      postText: 't',
      visibility: 'PUBLIC',
      correlationId: 'corr-5',
    });

    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body.author).toBe('urn:li:organization:99');
  });

  it('does not log the access token in any logger call (T-WORKER-03)', async () => {
    // Wave 0 sentinel — Plan 04 strengthens this with a captured logger spy
    // and verifies pino bindings exclude any header that includes "Bearer".
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:share:3' },
      }),
    );

    const result = await callLinkedIn({
      profile: baseProfile as any,
      postText: 't',
      visibility: 'PUBLIC',
      correlationId: 'corr-6',
    });

    // The contract: the call returns the platform id but never serializes
    // the bearer token through the structured logger. Plan 04 wires the
    // assertion against a captured pino destination.
    expect(result.platformPostId).toBe('urn:li:share:3');
  });
});
