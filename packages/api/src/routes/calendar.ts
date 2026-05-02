import { Router, type Request, type Response } from 'express';
import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { calendarQuerySchema } from '@sms/shared';
import type { Db } from '@sms/db';
import { postTags, posts, socialProfiles } from '@sms/db';

import { checkConflicts } from '../services/post.service.js';
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

    const events = await Promise.all(eventRows.map(async (eventRow) => {
      if (!eventRow.profileId || !eventRow.scheduledAt) {
        throw new Error('Calendar query returned a row without profileId or scheduledAt.');
      }

      const conflicts = await checkConflicts(
        db,
        userId,
        eventRow.profileId,
        eventRow.scheduledAt.toISOString(),
        eventRow.id,
      );

      return {
        id: eventRow.id,
        platform: eventRow.platform,
        profileId: eventRow.profileId,
        profileDisplayName: eventRow.profileDisplayName ?? eventRow.profileHandle ?? '',
        status: eventRow.status,
        scheduledAt: eventRow.scheduledAt.toISOString(),
        textPreview: eventRow.text.slice(0, 60),
        hasConflict: conflicts.length > 0,
      };
    }));

    res.json({ events });
  });

  return router;
}
