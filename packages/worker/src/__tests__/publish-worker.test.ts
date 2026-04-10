import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job, Queue } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { createPublishHandler, type PublishJobPayload } from '../publish-worker.js';
import { PostLifecycleAbort } from '../post-lifecycle.service.js';
import { buildApiResponseError } from './helpers/mock-twitter.js';

function buildJob(
  overrides: Partial<Job<PublishJobPayload>> = {},
): Job<PublishJobPayload> {
  return {
    id: 'publish-job-1',
    name: 'publish-post',
    data: {
      postId: 'post_abc',
      postVersion: 1,
      correlationId: 'corr_abc',
    },
    attemptsMade: 0,
    opts: { attempts: 4 },
    ...overrides,
  } as unknown as Job<PublishJobPayload>;
}

function buildDeps(overrides: Record<string, unknown> = {}) {
  const notificationQueue = {
    add: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue;
  const db = {} as unknown as Parameters<typeof createPublishHandler>[0]['db'];
  return {
    db,
    notificationQueue,
    publishPostImpl: vi.fn().mockResolvedValue({ platformPostId: 'tw_success_1' }),
    callTwitterImpl: vi.fn().mockResolvedValue({ platformPostId: 'tw_success_1' }),
    checkBudgetImpl: vi.fn().mockResolvedValue({ wouldExceed: false }),
    ...overrides,
  };
}

describe('createPublishHandler', () => {
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(() => {
    deps = buildDeps();
  });

  it('invokes publishPost with the job payload identifiers and returns the platform id', async () => {
    const handler = createPublishHandler(deps);
    const result = await handler(buildJob());

    expect(deps.publishPostImpl).toHaveBeenCalledTimes(1);
    const [, ctxArg] = deps.publishPostImpl.mock.calls[0];
    expect(ctxArg.postId).toBe('post_abc');
    expect(ctxArg.expectedVersion).toBe(1);
    expect(ctxArg.correlationId).toBe('corr_abc');
    expect(ctxArg.currentAttemptNum).toBe(1);
    expect(result).toEqual({ platformPostId: 'tw_success_1' });
  });

  it('currentAttemptNum tracks attemptsMade + 1 on retries', async () => {
    const handler = createPublishHandler(deps);
    await handler(buildJob({ attemptsMade: 2 } as Partial<Job<PublishJobPayload>>));
    const [, ctxArg] = deps.publishPostImpl.mock.calls[0];
    expect(ctxArg.currentAttemptNum).toBe(3);
  });

  it('rethrows transient errors so BullMQ retries', async () => {
    const transientErr = buildApiResponseError({ httpStatus: 500 });
    deps.publishPostImpl = vi.fn().mockRejectedValue(transientErr);
    const handler = createPublishHandler(deps);

    await expect(handler(buildJob())).rejects.toBe(transientErr);
  });

  it('throws UnrecoverableError on permanent failures (401 auth revoked)', async () => {
    const permanentErr = buildApiResponseError({ httpStatus: 401 });
    deps.publishPostImpl = vi.fn().mockRejectedValue(permanentErr);
    const handler = createPublishHandler(deps);

    await expect(handler(buildJob())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('throws UnrecoverableError on duplicate content (twitter code 187)', async () => {
    const duplicateErr = buildApiResponseError({
      httpStatus: 403,
      code: 187,
      detail: 'Status is a duplicate',
    });
    deps.publishPostImpl = vi.fn().mockRejectedValue(duplicateErr);
    const handler = createPublishHandler(deps);

    await expect(handler(buildJob())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('resolves successfully on PostLifecycleAbort(already_published) — idempotency skip', async () => {
    deps.publishPostImpl = vi
      .fn()
      .mockRejectedValue(new PostLifecycleAbort('already_published'));
    const handler = createPublishHandler(deps);

    const result = await handler(buildJob());
    expect(result).toEqual({ skipped: true, skipReason: 'already_published' });
  });

  it('resolves successfully on PostLifecycleAbort(version_mismatch)', async () => {
    deps.publishPostImpl = vi
      .fn()
      .mockRejectedValue(new PostLifecycleAbort('version_mismatch'));
    const handler = createPublishHandler(deps);

    const result = await handler(buildJob());
    expect(result).toEqual({ skipped: true, skipReason: 'version_mismatch' });
  });

  it('resolves successfully on PostLifecycleAbort(budget_exhausted)', async () => {
    deps.publishPostImpl = vi
      .fn()
      .mockRejectedValue(new PostLifecycleAbort('budget_exhausted'));
    const handler = createPublishHandler(deps);

    const result = await handler(buildJob());
    expect(result).toEqual({ skipped: true, skipReason: 'budget_exhausted' });
  });

  it('resolves successfully on PostLifecycleAbort(not_scheduled)', async () => {
    deps.publishPostImpl = vi
      .fn()
      .mockRejectedValue(new PostLifecycleAbort('not_scheduled'));
    const handler = createPublishHandler(deps);

    const result = await handler(buildJob());
    expect(result).toEqual({ skipped: true, skipReason: 'not_scheduled' });
  });

  it('resolves successfully on PostLifecycleAbort(thread_unsupported)', async () => {
    deps.publishPostImpl = vi
      .fn()
      .mockRejectedValue(new PostLifecycleAbort('thread_unsupported'));
    const handler = createPublishHandler(deps);

    const result = await handler(buildJob());
    expect(result).toEqual({ skipped: true, skipReason: 'thread_unsupported' });
  });
});

describe('createPublishWorker source shape', () => {
  it('exports the expected configuration constants via the handler file', async () => {
    const source = await (await import('node:fs')).promises.readFile(
      new URL('../publish-worker.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('concurrency: PUBLISH_WORKER_CONFIG.concurrency');
    expect(source).toContain('concurrency: 2');
    expect(source).toContain('lockDuration: 30_000');
    expect(source).toContain('stalledInterval: 30_000');
    expect(source).toContain("worker.on('failed'");
    expect(source).toContain('publishFailedNotification');
    expect(source).toContain('UnrecoverableError');
    expect(source).not.toMatch(/from ['"]@sms\/api/);
  });
});
