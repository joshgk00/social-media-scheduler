import { Router, type Request, type Response } from 'express';
import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { calendarQuerySchema } from '@sms/shared';
import type { Db } from '@sms/db';
import { postTags, posts, socialProfiles } from '@sms/db';

import { requireAuth } from '../middleware/auth-guard.js';

interface CalendarDependencies {
  db: Db;
}

function normalizeQueryArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  return typeof value === 'string' ? [value] : undefined;
}

export function createCalendarRouter({ db }: CalendarDependencies): Router {
  const router = Router();

  router.get('/api/calendar', requireAuth, async (req: Request, res: Response) => {
    const parsed = calendarQuerySchema.safeParse({
      ...req.query,
      platforms: normalizeQueryArray(req.query.platforms),
      profileIds: normalizeQueryArray(req.query.profileIds),
      tagIds: normalizeQueryArray(req.query.tagIds),
    });
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const userId = req.session.userId!;
    const { from, to, scope, platforms, profileIds, tagIds, search } = parsed.data;
    const conditions = [
      eq(posts.userId, userId),
      isNotNull(posts.profileId),
      isNotNull(posts.scheduledAt),
      gte(posts.scheduledAt, new Date(from)),
      lte(posts.scheduledAt, new Date(to)),
    ];

    if (scope === 'scheduled') {
      conditions.push(eq(posts.status, 'scheduled'));
    } else if (scope === 'queued') {
      conditions.push(eq(posts.status, 'queued'));
    } else {
      conditions.push(inArray(posts.status, ['scheduled', 'queued', 'publishing']));
    }

    if (platforms && platforms.length > 0) {
      conditions.push(inArray(posts.platform, platforms));
    }

    if (profileIds && profileIds.length > 0) {
      conditions.push(inArray(posts.profileId, profileIds));
    }

    if (tagIds && tagIds.length > 0) {
      const postIdsWithTags = db
        .select({ postId: postTags.postId })
        .from(postTags)
        .where(inArray(postTags.tagId, tagIds));

      conditions.push(inArray(posts.id, postIdsWithTags));
    }

    if (search) {
      const tsQuery = sql`plainto_tsquery('english', ${search})`;
      conditions.push(sql`(${posts.searchVector} || ${posts.tagSearchVector}) @@ ${tsQuery}`);
    }

    const eventRows = await db
      .select({
        id: posts.id,
        platform: posts.platform,
        profileId: posts.profileId,
        profileDisplayName: socialProfiles.displayName,
        profileHandle: socialProfiles.handle,
        status: posts.status,
        scheduledAt: posts.scheduledAt,
        text: posts.text,
      })
      .from(posts)
      .leftJoin(socialProfiles, eq(posts.profileId, socialProfiles.id))
      .where(and(...conditions))
      .orderBy(asc(posts.scheduledAt), asc(posts.createdAt));

    const eventIds = eventRows.map((eventRow) => eventRow.id);
    const conflictingEventRows = eventIds.length > 0
      ? await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(
          eq(posts.userId, userId),
          inArray(posts.id, eventIds),
          sql`EXISTS (
            SELECT 1
            FROM posts AS conflict_posts
            WHERE conflict_posts.user_id = ${posts.userId}
              AND conflict_posts.profile_id = ${posts.profileId}
              AND conflict_posts.id <> ${posts.id}
              AND conflict_posts.status IN ('scheduled', 'queued', 'publishing')
              AND conflict_posts.scheduled_at >= ${posts.scheduledAt} - interval '5 minutes'
              AND conflict_posts.scheduled_at <= ${posts.scheduledAt} + interval '5 minutes'
          )`,
        ))
      : [];
    const conflictingEventIds = new Set(conflictingEventRows.map((eventRow) => eventRow.id));

    const events = eventRows.map((eventRow) => {
      if (!eventRow.profileId || !eventRow.scheduledAt) {
        throw new Error('Calendar query returned a row without profileId or scheduledAt.');
      }

      return {
        id: eventRow.id,
        platform: eventRow.platform,
        profileId: eventRow.profileId,
        profileDisplayName: eventRow.profileDisplayName ?? eventRow.profileHandle ?? '',
        status: eventRow.status,
        scheduledAt: eventRow.scheduledAt.toISOString(),
        textPreview: eventRow.text.slice(0, 60),
        hasConflict: conflictingEventIds.has(eventRow.id),
      };
    });

    res.json({ events });
  });

  return router;
}
