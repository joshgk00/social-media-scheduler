import { Router } from 'express';
import { createQueueSchema, updateQueueSchema, queueQuerySchema } from '@sms/shared';
import type { Db } from '@sms/db';

import {
  createQueue,
  updateQueue,
  deleteQueue,
  getQueues,
  getQueueById,
  copyQueueConfig,
  addPostToQueue,
  removePostFromQueue,
  getQueuePosts,
  movePostUp,
  movePostDown,
  QueueServiceError,
} from '../services/queue.service.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { validateUuidParam } from '../middleware/validation.js';

interface QueuesDependencies {
  db: Db;
}

export function createQueuesRouter({ db }: QueuesDependencies) {
  const router = Router();

  router.get('/', requireAuth, async (req, res) => {
    const parsed = queueQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const queueList = await getQueues(db, req.session.userId!, parsed.data);
    res.json(queueList);
  });

  router.post('/', requireAuth, async (req, res) => {
    const parsed = createQueueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    try {
      const queue = await createQueue(db, req.session.userId!, parsed.data);
      res.status(201).json(queue);
    } catch (err: unknown) {
      if (err instanceof QueueServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.get('/:id', requireAuth, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const queue = await getQueueById(db, req.session.userId!, queueId);
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    res.json(queue);
  });

  router.put('/:id', requireAuth, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const parsed = updateQueueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    try {
      const queue = await updateQueue(db, req.session.userId!, queueId, parsed.data);
      res.json(queue);
    } catch (err: unknown) {
      if (err instanceof QueueServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    try {
      await deleteQueue(db, req.session.userId!, queueId);
      res.status(204).send();
    } catch (err: unknown) {
      if (err instanceof QueueServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.get('/:id/config', requireAuth, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    try {
      const config = await copyQueueConfig(db, req.session.userId!, queueId);
      res.json(config);
    } catch (err: unknown) {
      if (err instanceof QueueServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.get('/:id/posts', requireAuth, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    try {
      const queuePosts = await getQueuePosts(db, req.session.userId!, queueId);
      res.json(queuePosts);
    } catch (err: unknown) {
      if (err instanceof QueueServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.post('/:id/posts', requireAuth, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const postId = req.body?.postId;
    if (typeof postId !== 'string') {
      res.status(400).json({ error: 'postId is required' });
      return;
    }
    const validatedPostId = validateUuidParam(postId);

    try {
      await addPostToQueue(db, req.session.userId!, queueId, validatedPostId);
      res.status(201).json({ success: true });
    } catch (err: unknown) {
      if (err instanceof QueueServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.post('/:id/posts/:postId/move-up', requireAuth, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const postId = validateUuidParam(req.params.postId as string);

    try {
      await movePostUp(db, req.session.userId!, queueId, postId);
      res.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof QueueServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.post('/:id/posts/:postId/move-down', requireAuth, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const postId = validateUuidParam(req.params.postId as string);

    try {
      await movePostDown(db, req.session.userId!, queueId, postId);
      res.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof QueueServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.delete('/:id/posts/:postId', requireAuth, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const postId = validateUuidParam(req.params.postId as string);

    try {
      await removePostFromQueue(db, req.session.userId!, queueId, postId);
      res.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof QueueServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  return router;
}
