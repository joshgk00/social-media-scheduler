import { describe, it } from 'vitest';

describe('posts API integration', () => {
  describe('POST /api/posts', () => {
    it.todo('creates a post with all common fields');
    it.todo('associates tags on creation');
    it.todo('stores auto-destruct configuration');
    it.todo('stores notes');
  });

  describe('GET /api/posts', () => {
    it.todo('returns posts with tags included');
    it.todo('paginates correctly');
    it.todo('filters by multiple criteria simultaneously');
    it.todo('all filtering is server-side (not client-side)');
  });

  describe('PUT /api/posts/:id', () => {
    it.todo('enforces optimistic locking via atomic post_version update');
    it.todo('returns 409 for version mismatch');
    it.todo('returns 409 for non-editable state');
  });

  describe('state machine enforcement', () => {
    it.todo('drafts are excluded from scheduler query (status != scheduled)');
    it.todo('publishing state blocks edits with 409');
    it.todo('failed -> draft transition allowed for re-editing');
  });

  describe('credential security', () => {
    it.todo('GET /api/profiles never returns ciphertext, IV, or authTag fields');
    it.todo('credential values never appear in error messages or logs');
  });
});
