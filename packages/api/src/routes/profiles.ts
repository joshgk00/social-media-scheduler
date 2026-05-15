import { randomUUID } from 'node:crypto';
import { Router, type NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import {
  createProfileSchema,
  rateLimitUpdateSchema,
  updateProfileMetadataSchema,
} from '@sms/shared';
import type { Db } from '@sms/db';
import { socialProfiles } from '@sms/db';
import { createLogger } from '@sms/shared/logger';

import {
  createProfile,
  getProfiles,
  getProfileById,
  deleteProfile,
  updateProfileMetadata,
  getDeletePreview,
  ProfileServiceError,
} from '../services/profile.service.js';
import { checkTwitterBudgetWithDb } from '../services/rate-limit.service.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { profileLimiter } from '../middleware/rate-limiter.js';
import { validateUuidParam } from '../middleware/validation.js';

const logger = createLogger('profiles-router');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requestCorrelationId(req: { id?: string }): string {
  return req.id && UUID_PATTERN.test(req.id) ? req.id : randomUUID();
}

interface ProfilesDependencies {
  db: Db;
}

export function createProfilesRouter({ db }: ProfilesDependencies) {
  const router = Router();

  router.post('/api/profiles', requireAuth, profileLimiter, async (req, res) => {
    const parsed = createProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    try {
      const profile = await createProfile(db, req.session.userId!, parsed.data);
      res.status(201).json(profile);
    } catch (err: unknown) {
      if (err instanceof ProfileServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.get('/api/profiles', requireAuth, async (req, res) => {
    const profiles = await getProfiles(db, req.session.userId!);
    res.json(profiles);
  });

  router.get('/api/profiles/:id', requireAuth, async (req, res) => {
    const profileId = validateUuidParam(req.params.id as string);
    const profile = await getProfileById(db, req.session.userId!, profileId);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json(profile);
  });

  router.delete('/api/profiles/:id', requireAuth, async (req, res, next: NextFunction) => {
    const profileId = validateUuidParam(req.params.id as string);
    const userId = req.session.userId!;
    try {
      const isDeleted = await deleteProfile(db, userId, profileId);
      if (!isDeleted) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }
      res.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof ProfileServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      const correlationId = requestCorrelationId(req as { id?: string });
      (req as { id?: string }).id = correlationId;
      logger.error(
        { err, profileId, userId, correlationId },
        'Profile delete failed',
      );
      next(new ProfileServiceError(
        'Could not delete profile. Try again or contact support with this request ID.',
        500,
        'profile_delete_failed',
      ));
    }
  });

  // PATCH /api/profiles/:id — rename + Markdown notes.
  // `updateProfileMetadataSchema.strict()` rejects unknown keys so an attacker
  // cannot sneak `userId` or token fields into the UPDATE (T-07-11).
  // Ownership lives in the UPDATE WHERE clause inside updateProfileMetadata
  // (no read-before-write race, T-07-06). CSRF is enforced by the
  // `doubleCsrfProtection` middleware already mounted in app.ts.
  router.patch('/api/profiles/:id', requireAuth, async (req, res) => {
    const profileId = validateUuidParam(req.params.id as string);
    const userId = req.session.userId!;

    const parsed = updateProfileMetadataSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
      return;
    }

    try {
      const refreshed = await updateProfileMetadata(db, {
        userId,
        profileId,
        displayName: parsed.data.displayName,
        notes: parsed.data.notes,
      });
      res.json(refreshed);
    } catch (err: unknown) {
      if (err instanceof ProfileServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // GET /api/profiles/:id/delete-preview — cascade count summary for the
  // confirm-delete dialog. Returns all zeros when the profile has no related
  // posts/queues/tags; the endpoint is idempotent and never 404s so the
  // dialog can open before the user commits to deletion.
  router.get('/api/profiles/:id/delete-preview', requireAuth, async (req, res) => {
    const profileId = validateUuidParam(req.params.id as string);
    const userId = req.session.userId!;

    const preview = await getDeletePreview(db, userId, profileId);
    res.json(preview);
  });

  // GET /api/profiles/:id/rate-limit — return the current Twitter budget
  // snapshot for the profile. Ownership is enforced via an explicit
  // SELECT WHERE user_id = ? so a cross-user request returns 404
  // (T-04-04-03 mitigation — never leaks existence).
  router.get('/api/profiles/:id/rate-limit', requireAuth, async (req, res) => {
    const profileId = validateUuidParam(req.params.id as string);
    const userId = req.session.userId!;

    const [ownedProfile] = await db
      .select({ id: socialProfiles.id })
      .from(socialProfiles)
      .where(
        and(
          eq(socialProfiles.id, profileId),
          eq(socialProfiles.userId, userId),
        ),
      );

    if (!ownedProfile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const state = await checkTwitterBudgetWithDb(db, {
      profileId,
      additionalPostCount: 0,
    });

    res.json({
      profileId,
      currentCount: state.currentUsage,
      budget: state.budget,
      warnThresholdPercent: state.warnThresholdPercent,
      warnThresholdHit: state.warnThresholdHit,
      blockThresholdHit: state.blockThresholdHit,
      monthStartUtc: state.monthStartUtc.toISOString(),
    });
  });

  // PATCH /api/profiles/:id/rate-limit — update monthly budget and warn
  // threshold. Ownership lives in the UPDATE WHERE clause (no
  // read-before-write race). `rateLimitUpdateSchema.strict()` rejects
  // unknown keys so an attacker cannot sneak `userId` or
  // `tokenEncryptionVersion` into the UPDATE (T-04-04-04).
  router.patch('/api/profiles/:id/rate-limit', requireAuth, async (req, res) => {
    const profileId = validateUuidParam(req.params.id as string);
    const userId = req.session.userId!;

    const parsed = rateLimitUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
      return;
    }

    const updatedRows = await db
      .update(socialProfiles)
      .set({
        monthlyTweetBudget: parsed.data.monthlyTweetBudget,
        warnThresholdPercent: parsed.data.warnThresholdPercent,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(socialProfiles.id, profileId),
          eq(socialProfiles.userId, userId),
        ),
      )
      .returning({ id: socialProfiles.id });

    if (updatedRows.length === 0) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const state = await checkTwitterBudgetWithDb(db, {
      profileId,
      additionalPostCount: 0,
    });

    res.json({
      profileId,
      currentCount: state.currentUsage,
      budget: state.budget,
      warnThresholdPercent: state.warnThresholdPercent,
      warnThresholdHit: state.warnThresholdHit,
      blockThresholdHit: state.blockThresholdHit,
      monthStartUtc: state.monthStartUtc.toISOString(),
    });
  });

  return router;
}
