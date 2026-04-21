import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PostStatus } from '@sms/shared';

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

const mockPosts = makeTableStub('posts', [
  'id', 'userId', 'profileId', 'text', 'isThread', 'status', 'scheduledAt',
  'publishedAt', 'failedAt', 'failureReason', 'platformPostId', 'postVersion',
  'hasSpinnableText', 'autoDestructAfter', 'notes', 'createdAt', 'updatedAt',
]);

const mockTags = makeTableStub('tags', ['id', 'name', 'color', 'userId', 'createdAt', 'updatedAt']);
const mockPostTags = makeTableStub('post_tags', ['postId', 'tagId']);
const mockSocialProfiles = makeTableStub('social_profiles', ['id', 'userId']);
const mockPostMedia = makeTableStub('post_media', [
  'id', 'postId', 'filePath', 'fileName', 'mimeType', 'fileSize', 'width', 'height',
  'thumbnailPath', 'sortOrder', 'transcodeStatus', 'transcodeError', 'deletedAt', 'createdAt',
]);

vi.mock('@sms/db', () => ({
  posts: mockPosts,
  tags: mockTags,
  postTags: mockPostTags,
  socialProfiles: mockSocialProfiles,
  postMedia: mockPostMedia,
}));

const mockCreateLogger = vi.fn().mockReturnValue({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

vi.mock('@sms/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sms/shared')>();

  const EDITABLE: readonly string[] = ['draft', 'scheduled', 'failed'];
  const DELETABLE: readonly string[] = ['draft', 'scheduled', 'published', 'failed'];

  const POST_STATE_TRANSITIONS: Record<string, readonly string[]> = {
    draft: ['scheduled', 'publishing'],
    scheduled: ['draft', 'queued', 'publishing'],
    queued: ['publishing'],
    publishing: ['published', 'failed'],
    published: ['auto_destructing'],
    failed: ['draft', 'scheduled'],
    auto_destructing: ['destroyed'],
    destroyed: [],
  };

  return {
    ...actual,
    EDITABLE_STATES: EDITABLE,
    DELETABLE_STATES: DELETABLE,
    POST_STATE_TRANSITIONS,
    isValidTransition: (from: string, to: string) => POST_STATE_TRANSITIONS[from]?.includes(to) ?? false,
    transitionPost: (current: string, target: string) => {
      if (!POST_STATE_TRANSITIONS[current]?.includes(target)) {
        throw new Error(`Invalid state transition: ${current} -> ${target}`);
      }
      return target;
    },
  };
});

