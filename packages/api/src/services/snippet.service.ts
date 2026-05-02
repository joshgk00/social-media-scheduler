import { eq, and, asc } from 'drizzle-orm';
import type { Db } from '@sms/db';
import { snippets } from '@sms/db';
import {
  AppError,
  type CreateSnippetInput,
  type UpdateSnippetInput,
} from '@sms/shared';
import { createLogger } from '@sms/shared/logger';

const logger = createLogger('snippet-service');

type Snippet = typeof snippets.$inferSelect;

export class SnippetServiceError extends AppError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
  }
}

export async function createSnippet(
  db: Db,
  userId: string,
  input: CreateSnippetInput,
): Promise<Snippet> {
  try {
    const [snippet] = await db
      .insert(snippets)
      .values({
        userId,
        name: input.name,
        category: input.category,
        body: input.body,
      })
      .returning();

    logger.info({ snippetId: snippet.id, userId }, 'Snippet created');
    return snippet;
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw new SnippetServiceError('A snippet with that name already exists.', 409);
    }

    logger.error({ err, userId }, 'Failed to create snippet');
    throw err;
  }
}

export async function getSnippets(db: Db, userId: string): Promise<Snippet[]> {
  return db
    .select()
    .from(snippets)
    .where(eq(snippets.userId, userId))
    .orderBy(asc(snippets.name));
}

export async function getSnippetById(
  db: Db,
  userId: string,
  snippetId: string,
): Promise<Snippet> {
  const snippetRows = await db
    .select()
    .from(snippets)
    .where(and(eq(snippets.id, snippetId), eq(snippets.userId, userId)));

  if (snippetRows.length === 0) {
    throw new SnippetServiceError('Snippet not found', 404);
  }

  return snippetRows[0];
}

export async function updateSnippet(
  db: Db,
  userId: string,
  snippetId: string,
  input: UpdateSnippetInput,
): Promise<Snippet> {
  const updateFields: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateFields.name = input.name;
  if (input.category !== undefined) updateFields.category = input.category;
  if (input.body !== undefined) updateFields.body = input.body;

  try {
    const updatedRows = await db
      .update(snippets)
      .set(updateFields)
      .where(and(eq(snippets.id, snippetId), eq(snippets.userId, userId)))
      .returning();

    if (updatedRows.length === 0) {
      throw new SnippetServiceError('Snippet not found', 404);
    }

    logger.info({ snippetId, userId }, 'Snippet updated');
    return updatedRows[0];
  } catch (err: unknown) {
    if (err instanceof SnippetServiceError) {
      throw err;
    }
    if (isUniqueViolation(err)) {
      throw new SnippetServiceError('A snippet with that name already exists.', 409);
    }

    logger.error({ err, snippetId, userId }, 'Failed to update snippet');
    throw err;
  }
}

export async function deleteSnippet(
  db: Db,
  userId: string,
  snippetId: string,
): Promise<void> {
  const deletedRows = await db
    .delete(snippets)
    .where(and(eq(snippets.id, snippetId), eq(snippets.userId, userId)))
    .returning({ id: snippets.id });

  if (deletedRows.length === 0) {
    throw new SnippetServiceError('Snippet not found', 404);
  }

  logger.info({ snippetId, userId }, 'Snippet deleted');
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === '23505') return true;
  const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
  return causeCode === '23505';
}
