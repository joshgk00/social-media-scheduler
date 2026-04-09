import { Router } from 'express';
import { createProfileSchema } from '@sms/shared';
import type { Db } from '@sms/db';

import {
  createProfile,
  getProfiles,
  getProfileById,
  deleteProfile,
  ProfileServiceError,
} from '../services/profile.service.js';
import { requireAuth } from '../middleware/auth-guard.js';

interface ProfilesDependencies {
  db: Db;
}

export function createProfilesRouter({ db }: ProfilesDependencies) {
  const router = Router();

  router.post('/api/profiles', requireAuth, async (req, res) => {
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
    const profileId = req.params.id as string;
    const profile = await getProfileById(db, req.session.userId!, profileId);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json(profile);
  });

  router.delete('/api/profiles/:id', requireAuth, async (req, res) => {
    const profileId = req.params.id as string;
    const isDeleted = await deleteProfile(db, req.session.userId!, profileId);
    if (!isDeleted) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ success: true });
  });

  return router;
}
