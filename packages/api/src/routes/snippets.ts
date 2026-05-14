import { Router, type Request, type Response } from 'express';
import { createSnippetSchema, updateSnippetSchema } from '@sms/shared';
import type { Db } from '@sms/db';

import {
  createSnippet,
  deleteSnippet,
  getSnippetById,
  getSnippets,
  SnippetServiceError,
  updateSnippet,
} from '../services/snippet.service.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { validateUuidParam } from '../middleware/validation.js';

interface SnippetsDependencies {
  db: Db;
}

function handleSnippetServiceError(err: unknown, res: Response): boolean {
  if (err instanceof SnippetServiceError) {
    res.status(err.statusCode).json({ error: err.message });
    return true;
  }

  return false;
}

export function createSnippetsRouter({ db }: SnippetsDependencies): Router {
  const router = Router();

  router.get('/api/snippets', requireAuth, async (req: Request, res: Response) => {
    const snippetList = await getSnippets(db, req.session.userId!);
    res.json(snippetList);
  });

  router.post('/api/snippets', requireAuth, async (req: Request, res: Response) => {
    const parsed = createSnippetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    try {
      const snippet = await createSnippet(db, req.session.userId!, parsed.data);
      res.status(201).json(snippet);
    } catch (err: unknown) {
      if (handleSnippetServiceError(err, res)) {
        return;
      }
      throw err;
    }
  });

  router.get('/api/snippets/:id', requireAuth, async (req: Request, res: Response) => {
    const snippetId = validateUuidParam(req.params.id as string);

    try {
      const snippet = await getSnippetById(db, req.session.userId!, snippetId);
      res.json(snippet);
    } catch (err: unknown) {
      if (handleSnippetServiceError(err, res)) {
        return;
      }
      throw err;
    }
  });

  router.patch('/api/snippets/:id', requireAuth, async (req: Request, res: Response) => {
    const snippetId = validateUuidParam(req.params.id as string);
    const parsed = updateSnippetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    try {
      const snippet = await updateSnippet(db, req.session.userId!, snippetId, parsed.data);
      res.json(snippet);
    } catch (err: unknown) {
      if (handleSnippetServiceError(err, res)) {
        return;
      }
      throw err;
    }
  });

  router.delete('/api/snippets/:id', requireAuth, async (req: Request, res: Response) => {
    const snippetId = validateUuidParam(req.params.id as string);

    try {
      await deleteSnippet(db, req.session.userId!, snippetId);
      res.status(204).end();
    } catch (err: unknown) {
      if (handleSnippetServiceError(err, res)) {
        return;
      }
      throw err;
    }
  });

  return router;
}
