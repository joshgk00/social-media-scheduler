import { Router } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { Queue } from "bullmq";

import { requireAuth } from "../middleware/auth-guard.js";

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
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [
      new BullMQAdapter(publishQueue),
      new BullMQAdapter(notificationQueue),
      ...(bulkOpsQueue ? [new BullMQAdapter(bulkOpsQueue)] : []),
    ],
    serverAdapter,
  });

  const router = Router();
  router.get("/admin/queue-health", requireAuth, async (_req, res, next) => {
    try {
      const [publish, notification, bulkOps] = await Promise.all([
        publishQueue.getJobCounts("active", "completed", "failed"),
        notificationQueue.getJobCounts("active", "completed", "failed"),
        bulkOpsQueue?.getJobCounts("active", "completed", "failed") ??
          Promise.resolve({ active: 0, completed: 0, failed: 0 }),
      ]);

      res.json({
        publish,
        notification,
        bulk_ops: bulkOps,
      });
    } catch (error) {
      next(error);
    }
  });

  router.use(
    "/admin/queues",
    (_req, res, next) => {
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'self'",
      );
      next();
    },
    requireAuth,
    serverAdapter.getRouter(),
  );
  return router;
}
