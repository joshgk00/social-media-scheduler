---
phase: 10
slug: bulk-operations
status: tracked
created_at: 2026-05-01
source: PR #40 review feedback
---

# Phase 10.1 Follow-ups

The Phase 10 PR review closed with no merge-blocking behavior bugs, but it identified several follow-up buckets that should be tracked explicitly.

## Route-Level Coverage

Replace the remaining `it.todo` route-level bulk tests with executable assertions:

- `packages/api/src/__tests__/routes/bulk-csrf-auth.test.ts` — auth and CSRF gates for every bulk route.
- `packages/api/src/__tests__/routes/bulk-idempotency.test.ts` — `Idempotency-Key` replay returns the same `bulkOperationId` and does not enqueue duplicate work.
- `packages/api/src/__tests__/routes/bulk-import.test.ts` — profile ownership, queue ownership, file validation, row cap, Twitter budget, and partial-error report paths.
- `packages/api/src/__tests__/routes/posts-csv-export.test.ts` — user scoping and CSV formula escaping for posts export.
- `packages/api/src/__tests__/routes/queue-csv-export.test.ts` — queue ownership, user scoping, and CSV formula escaping for queue export.

## Transaction Semantics

Revisit whole-batch transactions in:

- `packages/worker/src/bulk/csv-import-queue.handler.ts`
- `packages/worker/src/bulk/queue-randomize.handler.ts`
- `packages/worker/src/bulk/queue-text-modify.handler.ts`

Goal: a single bad row should not roll back every successful row and then cause BullMQ to retry the full payload. Prefer per-row savepoints or narrower transactions so `successCount` and `failureCount` match durable database state.

## Architecture Cleanup

- Split `packages/api/src/routes/posts.ts` into narrower route modules: single-post CRUD, bulk operations, CSV export, and notification/rate-limit helpers.
- Lift duplicated `enqueuePostBulkOperation` / `enqueueQueueBulkOperation` orchestration into a shared API service once the route split lands.
- Keep `@sms/shared` as the owner of the bulk job wire contract. `bulkJobPayloadSchema` is now the shared schema; future handlers should validate payload-specific `params` schemas at handler entry.

## Scale Watchlist

- CSV rows still travel through Redis job payloads. This is bounded by `MAX_BULK_CSV_ROWS`; offload to disk/Postgres before raising that cap.
- `bulk_operations.payload` can grow with full post ID arrays. Acceptable at current single-user scale; revisit if bulk selection grows past low thousands.
- Queue randomize/text-modify still update per row. Acceptable for current scale; batch when queue sizes trend above 10k rows.
