import { Router } from 'express';
import {
  createPostSchema,
  updatePostSchema,
  postQuerySchema,
  conflictCheckSchema,
} from '@sms/shared';
import type { Db } from '@sms/db';

import {
  createPost,
  updatePost,
  deletePost,
  getPostById,
  getPosts,
  checkConflicts,
  PostServiceError,
} from '../services/post.service.js';
import { requireAuth } from '../middleware/auth-guard.js';

interface PostsDependencies {
  db: Db;
}

export function createPostsRouter({ db }: PostsDependencies) {
  const router = Router();

  router.post('/api/posts', requireAuth, async (req, res) => {
    const parsed = createPostSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    try {
      const post = await createPost(db, req.session.userId!, parsed.data);
      res.status(201).json(post);
    } catch (err: unknown) {
      if (err instanceof PostServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.get('/api/posts', requireAuth, async (req, res) => {
    const parsed = postQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const postResults = await getPosts(db, req.session.userId!, parsed.data);
    res.json(postResults);
  });

  router.get('/api/posts/conflicts', requireAuth, async (req, res) => {
    const parsed = conflictCheckSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const conflicts = await checkConflicts(
      db,
      req.session.userId!,
      parsed.data.profileId,
      parsed.data.scheduledAt,
      parsed.data.excludePostId,
    );
    res.json(conflicts);
  });

  router.get('/api/posts/:id', requireAuth, async (req, res) => {
    const postId = req.params.id as string;
    const post = await getPostById(db, req.session.userId!, postId);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json(post);
  });

  router.put('/api/posts/:id', requireAuth, async (req, res) => {
    const postId = req.params.id as string;
    const parsed = updatePostSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    try {
      const updatedPost = await updatePost(db, req.session.userId!, postId, parsed.data);
      res.json(updatedPost);
    } catch (err: unknown) {
      if (err instanceof PostServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.delete('/api/posts/:id', requireAuth, async (req, res) => {
    const postId = req.params.id as string;
    try {
      await deletePost(db, req.session.userId!, postId);
      res.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof PostServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  return router;
}
