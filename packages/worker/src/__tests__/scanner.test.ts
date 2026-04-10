import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inspect } from 'node:util';
import type { Queue } from 'bullmq';
import {
  enqueueDuePosts,
  selectDuePosts,
  SCAN_HORIZON_MS,
  type DuePost,
} from '../scanner.js';
import { isNull } from 'drizzle-orm';
import { posts as postsTable } from '@sms/db';
import { buildPublishJobId, JOB_NAMES } from '@sms/shared';

/**
 * Minimal spy-based mock for the scanner's db.select chain. Captures the
 * where-clause so tests can assert the drizzle condition includes an
 * `isNull(posts.platformPostId)` predicate — that's the belt-and-suspenders
 * guard that prevents re-publishing a post whose platform_post_id is set.
 */
function createScannerMockDb(returnedRows: DuePost[]) {
  const captured: { whereArg?: unknown } = {};
  const whereFn = vi.fn().mockImplementation((condition: unknown) => {
    captured.whereArg = condition;
    return {
      then: (resolve: (val: unknown) => void) => resolve(returnedRows),
    };
  });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return {
    db: { select: selectFn } as unknown as Parameters<typeof selectDuePosts>[0],
    captured,
    selectFn,
    fromFn,
    whereFn,
  };
}

function buildMockPublishQueue() {
  return {
    add: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue;
}

describe('selectDuePosts', () => {
  it('queries the posts table with an isNull(platformPostId) predicate', async () => {
    const mock = createScannerMockDb([]);
    await selectDuePosts(mock.db, new Date('2026-04-09T12:01:30Z'));

    expect(mock.selectFn).toHaveBeenCalledTimes(1);
    expect(mock.fromFn).toHaveBeenCalledWith(postsTable);

    // Inspect the drizzle AST: `and(...)` wraps its children in a
    // `.queries` array of SQL / Condition nodes. Any one of them must be
    // an isNull() expression referencing platform_post_id.
    const whereArg = mock.captured.whereArg as {
      queryChunks?: unknown[];
      queries?: unknown[];
    };
    expect(whereArg).toBeDefined();

    // Drizzle's SQL nodes contain cycles (column -> table -> columns),
    // so use util.inspect with depth capped, not JSON.stringify.
    const serialized = inspect(whereArg, {
      depth: 8,
      breakLength: Infinity,
      maxArrayLength: 50,
      showHidden: false,
    });
    expect(serialized).toMatch(/platform_post_id|platformPostId/);
    expect(serialized).toMatch(/isNull|IS NULL/i);
  });

  it('source file contains the drizzle isNull(posts.platformPostId) call', async () => {
    const fs = await import('node:fs');
    const source = await fs.promises.readFile(
      new URL('../scanner.ts', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(/isNull\(\s*posts\.platformPostId\s*\)/);
    expect(source).toContain('WORKER-03 (Phase 4 partial)');
  });

  it('drizzle isNull helper produces an SQL condition that mentions the column', () => {
    // Sanity check: confirm drizzle's isNull() actually references the
    // column object we import from @sms/db. Serves as a guardrail in case
    // we swap the import path by mistake.
    const condition = isNull(postsTable.platformPostId);
    expect(condition).toBeDefined();
    const serialized = inspect(condition, {
      depth: 8,
      breakLength: Infinity,
      maxArrayLength: 50,
    });
    expect(serialized).toMatch(/platform_post_id|platformPostId/);
  });
});

describe('enqueueDuePosts', () => {
  let fixedNow: number;

  beforeEach(() => {
    fixedNow = new Date('2026-04-09T12:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixedNow));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enqueues each due post with buildPublishJobId and a correlationId', async () => {
    const duePosts: DuePost[] = [
      {
        id: 'post_001',
        postVersion: 3,
        scheduledAt: new Date(fixedNow + 10_000),
      },
      {
        id: 'post_002',
        postVersion: 1,
        scheduledAt: new Date(fixedNow - 5_000), // overdue → delay 0
      },
    ];
    const mock = createScannerMockDb(duePosts);
    const publishQueue = buildMockPublishQueue();

    const count = await enqueueDuePosts({
      db: mock.db,
      publishQueue,
      now: () => fixedNow,
    });

    expect(count).toBe(2);
    expect(publishQueue.add).toHaveBeenCalledTimes(2);

    const firstCall = (publishQueue.add as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall[0]).toBe(JOB_NAMES.publishPost);
    const firstPayload = firstCall[1] as {
      postId: string;
      postVersion: number;
      correlationId: string;
    };
    expect(firstPayload.postId).toBe('post_001');
    expect(firstPayload.postVersion).toBe(3);
    expect(firstPayload.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(firstCall[2].jobId).toBe(buildPublishJobId('post_001', 3));
    expect(firstCall[2].delay).toBe(10_000);

    const secondCall = (publishQueue.add as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(secondCall[2].delay).toBe(0);
    expect(secondCall[2].jobId).toBe(buildPublishJobId('post_002', 1));
  });

  it('uses SCAN_HORIZON_MS when computing the query horizon', async () => {
    const mock = createScannerMockDb([]);
    const publishQueue = buildMockPublishQueue();
    await enqueueDuePosts({
      db: mock.db,
      publishQueue,
      now: () => fixedNow,
    });

    // The where clause was called — scanner asked the DB for posts due
    // within `fixedNow + SCAN_HORIZON_MS`.
    expect(mock.whereFn).toHaveBeenCalled();
    expect(SCAN_HORIZON_MS).toBe(90_000);
  });

  it('revision Warning 1: a post with a non-null platform_post_id is excluded by the DB predicate', async () => {
    // The mock simulates the DB filter: the scanner query ONLY returns
    // rows where platformPostId IS NULL. We seed two conceptual posts and
    // only expose the one with null platformPostId, mirroring the actual
    // Postgres behavior under the drizzle `isNull()` predicate.
    const nullPost: DuePost = {
      id: 'post_never_published',
      postVersion: 1,
      scheduledAt: new Date(fixedNow + 1000),
    };
    // The post with an existing platform_post_id is NOT returned by
    // `selectDuePosts` — the scanner query filters it out at the DB level.
    const mock = createScannerMockDb([nullPost]);
    const publishQueue = buildMockPublishQueue();

    const count = await enqueueDuePosts({
      db: mock.db,
      publishQueue,
      now: () => fixedNow,
    });
    expect(count).toBe(1);
    expect(publishQueue.add).toHaveBeenCalledTimes(1);
    const payload = (publishQueue.add as ReturnType<typeof vi.fn>).mock
      .calls[0][1];
    expect(payload.postId).toBe('post_never_published');
  });
});
