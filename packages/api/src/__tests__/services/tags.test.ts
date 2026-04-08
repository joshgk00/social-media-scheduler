import { describe, it } from 'vitest';

describe('tag.service', () => {
  describe('createTag', () => {
    it.todo('creates a tag with name and default color');
    it.todo('creates a tag with custom color');
    it.todo('rejects duplicate tag names (case-insensitive) for the same user');
  });

  describe('updateTag', () => {
    it.todo('renames a tag');
    it.todo('updates tag color');
    it.todo('returns null when tag not found');
  });

  describe('deleteTag', () => {
    it.todo('deletes tag and removes postTags references');
    it.todo('returns false when tag not found');
  });

  describe('getTags', () => {
    it.todo('returns all tags for the user ordered by name');
    it.todo('returns empty array when no tags exist');
  });
});
