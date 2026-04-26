// Wave 0 RED stub for T-DATA-01 invariants. Closes the Plan 03 Task 2 Nyquist
// gap (checker B-04): the post.service.ts platform invariants need a failing
// test to drive GREEN.
//
// Invariant 1: createPost denormalizes platform from social_profiles onto
//   posts.platform — and rejects PLATFORM_MISMATCH if the payload's platform
//   disagrees with the profile's.
// Invariant 2: updatePost rejects platform changes on existing posts
//   (PLATFORM_IMMUTABLE) so a LinkedIn post can never become a Facebook one.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPost, updatePost, PostServiceError } from '../services/post.service.js';

const PROFILE_ID = '00000000-0000-4000-8000-00000000aaaa';
const POST_ID = '00000000-0000-4000-8000-00000000bbbb';
const USER_ID = '00000000-0000-4000-8000-00000000cccc';

// Lightweight mock db. Plan 03 Task 2's real implementation is the only
// consumer of this shape — we model just enough for the service factory to
// run select/insert/update in a deterministic order.
function buildPlatformMockDb(opts: {
  profile?: { id: string; userId: string; platform: string } | null;
  existingPost?: { id: string; profileId: string; platform: string; postVersion: number } | null;
}) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];

  const selectChain = (rows: unknown[]) => {
    const chain: any = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.leftJoin = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: (val: unknown) => void) => resolve(rows);
    return chain;
  };

  const insertChain = () => {
    const chain: any = {};
    chain.values = vi.fn().mockImplementation((row: Record<string, unknown>) => {
      inserted.push(row);
      const returningChain: any = {
        then: (resolve: (val: unknown) => void) =>
          resolve([{ ...row, id: row.id ?? POST_ID }]),
        returning: vi.fn().mockResolvedValue([{ ...row, id: row.id ?? POST_ID }]),
      };
      return returningChain;
    });
    return chain;
  };

  const updateChain = () => {
    const chain: any = {};
    let setPayload: Record<string, unknown> = {};
    chain.set = vi.fn().mockImplementation((patch: Record<string, unknown>) => {
      setPayload = patch;
      return chain;
    });
    chain.where = vi.fn().mockImplementation(() => {
      const result: any = Promise.resolve(undefined);
      result.returning = vi.fn().mockImplementation(() => {
        updated.push(setPayload);
        return Promise.resolve([
          { ...(opts.existingPost ?? {}), ...setPayload, id: POST_ID },
        ]);
      });
      return result;
    });
    return chain;
  };

  // Deterministic select sequencing. The post.service.ts implementation may
  // call select in an arbitrary order — we return the same row set for
  // profile lookups and for existing-post lookups based on call sequence.
  let selectCallNum = 0;
  const selectFn = vi.fn().mockImplementation(() => {
    selectCallNum += 1;
    // First select: profile. Second: existing post (for update only).
    if (selectCallNum === 1) {
      return selectChain(opts.profile ? [opts.profile] : []);
    }
    if (opts.existingPost) {
      return selectChain([opts.existingPost]);
    }
    return selectChain([]);
  });

  const db: any = {
    select: selectFn,
    insert: vi.fn().mockReturnValue(insertChain()),
    update: vi.fn().mockReturnValue(updateChain()),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(db),
    ),
    __inserted: inserted,
    __updated: updated,
  };
  return db;
}

