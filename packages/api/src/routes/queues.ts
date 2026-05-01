import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { and, eq, inArray } from 'drizzle-orm';
import {
  createQueueSchema,
  updateQueueSchema,
  queueQuerySchema,
  queueCopyInputSchema,
  queueDedupeInputSchema,
  queuePurgeInputSchema,
  queueRandomizeInputSchema,
  queueTextModifyInputSchema,
  JOB_NAMES,
} from '@sms/shared';
import type { Db } from '@sms/db';
import { bulkOperations, posts, postTags, queues, tags } from '@sms/db';

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
import { bulkOperationsLimiter, queueMutationLimiter } from '../middleware/rate-limiter.js';
import type { BulkOpsQueueService } from '../services/bulk-ops-queue.service.js';
import { beginCsvDownload, writeCsvRows } from '../services/bulk-export.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseIdempotencyKey(rawHeader: string | undefined): string | null {
  if (rawHeader === undefined) return randomUUID();
  const idempotencyKey = rawHeader.trim();
  return UUID_PATTERN.test(idempotencyKey) ? idempotencyKey : null;
}

function requestCorrelationId(req: { id?: string }): string {
  return req.id && UUID_PATTERN.test(req.id) ? req.id : randomUUID();
}

interface QueuesDependencies {
  db: Db;
  bulkOpsQueueService?: BulkOpsQueueService;
}

