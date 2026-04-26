// Wave 0 RED stubs for the createPostSchema discriminated union.
// Plan 02 upgrades the current single-shape schema in `../schemas/posts.ts`
// into a `z.discriminatedUnion('platform', [...])` with `.strict()` per
// variant — that drives these tests GREEN.

import { describe, it, expect } from 'vitest';
import { createPostSchema } from '../schemas/posts.js';

const VALID_UUID = '00000000-0000-4000-8000-000000000001';

describe('createPostSchema discriminated union', () => {
  it('rejects linkedin payload over 3000 chars (POST-LI-04, T-API-01)', () => {
    const result = createPostSchema.safeParse({
      platform: 'linkedin',
      profileId: VALID_UUID,
      text: 'a'.repeat(3001),
      visibility: 'PUBLIC',
    });
    expect(result.success).toBe(false);
  });

  it('rejects facebook payload over 63206 chars (POST-FB-05, T-API-01)', () => {
    const result = createPostSchema.safeParse({
      platform: 'facebook',
      profileId: VALID_UUID,
      text: 'a'.repeat(63207),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid linkedin payload', () => {
    const result = createPostSchema.safeParse({
      platform: 'linkedin',
      profileId: VALID_UUID,
      text: 'hello',
      visibility: 'PUBLIC',
    });
    expect(result.success).toBe(true);
  });

  it('rejects linkedin payload carrying a facebook-only field linkUrl (T-API-03)', () => {
    const result = createPostSchema.safeParse({
      platform: 'linkedin',
      profileId: VALID_UUID,
      text: 'hello',
      linkUrl: 'https://example.com',
    });
    // .strict() on each variant disallows extra keys.
    expect(result.success).toBe(false);
  });

  it('rejects facebook payload carrying a linkedin-only field visibility (T-API-03)', () => {
    const result = createPostSchema.safeParse({
      platform: 'facebook',
      profileId: VALID_UUID,
      text: 'hello',
      visibility: 'PUBLIC',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty linkedin payload (no text, no media)', () => {
    const result = createPostSchema.safeParse({
      platform: 'linkedin',
      profileId: VALID_UUID,
      text: '',
      mediaIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty facebook payload (no text, no media, no link)', () => {
    const result = createPostSchema.safeParse({
      platform: 'facebook',
      profileId: VALID_UUID,
      text: '',
      mediaIds: [],
      linkUrl: null,
    });
    expect(result.success).toBe(false);
  });
});
