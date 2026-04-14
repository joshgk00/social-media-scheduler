// Auto-destruct lifecycle service. Three-phase pattern mirroring
// post-lifecycle.service.ts:
//
//   Phase 1 (transaction): Lock post row, verify status='published',
//           transition to 'auto_destructing', load social profile.
//   Phase 2 (outside tx): Call the platform delete API. Uses the
//           platformPostId from the JOB PAYLOAD, not the DB row
//           (RESEARCH.md Pitfall 1: recycling may overwrite the row).
//   Phase 3 (commit): Update post to 'destroyed' with destroyedAt.
//
// On delete failure (non-404): sets failureReason, leaves post in
// 'auto_destructing', rethrows for BullMQ retry (D-12).

import { sql, eq } from 'drizzle-orm';
import { ApiResponseError } from 'twitter-api-v2';
import { posts, socialProfiles } from '@sms/db';
import { transitionPost } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { WorkerDb } from './db.js';

const logger = createLogger('auto-destruct-lifecycle');

export interface AutoDestructArgs {
  postId: string;
  platformPostId: string;
  correlationId: string;
  callDelete: (
    profile: typeof socialProfiles.$inferSelect,
    platformPostId: string,
  ) => Promise<{ deleted: boolean }>;
}

interface LockedAutoDestructRow extends Record<string, unknown> {
  id: string;
  status: string;
  profile_id: string | null;
  platform_post_id: string | null;
}

export async function autoDestructPost(
  db: WorkerDb,
  args: AutoDestructArgs,
): Promise<void> {
  const lifecycleLogger = logger.child({
    postId: args.postId,
    platformPostId: args.platformPostId,
    correlationId: args.correlationId,
  });

  // PHASE 1: Lock, verify, transition to auto_destructing
  let profile: typeof socialProfiles.$inferSelect;

  const txResult = await db.transaction(async (tx) => {
    // Lock held for duration of this transaction only. If concurrent
    // destruct jobs target the same post, the second job waits for lock
    // release then fails the status check.
    const lockedRows = await tx.execute<LockedAutoDestructRow>(sql`
      SELECT id, status, profile_id, platform_post_id
        FROM posts
       WHERE id = ${args.postId}
         FOR UPDATE
    `);

    const lockedRowsArray = Array.isArray(lockedRows)
      ? (lockedRows as LockedAutoDestructRow[])
      : ((lockedRows as unknown as { rows?: LockedAutoDestructRow[] }).rows ?? []);
    const [post] = lockedRowsArray;

    if (!post) {
      throw new Error(`Post ${args.postId} not found for auto-destruct`);
    }

    // Validate state transition: published -> auto_destructing
    transitionPost(post.status as Parameters<typeof transitionPost>[0], 'auto_destructing');

    if (!post.profile_id) {
      throw new Error(`Post ${args.postId} has no associated profile`);
    }

    // Load social profile for credentials
    const [loadedProfile] = await tx
      .select()
      .from(socialProfiles)
      .where(eq(socialProfiles.id, post.profile_id));

    if (!loadedProfile) {
      throw new Error(`Profile ${post.profile_id} not found for auto-destruct`);
    }

    // Transition to auto_destructing
    await tx
      .update(posts)
      .set({ status: 'auto_destructing', updatedAt: new Date() })
      .where(eq(posts.id, args.postId));

    return { profile: loadedProfile };
  });

  profile = txResult.profile;

  // PHASE 2: Call delete API OUTSIDE the transaction
  // Pitfall 1: Use platformPostId from JOB PAYLOAD, not from DB row
  try {
    await args.callDelete(profile, args.platformPostId);
  } catch (deleteErr) {
    lifecycleLogger.error({ err: deleteErr }, 'Auto-destruct delete call failed');

    // Set failureReason, leave in auto_destructing for retry
    await db
      .update(posts)
      .set({
        failureReason: deleteErr instanceof Error ? deleteErr.message : String(deleteErr),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, args.postId));

    // Error classification: 401/403 are credential failures that won't
    // resolve on retry -- throw immediately so BullMQ treats it as a
    // permanent failure. 429 and 5xx are transient -- rethrow to retry.
    if (deleteErr instanceof ApiResponseError) {
      const status = deleteErr.code;
      if (status === 401 || status === 403) {
        throw new Error(
          `Auto-destruct failed: credentials invalid or revoked (HTTP ${status})`,
        );
      }
    }

    throw deleteErr;
  }

  // PHASE 3: Commit -- transition to destroyed
  await db
    .update(posts)
    .set({
      status: 'destroyed',
      destroyedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(posts.id, args.postId));

  lifecycleLogger.info('Auto-destruct lifecycle completed -- post destroyed');
}
