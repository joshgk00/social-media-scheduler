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

vi.mock('@sms/db', () => ({
  posts: mockPosts,
  tags: mockTags,
  postTags: mockPostTags,
}));

const mockCreateLogger = vi.fn().mockReturnValue({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

vi.mock('@sms/shared', () => {
  const EDITABLE: readonly string[] = ['draft', 'scheduled', 'failed'];
  const DELETABLE: readonly string[] = ['draft', 'scheduled', 'published', 'failed'];
  const NON_INTERACTIVE: readonly string[] = ['publishing', 'auto_destructing', 'destroyed'];

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
    EDITABLE_STATES: EDITABLE,
    DELETABLE_STATES: DELETABLE,
    NON_INTERACTIVE_STATES: NON_INTERACTIVE,
    POST_STATE_TRANSITIONS,
    isValidTransition: (from: string, to: string) => POST_STATE_TRANSITIONS[from]?.includes(to) ?? false,
    transitionPost: (current: string, target: string) => {
      if (!POST_STATE_TRANSITIONS[current]?.includes(target)) {
        throw new Error(`Invalid state transition: ${current} -> ${target}`);
      }
      return target;
    },
    createLogger: (...args: unknown[]) => mockCreateLogger(...args),
  };
});

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

  return {
    update: vi.fn().mockReturnValue(updateChain),
    select: selectFn,
    insert: vi.fn().mockReturnValue(insertChain),
    delete: vi.fn().mockReturnValue(deleteChain),
    _updateChain: updateChain,
  } as any;
}

describe('post.service', () => {
  let updatePost: typeof import('../../services/post.service.js').updatePost;
  let PostServiceError: typeof import('../../services/post.service.js').PostServiceError;

  beforeEach(async () => {
    mockCreateLogger.mockClear();
    mockCreateLogger.mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    });

    const mod = await import('../../services/post.service.js');
    updatePost = mod.updatePost;
    PostServiceError = mod.PostServiceError;
  });

  describe('createPost', () => {
    it.todo('creates a draft post when status is draft');
    it.todo('creates a scheduled post when status is scheduled and scheduledAt is in the future');
    it.todo('rejects scheduled posts without scheduledAt');
    it.todo('rejects scheduled posts with scheduledAt in the past');
    it.todo('associates tags via postTags junction table');
    it.todo('stores thread text with [[tweet]] separators when isThread is true');
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
        existingPost: null,
      });

      await updatePost(db, 'user-1', 'post-1', { text: 'updated text', postVersion: 1 });

      expect(db.update).toHaveBeenCalledTimes(1);

      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall).toHaveProperty('postVersion');
      expect(setCall).toHaveProperty('updatedAt');

      expect(db._updateChain.where).toHaveBeenCalledTimes(1);
    });

    it.todo('rejects updates to posts in auto_destructing state');
    it.todo('updates post text and fields for editable posts');
    it.todo('increments postVersion on successful update');
  });

  describe('deletePost', () => {
    it.todo('deletes posts in deletable states');
    it.todo('rejects deletion of posts in publishing state');
    it.todo('rejects deletion of posts in destroyed state');
  });

  describe('getPosts', () => {
    it.todo('returns paginated posts with total count');
    it.todo('filters by status server-side');
    it.todo('filters by profileId server-side');
    it.todo('filters by tagId via junction table server-side');
    it.todo('filters by search text (ilike) server-side');
  });

  describe('checkConflicts', () => {
    it.todo('returns posts within 5 minutes of target scheduledAt on same profile using UTC comparison');
    it.todo('excludes the post being edited via excludePostId');
    it.todo('returns empty array when no conflicts exist');
  });
});
