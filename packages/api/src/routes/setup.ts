import { Router } from 'express';
import { setupSchema } from '@sms/shared';
import { createUser, userExists } from '../services/auth.service.js';
import type { Db } from '@sms/db';

interface SetupDependencies {
  db: Db;
}

export function createSetupRouter({ db }: SetupDependencies) {
  const router = Router();

  router.get('/api/auth/setup-status', async (_req, res) => {
    const exists = await userExists(db);
    res.json({ needsSetup: !exists });
  });

  router.post('/api/auth/setup', async (req, res) => {
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { email, password, timezone } = parsed.data;

    const exists = await userExists(db);
    if (exists) {
      res.status(403).json({ error: 'Account already exists.' });
      return;
    }

    try {
      await createUser(db, { email, password, timezone });
      res.status(201).json({ success: true });
    } catch (err: unknown) {
      // DB unique constraint violation (race condition guard)
      if (err instanceof Error && 'code' in err && (err as any).code === '23505') {
        res.status(403).json({ error: 'Account already exists.' });
        return;
      }
      throw err;
    }
  });

  return router;
}
