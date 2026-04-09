import { eq, and, asc } from 'drizzle-orm';
import type { Db } from '@sms/db';
import { tags } from '@sms/db';
import { AppError } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';

const logger = createLogger('tag-service');

// Subclass exists so structured logs show 'TagServiceError' instead of 'AppError'.
// All behavior comes from AppError; the subclass adds no fields or methods.
export class TagServiceError extends AppError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
  }
}

interface CreateTagInput {
  name: string;
  color?: string;
}

interface UpdateTagInput {
  name?: string;
  color?: string;
}

export async function createTag(db: Db, userId: string, input: CreateTagInput) {
  try {
    const [tag] = await db.insert(tags).values({
      userId,
      name: input.name,
      color: input.color ?? '#6b7280',
    }).returning();

    logger.info({ tagId: tag.id, userId }, 'Tag created');

    return tag;
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw new TagServiceError('A tag with this name already exists.', 409);
    }
    logger.error({ err, userId }, 'Failed to create tag');
    throw err;
  }
}

export async function updateTag(
  db: Db,
  userId: string,
  tagId: string,
  input: UpdateTagInput,
) {
  const updateFields: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updateFields.name = input.name;
  if (input.color !== undefined) updateFields.color = input.color;

  try {
    const updatedRows = await db.update(tags)
      .set(updateFields)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .returning();

    if (updatedRows.length === 0) {
      throw new TagServiceError('Tag not found', 404);
    }

    logger.info({ tagId, userId }, 'Tag updated');

    return updatedRows[0];
  } catch (err: unknown) {
    if (err instanceof TagServiceError) throw err;
    if (isUniqueViolation(err)) {
      throw new TagServiceError('A tag with this name already exists.', 409);
    }
    logger.error({ err, tagId, userId }, 'Failed to update tag');
    throw err;
  }
}

export async function deleteTag(
  db: Db,
  userId: string,
  tagId: string,
): Promise<boolean> {
  const deletedRows = await db.delete(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
    .returning({ id: tags.id });

  if (deletedRows.length > 0) {
    logger.info({ tagId, userId }, 'Tag deleted');
  }

  return deletedRows.length > 0;
}

export async function getTags(db: Db, userId: string) {
  return db
    .select()
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(asc(tags.name));
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === '23505') return true;
  const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
  return causeCode === '23505';
}