describe('post.service — T-DATA-01 invariants (Plan 03 Task 2)', () => {
  let db: ReturnType<typeof buildPlatformMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Invariant 1: createPost denormalizes platform from social_profiles onto posts.platform', async () => {
    db = buildPlatformMockDb({
      profile: { id: PROFILE_ID, userId: USER_ID, platform: 'linkedin' },
    });

    const row = await createPost(db, {
      platform: 'linkedin',
      profileId: PROFILE_ID,
      userId: USER_ID,
      text: 'hello',
      visibility: 'PUBLIC',
      status: 'draft',
      hasSpinnableText: false,
      mediaIds: [],
      tagIds: [],
    } as any);

    expect((row as any).platform).toBe('linkedin');
  });

  it('Invariant 1 (defensive): createPost rejects PLATFORM_MISMATCH when payload.platform != profile.platform', async () => {
    db = buildPlatformMockDb({
      profile: { id: PROFILE_ID, userId: USER_ID, platform: 'twitter' },
    });

    await expect(
      createPost(db, {
        platform: 'linkedin',
        profileId: PROFILE_ID,
        userId: USER_ID,
        text: 'hello',
        visibility: 'PUBLIC',
        status: 'draft',
        hasSpinnableText: false,
        mediaIds: [],
        tagIds: [],
      } as any),
    ).rejects.toMatchObject({
      name: 'PostServiceError',
      code: 'PLATFORM_MISMATCH',
    });
  });

  it('persists visibility for LinkedIn into posts.visibility column', async () => {
    db = buildPlatformMockDb({
      profile: { id: PROFILE_ID, userId: USER_ID, platform: 'linkedin' },
    });

    await createPost(db, {
      platform: 'linkedin',
      profileId: PROFILE_ID,
      userId: USER_ID,
      text: 'hello',
      visibility: 'CONNECTIONS',
      status: 'draft',
      hasSpinnableText: false,
      mediaIds: [],
      tagIds: [],
    } as any);

    const insertedRow = db.__inserted[0];
    expect((insertedRow as any).visibility).toBe('CONNECTIONS');
  });

  it('persists linkUrl for Facebook into posts.link_url column', async () => {
    db = buildPlatformMockDb({
      profile: { id: PROFILE_ID, userId: USER_ID, platform: 'facebook' },
    });

    await createPost(db, {
      platform: 'facebook',
      profileId: PROFILE_ID,
      userId: USER_ID,
      text: 'hello',
      linkUrl: 'https://example.com',
      status: 'draft',
      hasSpinnableText: false,
      mediaIds: [],
      tagIds: [],
    } as any);

    const insertedRow = db.__inserted[0];
    expect((insertedRow as any).linkUrl).toBe('https://example.com');
  });

  it('Invariant 2: updatePost rejects PLATFORM_IMMUTABLE when payload.platform changes', async () => {
    db = buildPlatformMockDb({
      profile: { id: PROFILE_ID, userId: USER_ID, platform: 'linkedin' },
      existingPost: { id: POST_ID, profileId: PROFILE_ID, platform: 'linkedin', postVersion: 1 },
    });

    await expect(
      updatePost(db, POST_ID, {
        platform: 'twitter', // changed!
        profileId: PROFILE_ID,
        userId: USER_ID,
        text: 'hello',
        isThread: false,
        status: 'draft',
        hasSpinnableText: false,
        mediaIds: [],
        tagIds: [],
        postVersion: 1,
      } as any),
    ).rejects.toMatchObject({
      name: 'PostServiceError',
      code: 'PLATFORM_IMMUTABLE',
    });
  });

  it('Invariant 2 (control): updatePost succeeds when payload.platform matches existing post', async () => {
    db = buildPlatformMockDb({
      profile: { id: PROFILE_ID, userId: USER_ID, platform: 'linkedin' },
      existingPost: { id: POST_ID, profileId: PROFILE_ID, platform: 'linkedin', postVersion: 1 },
    });

    const updated = await updatePost(db, POST_ID, {
      platform: 'linkedin',
      profileId: PROFILE_ID,
      userId: USER_ID,
      text: 'updated text',
      visibility: 'PUBLIC',
      status: 'draft',
      hasSpinnableText: false,
      mediaIds: [],
      tagIds: [],
      postVersion: 1,
    } as any);

    expect((updated as any).text).toBe('updated text');
  });

  it('PostServiceError is exported for callers to type-check error codes', () => {
    // Smoke-test the named export (RED until Plan 03 adds the class).
    expect(typeof PostServiceError).toBe('function');
  });
});
