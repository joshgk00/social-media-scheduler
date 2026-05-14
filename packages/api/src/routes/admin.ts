import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Queue } from 'bullmq';

import { requireAuth } from '../middleware/auth-guard.js';

export interface AdminRouterDeps {
  publishQueue: Queue;
  notificationQueue: Queue;
  bulkOpsQueue?: Queue;
}

// Bull-Board operator dashboard mounted at /admin/queues.
//
// Middleware order:
//   1. `requireAuth` runs first so an unauthenticated request returns 401
//      before any queue data is read.
//   2. The Bull-Board ExpressAdapter router is attached underneath so both
//      the dashboard HTML and its internal POST endpoints are session-gated.
//
// CSRF exception (T-04-04-07): this router is mounted BEFORE the global
// `doubleCsrfProtection` middleware in `app.ts` because Bull-Board does not
// send double-submit tokens on its own POSTs (retry, promote, clean). The
// exception is accepted because the app is single-user and the path is an
// operator tool — documented in RESEARCH.md Pitfall 6.
export function createAdminRouter({
  publishQueue,
  notificationQueue,
  bulkOpsQueue,
}: AdminRouterDeps): Router {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(publishQueue),
      new BullMQAdapter(notificationQueue),
      ...(bulkOpsQueue ? [new BullMQAdapter(bulkOpsQueue)] : []),
    ],
    serverAdapter,
  });

  const router = Router();
  router.use('/admin/queues', requireAuth, serverAdapter.getRouter());
  return router;
}
