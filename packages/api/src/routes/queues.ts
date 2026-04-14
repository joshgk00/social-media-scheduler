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
} from '../services/queue.service.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { validateUuidParam } from '../middleware/validation.js';
import { queueMutationLimiter } from '../middleware/rate-limiter.js';

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

  router.post('/', requireAuth, queueMutationLimiter, async (req, res) => {
    const parsed = createQueueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const queue = await createQueue(db, req.session.userId!, parsed.data);
    res.status(201).json(queue);
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

  router.put('/:id', requireAuth, queueMutationLimiter, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const parsed = updateQueueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const queue = await updateQueue(db, req.session.userId!, queueId, parsed.data);
    res.json(queue);
  });

  router.delete('/:id', requireAuth, queueMutationLimiter, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    await deleteQueue(db, req.session.userId!, queueId);
    res.status(204).send();
  });

  router.get('/:id/config', requireAuth, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const config = await copyQueueConfig(db, req.session.userId!, queueId);
    res.json(config);
  });

  router.get('/:id/posts', requireAuth, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const queuePosts = await getQueuePosts(db, req.session.userId!, queueId);
    res.json(queuePosts);
  });

  router.post('/:id/posts', requireAuth, queueMutationLimiter, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const postId = req.body?.postId;
    if (typeof postId !== 'string') {
      res.status(400).json({ error: 'postId is required' });
      return;
    }
    try {
      validateUuidParam(postId);
    } catch {
      res.status(400).json({ error: 'Invalid postId format' });
      return;
    }

    await addPostToQueue(db, req.session.userId!, queueId, postId);
    res.status(201).json({ success: true });
  });

  router.post('/:id/posts/:postId/move-up', requireAuth, queueMutationLimiter, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const postId = validateUuidParam(req.params.postId as string);

    await movePostUp(db, req.session.userId!, queueId, postId);
    res.json({ success: true });
  });

  router.post('/:id/posts/:postId/move-down', requireAuth, queueMutationLimiter, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const postId = validateUuidParam(req.params.postId as string);

    await movePostDown(db, req.session.userId!, queueId, postId);
    res.json({ success: true });
  });

  router.delete('/:id/posts/:postId', requireAuth, queueMutationLimiter, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const postId = validateUuidParam(req.params.postId as string);

    await removePostFromQueue(db, req.session.userId!, queueId, postId);
    res.json({ success: true });
  });

  return router;
}
