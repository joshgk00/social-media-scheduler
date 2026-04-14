import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { createProfileSchema, rateLimitUpdateSchema } from '@sms/shared';
import type { Db } from '@sms/db';
import { socialProfiles } from '@sms/db';

import {
  createProfile,
  getProfiles,
  getProfileById,
  deleteProfile,
  ProfileServiceError,
} from '../services/profile.service.js';
import { checkTwitterBudgetWithDb } from '../services/rate-limit.service.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { profileLimiter } from '../middleware/rate-limiter.js';
import { validateUuidParam } from '../middleware/validation.js';

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

  router.delete('/api/profiles/:id', requireAuth, async (req, res) => {
    const profileId = validateUuidParam(req.params.id as string);
    try {
      const isDeleted = await deleteProfile(db, req.session.userId!, profileId);
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
      throw err;
    }
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
