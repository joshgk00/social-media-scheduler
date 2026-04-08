import { describe, it } from 'vitest';

describe('post.service', () => {
  describe('createPost', () => {
    it.todo('creates a draft post when status is draft');
    it.todo('creates a scheduled post when status is scheduled and scheduledAt is in the future');
    it.todo('rejects scheduled posts without scheduledAt');
    it.todo('rejects scheduled posts with scheduledAt in the past');
    it.todo('associates tags via postTags junction table');
    it.todo('stores thread text with [[tweet]] separators when isThread is true');
  });

  describe('updatePost', () => {
    it.todo('updates post text and fields for editable posts');
    it.todo('rejects updates to posts in publishing state with 409');
    it.todo('rejects updates to posts in auto_destructing state');
    it.todo('increments postVersion on successful update');
    it.todo('rejects updates when postVersion does not match via atomic UPDATE WHERE');
    it.todo('uses atomic UPDATE ... SET ... WHERE id = ? AND post_version = ? (not read-then-write)');
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
