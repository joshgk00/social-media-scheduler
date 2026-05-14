import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../../__tests__/helpers/mock-db.js';
import {
  createSnippet,
  deleteSnippet,
  getSnippetById,
  getSnippets,
  SnippetServiceError,
  updateSnippet,
} from '../snippet.service.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SNIPPET_ID = '22222222-2222-2222-2222-222222222222';

describe('snippet.service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createSnippet returns the inserted row', async () => {
    const db = createMockDb();
    const insertedSnippet = {
      id: SNIPPET_ID,
      userId: USER_ID,
      name: 'Promo Block',
      category: 'text',
      body: 'Launch today',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([insertedSnippet]),
      }),
    });

    await expect(
      createSnippet(db, USER_ID, {
        name: 'Promo Block',
        category: 'text',
        body: 'Launch today',
      }),
    ).resolves.toEqual(insertedSnippet);
  });

  it('createSnippet throws 409 on direct 23505 unique violation', async () => {
    const db = createMockDb();
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue({ code: '23505' }),
      }),
    });

    await expect(
      createSnippet(db, USER_ID, {
        name: 'Promo Block',
        category: 'text',
        body: 'Launch today',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'A snippet with that name already exists.',
    });
  });

  it('createSnippet throws 409 on wrapped 23505 unique violation', async () => {
    const db = createMockDb();
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue({ cause: { code: '23505' } }),
      }),
    });

    await expect(
      createSnippet(db, USER_ID, {
        name: 'Promo Block',
        category: 'text',
        body: 'Launch today',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'A snippet with that name already exists.',
    });
  });

  it('getSnippets returns rows for the caller ordered by name', async () => {
    const db = createMockDb();
    const snippetRows = [
      {
        id: SNIPPET_ID,
        userId: USER_ID,
        name: 'A',
        category: 'text',
        body: 'one',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const where = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue(snippetRows),
    });

    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where }),
    });

    await expect(getSnippets(db, USER_ID)).resolves.toEqual(snippetRows);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('getSnippetById throws 404 when no row matches', async () => {
    const db = createMockDb();
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    await expect(getSnippetById(db, USER_ID, SNIPPET_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Snippet not found',
    });
  });

  it('updateSnippet throws 404 when zero rows are updated', async () => {
    const db = createMockDb();
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    await expect(
      updateSnippet(db, USER_ID, SNIPPET_ID, { body: 'Updated' }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Snippet not found',
    });
  });

  it('deleteSnippet throws 404 when zero rows are deleted', async () => {
    const db = createMockDb();
    db.delete = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });

    await expect(deleteSnippet(db, USER_ID, SNIPPET_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Snippet not found',
    });
  });
});