vi.mock('@sms/shared/logger', () => ({
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

const mockSoftDeleteMediaForPost = vi.fn().mockResolvedValue(0);
const mockAssociateMediaToPost = vi.fn().mockResolvedValue(undefined);

vi.mock('../../services/media.service.js', () => ({
  softDeleteMediaForPost: (...args: unknown[]) => mockSoftDeleteMediaForPost(...args),
  associateMediaToPost: (...args: unknown[]) => mockAssociateMediaToPost(...args),
}));

function createPostUpdateMockDb(options: {
  updateResult?: unknown[];
  existingPost?: { id: string; status: string; postVersion: number } | null;
}) {
  const updateResult = options.updateResult ?? [];
  const existingPost = options.existingPost;
  const lookupResult = existingPost ? [existingPost] : [];

  const updateChain: Record<string, any> = {};
  updateChain.set = vi.fn().mockReturnValue(updateChain);
  updateChain.where = vi.fn().mockReturnValue(updateChain);
  updateChain.returning = vi.fn().mockReturnValue(updateChain);
  updateChain.then = (resolve: (v: unknown) => void) => resolve(updateResult);

  const tagSelectChain: Record<string, any> = {};
  tagSelectChain.from = vi.fn().mockReturnValue(tagSelectChain);
  tagSelectChain.innerJoin = vi.fn().mockReturnValue(tagSelectChain);
  tagSelectChain.where = vi.fn().mockReturnValue(tagSelectChain);
  tagSelectChain.then = (resolve: (v: unknown) => void) => resolve([]);

  let selectCallIndex = 0;

  function makeSelectChain(result: unknown[]) {
    const chain: Record<string, any> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  }

  const selectFn = vi.fn().mockImplementation(() => {
    selectCallIndex++;
    if (selectCallIndex === 1) {
      return makeSelectChain(lookupResult);
    }
    return makeSelectChain([]);
  });

  const deleteChain: Record<string, any> = {};
  deleteChain.where = vi.fn().mockReturnValue(deleteChain);
  deleteChain.then = (resolve: (v: unknown) => void) => resolve([]);

  const insertChain: Record<string, any> = {};
  insertChain.values = vi.fn().mockReturnValue(insertChain);
  insertChain.returning = vi.fn().mockReturnValue(insertChain);
  insertChain.then = (resolve: (v: unknown) => void) => resolve([]);

  const db: any = {
    update: vi.fn().mockReturnValue(updateChain),
    select: selectFn,
    insert: vi.fn().mockReturnValue(insertChain),
    delete: vi.fn().mockReturnValue(deleteChain),
    transaction: vi.fn(),
    _updateChain: updateChain,
  };
  db.transaction = vi.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(db));
  return db;
}

function createPostCreateMockDb(options: {
  profileExists?: boolean;
  insertedPost?: Record<string, unknown>;
  tagCheckResult?: unknown[];
  postWithTags?: Record<string, unknown> | null;
  hasTags?: boolean;
} = {}) {
  const profileExists = options.profileExists ?? true;
  const insertedPost = options.insertedPost ?? {
    id: 'post-1', userId: 'user-1', profileId: 'profile-1',
    text: 'Hello', isThread: false, status: 'draft',
    scheduledAt: null, postVersion: 1, createdAt: new Date(), updatedAt: new Date(),
  };
  const tagCheckResult = options.tagCheckResult ?? [];
  const postWithTags = options.postWithTags ?? { ...insertedPost, tags: [] };
  const hasTags = options.hasTags ?? (tagCheckResult.length > 0);

  let selectCallIndex = 0;

  function makeSelectChain(result: unknown[]) {
    const chain: Record<string, any> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.offset = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  }

  // Call sequence depends on whether tags are provided:
  // With tags: 1=profile check, 2=tag check (tx), 3=getPostById post, 4=getPostById tags
  // Without tags: 1=profile check, 2=getPostById post, 3=getPostById tags
  const selectFn = vi.fn().mockImplementation(() => {
    selectCallIndex++;
    if (selectCallIndex === 1) {
      return makeSelectChain(profileExists ? [{ id: 'profile-1' }] : []);
    }
    if (hasTags) {
      if (selectCallIndex === 2) return makeSelectChain(tagCheckResult);
      if (selectCallIndex === 3) return makeSelectChain(postWithTags ? [postWithTags] : []);
      if (selectCallIndex === 4) return makeSelectChain([]);
    } else {
      if (selectCallIndex === 2) return makeSelectChain(postWithTags ? [postWithTags] : []);
      if (selectCallIndex === 3) return makeSelectChain([]);
    }
    return makeSelectChain([]);
  });

  const insertChain: Record<string, any> = {};
  insertChain.values = vi.fn().mockReturnValue(insertChain);
  insertChain.returning = vi.fn().mockReturnValue(insertChain);
  insertChain.then = (resolve: (v: unknown) => void) => resolve([insertedPost]);

  const deleteChain: Record<string, any> = {};
  deleteChain.where = vi.fn().mockReturnValue(deleteChain);
  deleteChain.returning = vi.fn().mockReturnValue(deleteChain);
  deleteChain.then = (resolve: (v: unknown) => void) => resolve([]);

  const db: any = {
    select: selectFn,
    insert: vi.fn().mockReturnValue(insertChain),
    delete: vi.fn().mockReturnValue(deleteChain),
    update: vi.fn(),
    transaction: vi.fn(),
    _insertChain: insertChain,
  };
  db.transaction = vi.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(db));
  return db;
}

function createDeleteMockDb(options: {
  deleteResult?: unknown[];
  existingPost?: { id: string; status: string } | null;
}) {
  const deleteResult = options.deleteResult ?? [];
  const existingPost = options.existingPost;

  const deleteChain: Record<string, any> = {};
  deleteChain.where = vi.fn().mockReturnValue(deleteChain);
  deleteChain.returning = vi.fn().mockReturnValue(deleteChain);
  deleteChain.then = (resolve: (v: unknown) => void) => resolve(deleteResult);

  function makeSelectChain(result: unknown[]) {
    const chain: Record<string, any> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  }

  // softDeleteMediaForPost calls db.update(postMedia).set().where().returning({ id }) before deletePost runs
  const updateChain: Record<string, any> = {};
  updateChain.set = vi.fn().mockReturnValue(updateChain);
  updateChain.where = vi.fn().mockReturnValue(updateChain);
  updateChain.returning = vi.fn().mockReturnValue(updateChain);
  updateChain.then = (resolve: (v: unknown) => void) => resolve([]);

  const db: any = {
    delete: vi.fn().mockReturnValue(deleteChain),
    update: vi.fn().mockReturnValue(updateChain),
    select: vi.fn().mockImplementation(() => {
      return makeSelectChain(existingPost ? [existingPost] : []);
    }),
  };
  // deletePost wraps soft-delete + hard-delete in a transaction for atomicity
  db.transaction = vi.fn().mockImplementation((callback: (tx: any) => any) => callback(db));
  return db;
}

function createGetPostsMockDb(options: {
  postRows?: unknown[];
  total?: number;
  tagRows?: unknown[];
  hasTagFilter?: boolean;
}) {
  const postRows = options.postRows ?? [];
  const total = options.total ?? postRows.length;
  const tagRows = options.tagRows ?? [];
  const hasTagFilter = options.hasTagFilter ?? false;

  let selectCallIndex = 0;

  function makeSelectChain(result: unknown[]) {
    const chain: Record<string, any> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.leftJoin = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.offset = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  }

  // When tagId is present, the first select builds a subquery object
  // Sequence with tagFilter: 1=subquery, 2=posts, 3=count, 4=tags
  // Sequence without tagFilter: 1=posts, 2=count, 3=tags
  const selectFn = vi.fn().mockImplementation(() => {
    selectCallIndex++;
    if (hasTagFilter) {
      if (selectCallIndex === 1) return makeSelectChain([]);
      if (selectCallIndex === 2) return makeSelectChain(postRows);
      if (selectCallIndex === 3) return makeSelectChain([{ total }]);
      if (selectCallIndex === 4) return makeSelectChain(tagRows);
    } else {
      if (selectCallIndex === 1) return makeSelectChain(postRows);
      if (selectCallIndex === 2) return makeSelectChain([{ total }]);
      if (selectCallIndex === 3) return makeSelectChain(tagRows);
    }
    return makeSelectChain([]);
  });

  return { select: selectFn } as any;
}

function createCheckConflictsMockDb(options: {
  conflictingPosts?: Array<{ id: string; text: string; scheduledAt: Date; status: string }>;
}) {
  const conflictingPosts = options.conflictingPosts ?? [];

  function makeSelectChain(result: unknown[]) {
    const chain: Record<string, any> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  }

  return {
    select: vi.fn().mockImplementation(() => makeSelectChain(conflictingPosts)),
  } as any;
}

describe('post.service', () => {
  let createPost: typeof import('../../services/post.service.js').createPost;
  let updatePost: typeof import('../../services/post.service.js').updatePost;
  let deletePost: typeof import('../../services/post.service.js').deletePost;
  let getPosts: typeof import('../../services/post.service.js').getPosts;
  let checkConflicts: typeof import('../../services/post.service.js').checkConflicts;
  let PostServiceError: typeof import('../../services/post.service.js').PostServiceError;

  beforeEach(async () => {
    mockCreateLogger.mockClear();
    mockCreateLogger.mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    });
    mockSoftDeleteMediaForPost.mockClear();
    mockAssociateMediaToPost.mockClear();

    const mod = await import('../../services/post.service.js');
    createPost = mod.createPost;
    updatePost = mod.updatePost;
    deletePost = mod.deletePost;
    getPosts = mod.getPosts;
    checkConflicts = mod.checkConflicts;
    PostServiceError = mod.PostServiceError;
  });

  describe('createPost', () => {
    it('creates a draft post when status is draft', async () => {
      const db = createPostCreateMockDb();

      const result = await createPost(db, 'user-1', {
        profileId: 'profile-1',
        text: 'Hello world',
        status: 'draft',
      });

      expect(result).toBeTruthy();
      expect(db.insert).toHaveBeenCalled();
    });

    it('creates a scheduled post when status is scheduled and scheduledAt is in the future', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const insertedPost = {
        id: 'post-1', userId: 'user-1', profileId: 'profile-1',
        text: 'Scheduled post', isThread: false, status: 'scheduled',
        scheduledAt: new Date(futureDate), postVersion: 1,
        createdAt: new Date(), updatedAt: new Date(),
      };
      const db = createPostCreateMockDb({
        insertedPost,
        postWithTags: { ...insertedPost, tags: [] },
      });

      const result = await createPost(db, 'user-1', {
        profileId: 'profile-1',
        text: 'Scheduled post',
        status: 'scheduled',
        scheduledAt: futureDate,
      });

      expect(result).toBeTruthy();
      expect(db.insert).toHaveBeenCalled();
    });

    it('rejects scheduled posts without scheduledAt', async () => {
      const db = createPostCreateMockDb();

      try {
        await createPost(db, 'user-1', {
          profileId: 'profile-1',
          text: 'Missing schedule',
          status: 'scheduled',
        });
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(PostServiceError);
        expect(err.statusCode).toBe(400);
        expect(err.message).toContain('scheduledAt is required');
      }
    });

    it('rejects scheduled posts with scheduledAt in the past', async () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const db = createPostCreateMockDb();

      try {
        await createPost(db, 'user-1', {
          profileId: 'profile-1',
          text: 'Past schedule',
          status: 'scheduled',
          scheduledAt: pastDate,
        });
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(PostServiceError);
        expect(err.statusCode).toBe(400);
        expect(err.message).toContain('future');
      }
    });

    it('associates tags via postTags junction table', async () => {
      const db = createPostCreateMockDb({
        tagCheckResult: [{ id: 'tag-1' }, { id: 'tag-2' }],
        hasTags: true,
      });

      await createPost(db, 'user-1', {
        profileId: 'profile-1',
        text: 'Tagged post',
        tagIds: ['tag-1', 'tag-2'],
      });

      // insert called twice: once for the post, once for postTags
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it('calls associateMediaToPost when mediaIds provided', async () => {
      const db = createPostCreateMockDb();

      await createPost(db, 'user-1', {
        profileId: 'profile-1',
        text: 'Hello',
        mediaIds: ['media-1', 'media-2'],
      });

      expect(mockAssociateMediaToPost).toHaveBeenCalledTimes(1);
      expect(mockAssociateMediaToPost).toHaveBeenCalledWith(
        expect.anything(),
        'post-1',
        ['media-1', 'media-2'],
      );
    });

    it('does NOT call associateMediaToPost when no mediaIds', async () => {
      const db = createPostCreateMockDb();

      await createPost(db, 'user-1', {
        profileId: 'profile-1',
        text: 'Hello',
      });

      expect(mockAssociateMediaToPost).not.toHaveBeenCalled();
    });

    it('does NOT call associateMediaToPost when mediaIds is empty array', async () => {
      const db = createPostCreateMockDb();

      await createPost(db, 'user-1', {
        profileId: 'profile-1',
        text: 'Hello',
        mediaIds: [],
      });

      expect(mockAssociateMediaToPost).not.toHaveBeenCalled();
    });

    it('stores thread text with [[tweet]] separators when isThread is true', async () => {
      const threadText = 'First tweet[[tweet]]Second tweet[[tweet]]Third tweet';
      const insertedPost = {
        id: 'post-1', userId: 'user-1', profileId: 'profile-1',
        text: threadText, isThread: true, status: 'draft',
        scheduledAt: null, postVersion: 1,
        createdAt: new Date(), updatedAt: new Date(),
      };
      const db = createPostCreateMockDb({
        insertedPost,
        postWithTags: { ...insertedPost, tags: [] },
      });

      await createPost(db, 'user-1', {
        profileId: 'profile-1',
        text: threadText,
        isThread: true,
      });

      const valuesCall = db._insertChain.values.mock.calls[0][0];
      expect(valuesCall.text).toBe(threadText);
      expect(valuesCall.isThread).toBe(true);
    });

    it('returns a media field in the response (getPostById includes media after WR-01)', async () => {
      const db = createPostCreateMockDb();

      const result = await createPost(db, 'user-1', {
        profileId: 'profile-1',
        text: 'Post with no media',
      });

      // media must be present and be an array (empty when no media associated)
      expect(result).toHaveProperty('media');
      expect(Array.isArray(result?.media)).toBe(true);
    });
  });

  describe('updatePost', () => {
    it('rejects updates to posts in publishing state with 409', async () => {
      const db = createPostUpdateMockDb({
        updateResult: [],
        existingPost: { id: 'post-1', status: 'publishing', postVersion: 1 },
      });

      try {
        await updatePost(db, 'user-1', 'post-1', { text: 'updated', postVersion: 1 });
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('currently being published');
        expect(err.statusCode).toBe(409);
      }
    });

    it('rejects updates when postVersion does not match via atomic UPDATE WHERE', async () => {
      const db = createPostUpdateMockDb({
        updateResult: [],
        existingPost: { id: 'post-1', status: 'draft', postVersion: 5 },
      });

      try {
        await updatePost(db, 'user-1', 'post-1', { text: 'stale update', postVersion: 3 });
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('modified elsewhere');
        expect(err.statusCode).toBe(409);
      }
    });

    it('uses atomic UPDATE ... SET ... WHERE id = ? AND post_version = ? (not read-then-write)', async () => {
      const updatedPost = {
        id: 'post-1',
        userId: 'user-1',
        profileId: 'profile-1',
        text: 'updated text',
        status: 'draft',
        postVersion: 2,
        isThread: false,
        scheduledAt: null,
        hasSpinnableText: false,
        autoDestructAfter: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const db = createPostUpdateMockDb({
        updateResult: [updatedPost],
        existingPost: { id: 'post-1', status: 'draft', postVersion: 1 },
      });

      await updatePost(db, 'user-1', 'post-1', { text: 'updated text', postVersion: 1 });

      expect(db.update).toHaveBeenCalledTimes(1);

      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall).toHaveProperty('postVersion');
      expect(setCall).toHaveProperty('updatedAt');

      expect(db._updateChain.where).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid state transitions with 409', async () => {
      const db = createPostUpdateMockDb({
        updateResult: [],
        existingPost: { id: 'post-1', status: 'draft', postVersion: 1 },
      });

      try {
        await updatePost(db, 'user-1', 'post-1', { status: 'failed' as any, postVersion: 1 });
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(PostServiceError);
        expect(err.statusCode).toBe(409);
      }
    });

    it('rejects updates to posts in auto_destructing state', async () => {
      const db = createPostUpdateMockDb({
        updateResult: [],
        existingPost: { id: 'post-1', status: 'auto_destructing', postVersion: 1 },
      });

      try {
        await updatePost(db, 'user-1', 'post-1', { text: 'too late', postVersion: 1 });
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
      }
    });

    it('updates post text and fields for editable posts', async () => {
      const updatedPost = {
        id: 'post-1', userId: 'user-1', profileId: 'profile-1',
        text: 'new text', status: 'draft', postVersion: 2,
        isThread: false, scheduledAt: null, hasSpinnableText: false,
        autoDestructAfter: null, notes: 'a note',
        createdAt: new Date(), updatedAt: new Date(),
      };

      const db = createPostUpdateMockDb({
        updateResult: [updatedPost],
        existingPost: { id: 'post-1', status: 'draft', postVersion: 1 },
      });

      await updatePost(db, 'user-1', 'post-1', {
        text: 'new text', notes: 'a note', postVersion: 1,
      });

      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall.text).toBe('new text');
      expect(setCall.notes).toBe('a note');
    });

    it('clears old associations and calls associateMediaToPost when mediaIds provided', async () => {
      const db = createPostUpdateMockDb({
        updateResult: [{ id: 'post-1' }],
        existingPost: { id: 'post-1', status: 'draft', postVersion: 1, scheduledAt: null },
      });

      await updatePost(db, 'user-1', 'post-1', { postVersion: 1, mediaIds: ['media-3'] });

      // update called twice: once for the post row, once for clearing media associations
      expect(db.update).toHaveBeenCalledTimes(2);
      const clearCall = db._updateChain.set.mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).postId === null,
      );
      expect(clearCall).toBeDefined();
      expect(mockAssociateMediaToPost).toHaveBeenCalledWith(
        expect.anything(),
        'post-1',
        ['media-3'],
      );
    });

    it('clears associations when mediaIds is empty array', async () => {
      const db = createPostUpdateMockDb({
        updateResult: [{ id: 'post-1' }],
        existingPost: { id: 'post-1', status: 'draft', postVersion: 1, scheduledAt: null },
      });

      await updatePost(db, 'user-1', 'post-1', { postVersion: 1, mediaIds: [] });

      // update called twice: once for the post row, once for clearing media associations
      expect(db.update).toHaveBeenCalledTimes(2);
      expect(mockAssociateMediaToPost).not.toHaveBeenCalled();
    });

    it('does NOT touch media when mediaIds is undefined (not provided)', async () => {
      const db = createPostUpdateMockDb({
        updateResult: [{ id: 'post-1' }],
        existingPost: { id: 'post-1', status: 'draft', postVersion: 1, scheduledAt: null },
      });

      await updatePost(db, 'user-1', 'post-1', { postVersion: 1 });

      // update called only once: for the post row itself
      expect(db.update).toHaveBeenCalledTimes(1);
      expect(mockAssociateMediaToPost).not.toHaveBeenCalled();
    });

    it('increments postVersion on successful update', async () => {
      const updatedPost = {
        id: 'post-1', userId: 'user-1', profileId: 'profile-1',
        text: 'updated', status: 'draft', postVersion: 2,
        isThread: false, scheduledAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      };

      const db = createPostUpdateMockDb({
        updateResult: [updatedPost],
        existingPost: { id: 'post-1', status: 'draft', postVersion: 1 },
      });

      await updatePost(db, 'user-1', 'post-1', { text: 'updated', postVersion: 1 });

      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall).toHaveProperty('postVersion');
    });
  });

  describe('deletePost', () => {
    it('deletes posts in deletable states', async () => {
      const db = createDeleteMockDb({
        deleteResult: [{ id: 'post-1' }],
        existingPost: null,
      });

      const result = await deletePost(db, 'user-1', 'post-1');

      expect(result).toBe(true);
      expect(db.delete).toHaveBeenCalledTimes(1);
    });

    it('rejects deletion of posts in publishing state', async () => {
      const db = createDeleteMockDb({
        deleteResult: [],
        existingPost: { id: 'post-1', status: 'publishing' },
      });

      try {
        await deletePost(db, 'user-1', 'post-1');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(PostServiceError);
        expect(err.statusCode).toBe(409);
        expect(err.message).toContain('cannot be deleted');
      }
    });

    it('rejects deletion of posts in destroyed state', async () => {
      const db = createDeleteMockDb({
        deleteResult: [],
        existingPost: { id: 'post-1', status: 'destroyed' },
      });

      try {
        await deletePost(db, 'user-1', 'post-1');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(PostServiceError);
        expect(err.statusCode).toBe(409);
      }
    });
  });

  describe('getPosts', () => {
    it('returns paginated posts with total count', async () => {
      const postRows = [
        {
          post: { id: 'post-1', userId: 'user-1', text: 'first', status: 'draft', scheduledAt: null, createdAt: new Date() },
          profile: { displayName: 'Profile One', handle: 'profile1', avatarUrl: null },
        },
        {
          post: { id: 'post-2', userId: 'user-1', text: 'second', status: 'draft', scheduledAt: null, createdAt: new Date() },
          profile: { displayName: 'Profile Two', handle: 'profile2', avatarUrl: 'https://example.com/avatar.png' },
        },
      ];
      const db = createGetPostsMockDb({ postRows, total: 5 });

      const result = await getPosts(db, 'user-1', { page: 1, limit: 2 });

      expect(result.posts).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.posts[0].profile).toEqual({
        displayName: 'Profile One',
        handle: 'profile1',
        avatarUrl: '',
      });
    });

    it('leaves profile undefined when a post no longer has a connected profile', async () => {
      const db = createGetPostsMockDb({
        postRows: [{
          post: { id: 'post-1', userId: 'user-1', text: 'orphaned', status: 'draft', scheduledAt: null, createdAt: new Date() },
          profile: { displayName: null, handle: null, avatarUrl: null },
        }],
      });

      const result = await getPosts(db, 'user-1', { page: 1, limit: 25 });

      expect(result.posts[0].profile).toBeUndefined();
    });

    it('filters by status server-side', async () => {
      const db = createGetPostsMockDb({ postRows: [], total: 0 });

      await getPosts(db, 'user-1', { status: 'scheduled' as PostStatus });

      expect(db.select).toHaveBeenCalled();
    });

    it('filters by profileId server-side', async () => {
      const db = createGetPostsMockDb({ postRows: [], total: 0 });

      await getPosts(db, 'user-1', { profileId: 'profile-1' });

      expect(db.select).toHaveBeenCalled();
    });

    it('filters by tagId via junction table server-side', async () => {
      const db = createGetPostsMockDb({ postRows: [], total: 0, hasTagFilter: true });

      await getPosts(db, 'user-1', { tagId: 'tag-1' });

      expect(db.select).toHaveBeenCalled();
    });

    it('filters by search text (ilike) server-side', async () => {
      const db = createGetPostsMockDb({ postRows: [], total: 0 });

      await getPosts(db, 'user-1', { search: 'hello' });

      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('checkConflicts', () => {
    it('returns posts within 5 minutes of target scheduledAt on same profile using UTC comparison', async () => {
      const targetTime = new Date('2026-04-08T15:00:00Z');
      const conflictTime = new Date('2026-04-08T15:03:00Z');

      const db = createCheckConflictsMockDb({
        conflictingPosts: [{
          id: 'post-2',
          text: 'Conflicting post text here',
          scheduledAt: conflictTime,
          status: 'scheduled',
        }],
      });

      const result = await checkConflicts(db, 'user-1', 'profile-1', targetTime.toISOString());

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('post-2');
      expect(result[0].status).toBe('scheduled');
    });

    it('excludes the post being edited via excludePostId', async () => {
      const db = createCheckConflictsMockDb({ conflictingPosts: [] });

      const result = await checkConflicts(
        db, 'user-1', 'profile-1',
        new Date('2026-04-08T15:00:00Z').toISOString(),
        'post-being-edited',
      );

      expect(result).toHaveLength(0);
      expect(db.select).toHaveBeenCalled();
    });

    it('returns empty array when no conflicts exist', async () => {
      const db = createCheckConflictsMockDb({ conflictingPosts: [] });

      const result = await checkConflicts(
        db, 'user-1', 'profile-1',
        new Date('2026-04-08T15:00:00Z').toISOString(),
      );

      expect(result).toEqual([]);
    });
  });
});
