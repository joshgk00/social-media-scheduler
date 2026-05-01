import { posts } from '../../schema/posts.js';
import type { Db } from '../../client.js';

export async function seedBulkOperationRow(
  _db: Db,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return {
    id: '00000000-0000-4000-8000-000000000101',
    userId: '00000000-0000-4000-8000-000000000102',
    operationType: 'bulk.queue-randomize',
    targetKind: 'queue',
    status: 'queued',
    successCount: 0,
    failureCount: 0,
    ...overrides,
  };
}

export async function seedPausedPost(
  db: Db,
  overrides: Partial<typeof posts.$inferInsert> = {},
): Promise<typeof posts.$inferSelect | undefined> {
  const insertedPosts = await db
    .insert(posts)
    .values({
      userId: '00000000-0000-4000-8000-000000000102',
      profileId: '00000000-0000-4000-8000-000000000103',
      platform: 'twitter',
      text: 'Paused post fixture',
      status: 'paused',
      scheduledAt: new Date('2026-05-01T14:00:00Z'),
      ...overrides,
    })
    .returning();

  return insertedPosts[0];
}
