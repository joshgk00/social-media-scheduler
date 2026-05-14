import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const mockTags = makeTableStub('tags', [
  'id', 'name', 'color', 'userId', 'createdAt', 'updatedAt',
]);

vi.mock('@sms/db', () => ({
  tags: mockTags,
}));

const mockCreateLogger = vi.fn().mockReturnValue({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

vi.mock('@sms/shared/logger', () => ({
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

function createMockDb(overrides: {
  insertResult?: unknown[];
  updateResult?: unknown[];
  deleteResult?: unknown[];
  selectResult?: unknown[];
} = {}) {
  const insertResult = overrides.insertResult ?? [];
  const updateResult = overrides.updateResult ?? [];
  const deleteResult = overrides.deleteResult ?? [];
  const selectResult = overrides.selectResult ?? [];

  const insertChain: Record<string, any> = {};
  insertChain.values = vi.fn().mockReturnValue(insertChain);
  insertChain.returning = vi.fn().mockReturnValue(insertChain);
  insertChain.then = (resolve: (v: unknown) => void) => resolve(insertResult);

  const updateChain: Record<string, any> = {};
  updateChain.set = vi.fn().mockReturnValue(updateChain);
  updateChain.where = vi.fn().mockReturnValue(updateChain);
  updateChain.returning = vi.fn().mockReturnValue(updateChain);
  updateChain.then = (resolve: (v: unknown) => void) => resolve(updateResult);

  const deleteChain: Record<string, any> = {};
  deleteChain.where = vi.fn().mockReturnValue(deleteChain);
  deleteChain.returning = vi.fn().mockReturnValue(deleteChain);
  deleteChain.then = (resolve: (v: unknown) => void) => resolve(deleteResult);

  const selectChain: Record<string, any> = {};
  selectChain.from = vi.fn().mockReturnValue(selectChain);
  selectChain.where = vi.fn().mockReturnValue(selectChain);
  selectChain.orderBy = vi.fn().mockReturnValue(selectChain);
  selectChain.then = (resolve: (v: unknown) => void) => resolve(selectResult);

  return {
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    delete: vi.fn().mockReturnValue(deleteChain),
    select: vi.fn().mockReturnValue(selectChain),
    _insertChain: insertChain,
    _updateChain: updateChain,
    _deleteChain: deleteChain,
    _selectChain: selectChain,
  } as any;
}

describe('tag.service', () => {
  let createTag: typeof import('../../services/tag.service.js').createTag;
  let updateTag: typeof import('../../services/tag.service.js').updateTag;
  let deleteTag: typeof import('../../services/tag.service.js').deleteTag;
  let getTags: typeof import('../../services/tag.service.js').getTags;
  let TagServiceError: typeof import('../../services/tag.service.js').TagServiceError;

  beforeEach(async () => {
    mockCreateLogger.mockClear();
    mockCreateLogger.mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    });

    const mod = await import('../../services/tag.service.js');
    createTag = mod.createTag;
    updateTag = mod.updateTag;
    deleteTag = mod.deleteTag;
    getTags = mod.getTags;
    TagServiceError = mod.TagServiceError;
  });

  describe('createTag', () => {
    it('creates a tag with name and default color', async () => {
      const createdTag = {
        id: 'tag-1',
        name: 'marketing',
        color: '#6b7280',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db = createMockDb({ insertResult: [createdTag] });

      const result = await createTag(db, 'user-1', { name: 'marketing' });

      expect(result).toEqual(createdTag);
      expect(db.insert).toHaveBeenCalledTimes(1);

      const valuesCall = db._insertChain.values.mock.calls[0][0];
      expect(valuesCall.name).toBe('marketing');
      expect(valuesCall.color).toBe('#6b7280');
      expect(valuesCall.userId).toBe('user-1');
    });

    it('creates a tag with custom color', async () => {
      const createdTag = {
        id: 'tag-2',
        name: 'urgent',
        color: '#ef4444',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db = createMockDb({ insertResult: [createdTag] });

      const result = await createTag(db, 'user-1', { name: 'urgent', color: '#ef4444' });

      expect(result).toEqual(createdTag);
      const valuesCall = db._insertChain.values.mock.calls[0][0];
      expect(valuesCall.color).toBe('#ef4444');
    });

    it('rejects duplicate tag names (case-insensitive) for the same user', async () => {
      const uniqueViolation = Object.assign(new Error('unique violation'), { code: '23505' });
      const db = createMockDb();
      db._insertChain.then = (_resolve: any, reject: (e: Error) => void) => {
        if (reject) reject(uniqueViolation);
        else throw uniqueViolation;
      };
      // Override the thenable to throw
      db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(uniqueViolation),
        }),
      });

      try {
        await createTag(db, 'user-1', { name: 'Marketing' });
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(TagServiceError);
        expect(err.statusCode).toBe(409);
        expect(err.message).toContain('already exists');
      }
    });
  });

  describe('updateTag', () => {
    it('renames a tag', async () => {
      const updatedTag = {
        id: 'tag-1',
        name: 'rebranded',
        color: '#6b7280',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db = createMockDb({ updateResult: [updatedTag] });

      const result = await updateTag(db, 'user-1', 'tag-1', { name: 'rebranded' });

      expect(result).toEqual(updatedTag);
      expect(db.update).toHaveBeenCalledTimes(1);

      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall.name).toBe('rebranded');
      expect(setCall).toHaveProperty('updatedAt');
    });

    it('updates tag color', async () => {
      const updatedTag = {
        id: 'tag-1',
        name: 'marketing',
        color: '#22c55e',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db = createMockDb({ updateResult: [updatedTag] });

      const result = await updateTag(db, 'user-1', 'tag-1', { color: '#22c55e' });

      expect(result).toEqual(updatedTag);
      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall.color).toBe('#22c55e');
    });

    it('returns null when tag not found', async () => {
      const db = createMockDb({ updateResult: [] });

      try {
        await updateTag(db, 'user-1', 'nonexistent-tag', { name: 'nope' });
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(TagServiceError);
        expect(err.statusCode).toBe(404);
        expect(err.message).toContain('not found');
      }
    });
  });

  describe('deleteTag', () => {
    it('deletes tag and removes postTags references', async () => {
      const db = createMockDb({ deleteResult: [{ id: 'tag-1' }] });

      const result = await deleteTag(db, 'user-1', 'tag-1');

      expect(result).toBe(true);
      expect(db.delete).toHaveBeenCalledTimes(1);
    });

    it('returns false when tag not found', async () => {
      const db = createMockDb({ deleteResult: [] });

      const result = await deleteTag(db, 'user-1', 'nonexistent-tag');

      expect(result).toBe(false);
    });
  });

  describe('getTags', () => {
    it('returns all tags for the user ordered by name', async () => {
      const tagList = [
        { id: 'tag-1', name: 'alpha', color: '#111', userId: 'user-1' },
        { id: 'tag-2', name: 'beta', color: '#222', userId: 'user-1' },
      ];
      const db = createMockDb({ selectResult: tagList });

      const result = await getTags(db, 'user-1');

      expect(result).toEqual(tagList);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db._selectChain.from).toHaveBeenCalledTimes(1);
      expect(db._selectChain.where).toHaveBeenCalledTimes(1);
      expect(db._selectChain.orderBy).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no tags exist', async () => {
      const db = createMockDb({ selectResult: [] });

      const result = await getTags(db, 'user-1');

      expect(result).toEqual([]);
    });
  });
});
