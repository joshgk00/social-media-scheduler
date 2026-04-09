import { Router } from 'express';
import { createTagSchema, updateTagSchema } from '@sms/shared';
import type { Db } from '@sms/db';

import {
  createTag,
  updateTag,
  deleteTag,
  getTags,
  TagServiceError,
} from '../services/tag.service.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { validateUuidParam } from '../middleware/validation.js';

interface TagsDependencies {
  db: Db;
}

export function createTagsRouter({ db }: TagsDependencies) {
  const router = Router();

  router.post('/api/tags', requireAuth, async (req, res) => {
    const parsed = createTagSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    try {
      const tag = await createTag(db, req.session.userId!, parsed.data);
      res.status(201).json(tag);
    } catch (err: unknown) {
      if (err instanceof TagServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.get('/api/tags', requireAuth, async (req, res) => {
    const tagList = await getTags(db, req.session.userId!);
    res.json(tagList);
  });

  router.patch('/api/tags/:id', requireAuth, async (req, res) => {
    const tagId = validateUuidParam(req.params.id as string);
    const parsed = updateTagSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    try {
      const updatedTag = await updateTag(db, req.session.userId!, tagId, parsed.data);
      res.json(updatedTag);
    } catch (err: unknown) {
      if (err instanceof TagServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.delete('/api/tags/:id', requireAuth, async (req, res) => {
    const tagId = validateUuidParam(req.params.id as string);
    const isDeleted = await deleteTag(db, req.session.userId!, tagId);
    if (!isDeleted) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }
    res.json({ success: true });
  });

  return router;
}