export function createQueuesRouter({ db, bulkOpsQueueService }: QueuesDependencies) {
  const router = Router();

  async function loadTagNamesByPostId(postIds: string[]): Promise<Record<string, string>> {
    if (postIds.length === 0) return {};

    const tagRows = await db
      .select({
        postId: postTags.postId,
        name: tags.name,
      })
      .from(postTags)
      .innerJoin(tags, eq(postTags.tagId, tags.id))
      .where(inArray(postTags.postId, postIds));

    const tagNamesByPostId: Record<string, string[]> = {};
    for (const tagRow of tagRows) {
      tagNamesByPostId[tagRow.postId] ??= [];
      tagNamesByPostId[tagRow.postId].push(tagRow.name);
    }

    return Object.fromEntries(
      Object.entries(tagNamesByPostId).map(([postId, tagNames]) => [postId, tagNames.join(';')]),
    );
  }

  async function enqueueQueueBulkOperation(args: {
    userId: string;
    queueId: string;
    operationType: string;
    params: Record<string, unknown>;
    idempotencyKey: string;
    correlationId: string;
  }) {
    if (!bulkOpsQueueService) {
      throw new Error('Bulk operations queue is not configured');
    }
    const [existingBulkOperation] = await db
      .select({ id: bulkOperations.id })
      .from(bulkOperations)
      .where(and(
        eq(bulkOperations.userId, args.userId),
        eq(bulkOperations.idempotencyKey, args.idempotencyKey),
      ));
    if (existingBulkOperation) {
      return { bulkOperationId: existingBulkOperation.id, jobId: null, replay: true };
    }

    const [bulkOperation] = await db
      .insert(bulkOperations)
      .values({
        userId: args.userId,
        operationType: args.operationType,
        targetKind: 'queue',
        targetId: args.queueId,
        idempotencyKey: args.idempotencyKey,
        payload: args.params,
      })
      .returning();
    const job = await bulkOpsQueueService.enqueueBulkOp(
      args.operationType as typeof JOB_NAMES[keyof typeof JOB_NAMES],
      {
        bulkOperationId: bulkOperation.id,
        userId: args.userId,
        operationType: args.operationType,
        targetKind: 'queue',
        targetId: args.queueId,
        idempotencyKey: args.idempotencyKey,
        params: args.params,
        correlationId: args.correlationId,
      },
      Math.floor(Date.now() / 1000),
    );
    return { bulkOperationId: bulkOperation.id, jobId: job.id };
  }

  async function loadOwnedQueue(userId: string, queueId: string) {
    const [queue] = await db
      .select({ id: queues.id, name: queues.name, userId: queues.userId })
      .from(queues)
      .where(and(eq(queues.id, queueId), eq(queues.userId, userId)));
    return queue;
  }

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

  router.get('/:id/posts.csv', requireAuth, bulkOperationsLimiter, async (req, res) => {
    const queueId = validateUuidParam(req.params.id as string);
    const userId = req.session.userId!;
    const queue = await loadOwnedQueue(userId, queueId);
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    const rows = await db
      .select({
        id: posts.id,
        text: posts.text,
        status: posts.status,
        queue_position: posts.queuePosition,
        notes: posts.notes,
      })
      .from(posts)
      .where(and(eq(posts.userId, userId), eq(posts.queueId, queueId)));
    const tagNamesByPostId = await loadTagNamesByPostId(rows.map((row) => row.id));
    const csvRows = rows.map((row) => ({
      ...row,
      tags: tagNamesByPostId[row.id] ?? '',
    }));
    beginCsvDownload(res, `queue-${queueId}-posts-${DateTime.utc().toFormat('yyyy-LL-dd')}.csv`);
    await writeCsvRows(res, ['id', 'text', 'status', 'queue_position', 'tags', 'notes'], csvRows);
  });

  router.post('/:id/randomize', requireAuth, bulkOperationsLimiter, async (req, res) => {
    const idempotencyKey = parseIdempotencyKey(req.get('Idempotency-Key'));
    if (!idempotencyKey) {
      res.status(400).json({ error: 'Invalid Idempotency-Key header' });
      return;
    }
    const queueId = validateUuidParam(req.params.id as string);
    const parsed = queueRandomizeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const queue = await loadOwnedQueue(req.session.userId!, queueId);
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    const result = await enqueueQueueBulkOperation({
      userId: req.session.userId!,
      queueId,
      operationType: JOB_NAMES.bulkQueueRandomize,
      params: parsed.data,
      idempotencyKey,
      correlationId: requestCorrelationId(req as { id?: string }),
    });
    res.status(202).json(result);
  });

  router.post('/:id/purge', requireAuth, bulkOperationsLimiter, async (req, res) => {
    const idempotencyKey = parseIdempotencyKey(req.get('Idempotency-Key'));
    if (!idempotencyKey) {
      res.status(400).json({ error: 'Invalid Idempotency-Key header' });
      return;
    }
    const queueId = validateUuidParam(req.params.id as string);
    const parsed = queuePurgeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const queue = await loadOwnedQueue(req.session.userId!, queueId);
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    if (parsed.data.typedConfirmation !== queue.name) {
      res.status(400).json({ error: 'typedConfirmation_mismatch', expected: queue.name });
      return;
    }
    const result = await enqueueQueueBulkOperation({
      userId: req.session.userId!,
      queueId,
      operationType: JOB_NAMES.bulkQueuePurge,
      params: parsed.data,
      idempotencyKey,
      correlationId: requestCorrelationId(req as { id?: string }),
    });
    res.status(202).json(result);
  });

  router.post('/:id/copy', requireAuth, bulkOperationsLimiter, async (req, res) => {
    const idempotencyKey = parseIdempotencyKey(req.get('Idempotency-Key'));
    if (!idempotencyKey) {
      res.status(400).json({ error: 'Invalid Idempotency-Key header' });
      return;
    }
    const queueId = validateUuidParam(req.params.id as string);
    const parsed = queueCopyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const queue = await loadOwnedQueue(req.session.userId!, queueId);
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    const result = await enqueueQueueBulkOperation({
      userId: req.session.userId!,
      queueId,
      operationType: JOB_NAMES.bulkQueueCopy,
      params: parsed.data,
      idempotencyKey,
      correlationId: requestCorrelationId(req as { id?: string }),
    });
    res.status(202).json(result);
  });

  router.post('/:id/modify-text', requireAuth, bulkOperationsLimiter, async (req, res) => {
    const idempotencyKey = parseIdempotencyKey(req.get('Idempotency-Key'));
    if (!idempotencyKey) {
      res.status(400).json({ error: 'Invalid Idempotency-Key header' });
      return;
    }
    const queueId = validateUuidParam(req.params.id as string);
    const parsed = queueTextModifyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const queue = await loadOwnedQueue(req.session.userId!, queueId);
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    const result = await enqueueQueueBulkOperation({
      userId: req.session.userId!,
      queueId,
      operationType: JOB_NAMES.bulkQueueTextModify,
      params: parsed.data,
      idempotencyKey,
      correlationId: requestCorrelationId(req as { id?: string }),
    });
    res.status(202).json(result);
  });

  router.post('/:id/dedupe', requireAuth, bulkOperationsLimiter, async (req, res) => {
    const idempotencyKey = parseIdempotencyKey(req.get('Idempotency-Key'));
    if (!idempotencyKey) {
      res.status(400).json({ error: 'Invalid Idempotency-Key header' });
      return;
    }
    const queueId = validateUuidParam(req.params.id as string);
    const parsed = queueDedupeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const queue = await loadOwnedQueue(req.session.userId!, queueId);
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    const result = await enqueueQueueBulkOperation({
      userId: req.session.userId!,
      queueId,
      operationType: JOB_NAMES.bulkQueueDedupe,
      params: parsed.data,
      idempotencyKey,
      correlationId: requestCorrelationId(req as { id?: string }),
    });
    res.status(202).json(result);
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
