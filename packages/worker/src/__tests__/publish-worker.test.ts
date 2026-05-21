import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job, Queue } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { PostInvariantError, PublishFailure } from '@sms/shared';
import type { StorageBackend } from '@sms/shared/storage';
import type { Credentials, SafeProfile, TokenVault } from '@sms/shared/tokens';
import { createPublishHandler, type PublishJobPayload } from '../publish-worker.js';
import { PostLifecycleAbort } from '../post-lifecycle.service.js';

function lifecycleAbort(kind: PostInvariantError['kind']): PostLifecycleAbort {
  return new PostLifecycleAbort(new PostInvariantError(kind));
}

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
  const storage = {
    get: vi.fn(),
  } as unknown as StorageBackend;
  const vault = createTestVault();
  return {
    db,
    notificationQueue,
    storage,
    vault,
    publishPostImpl: vi.fn().mockResolvedValue({ platformPostId: 'tw_success_1' }),
    publishers: {
      twitter: {
        publish: vi.fn().mockResolvedValue({ platformPostId: 'tw_success_1' }),
      },
    },
    checkBudgetImpl: vi.fn().mockResolvedValue({ wouldExceed: false }),
    ...overrides,
  };
}

function createSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    then: (resolve: (value: unknown[]) => void) => resolve(rows),
  };
  return chain;
}

function createBudgetDb(selectRows: unknown[][]) {
  let selectIndex = 0;
  return {
    select: vi.fn(() => createSelectChain(selectRows[selectIndex++] ?? [])),
    execute: vi.fn().mockResolvedValue([
      {
        limit: 200,
        count: 198,
        windowStart: new Date('2026-05-21T13:00:00Z'),
        warnThresholdPercent: 80,
      },
    ]),
  } as unknown as Parameters<typeof createPublishHandler>[0]['db'];
}

function createTestVault(overrides: Partial<TokenVault> = {}): TokenVault {
  const credentials: Credentials = {
    kind: 'twitter',
    consumerKey: 'ck',
    consumerSecret: 'cs',
    accessToken: 'at',
    accessTokenSecret: 'ats',
  };
  const safeProfile: SafeProfile = {
    platform: 'twitter',
    platformAccountId: null,
    linkedinAccountType: 'person',
  };

  return {
    sealTwitter: vi.fn() as TokenVault['sealTwitter'],
    unsealTwitter: vi.fn(() => credentials) as TokenVault['unsealTwitter'],
    sealOAuth2: vi.fn() as TokenVault['sealOAuth2'],
    sealOAuth2AccessToken: vi.fn() as TokenVault['sealOAuth2AccessToken'],
    sealOAuth2RefreshToken: vi.fn() as TokenVault['sealOAuth2RefreshToken'],
    unsealOAuth2: vi.fn() as TokenVault['unsealOAuth2'],
    unsealOAuth2RefreshToken: vi.fn() as TokenVault['unsealOAuth2RefreshToken'],
    unsealForProfile: vi.fn(() => credentials) as TokenVault['unsealForProfile'],
    toSafeProfile: vi.fn(() => safeProfile) as TokenVault['toSafeProfile'],
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
    expect(ctxArg.isFinalAttempt).toBe(false);
    expect(ctxArg.storage).toBe(deps.storage);
    expect(result).toEqual({ platformPostId: 'tw_success_1' });
  });

  it('uses media-aware Facebook call counts in the runtime budget check', async () => {
    deps = buildDeps({
      db: createBudgetDb([
        [{ platform: 'facebook' }],
        [{ mimeType: 'image/jpeg' }, { mimeType: 'image/png' }],
      ]),
    });
    const handler = createPublishHandler(deps);

    await handler(buildJob());
    const [, ctxArg] = deps.publishPostImpl.mock.calls[0];
    const budget = await ctxArg.checkBudget('profile-fb');

    // 198 existing calls + 2 photo uploads + 1 feed call reaches 201/200.
    // A stale single-call estimate would report this as not blocked.
    expect(budget).toMatchObject({
      platform: 'facebook',
      blockThresholdHit: true,
      wouldExceed: true,
    });
  });

  it('currentAttemptNum tracks attemptsMade + 1 on retries', async () => {
    const handler = createPublishHandler(deps);
    await handler(buildJob({ attemptsMade: 2 } as Partial<Job<PublishJobPayload>>));
    const [, ctxArg] = deps.publishPostImpl.mock.calls[0];
    expect(ctxArg.currentAttemptNum).toBe(3);
  });

  it('marks the lifecycle context final on the last configured attempt', async () => {
    const handler = createPublishHandler(deps);
    await handler(buildJob({ attemptsMade: 3 } as Partial<Job<PublishJobPayload>>));
    const [, ctxArg] = deps.publishPostImpl.mock.calls[0];
    expect(ctxArg.currentAttemptNum).toBe(4);
    expect(ctxArg.isFinalAttempt).toBe(true);
  });

  it('treats jobs without a configured attempts cap as final on the first attempt', async () => {
    const handler = createPublishHandler(deps);
    await handler(
      buildJob({
        attemptsMade: 0,
        opts: {},
      } as Partial<Job<PublishJobPayload>>),
    );
    const [, ctxArg] = deps.publishPostImpl.mock.calls[0];
    expect(ctxArg.currentAttemptNum).toBe(1);
    expect(ctxArg.isFinalAttempt).toBe(true);
  });

  it('unseals credentials in the dispatcher before calling the platform publisher', async () => {
    const publishablePost = {
      text: 'hello',
      platform: 'twitter' as const,
      isThread: false,
      visibility: null,
      linkUrl: null,
      media: [],
    };
    const encryptedProfile = {
      platform: 'twitter',
      platformAccountId: null,
      linkedinAccountType: 'person',
      consumerKeyCiphertext: 'cipher',
    };
    deps.publishPostImpl = vi.fn(async (_db, ctx) =>
      ctx.publish(encryptedProfile as never, publishablePost, { correlationId: 'corr_abc' }),
    );

    const handler = createPublishHandler(deps);
    await handler(buildJob());

    expect(deps.vault.toSafeProfile).toHaveBeenCalledWith(
      expect.objectContaining({ consumerKeyCiphertext: 'cipher' }),
    );
    expect(deps.vault.unsealForProfile).toHaveBeenCalledWith(
      expect.objectContaining({ consumerKeyCiphertext: 'cipher' }),
    );
    expect(deps.publishers.twitter.publish).toHaveBeenCalledWith(
      {
        platform: 'twitter',
        platformAccountId: null,
        linkedinAccountType: 'person',
      },
      {
        kind: 'twitter',
        consumerKey: 'ck',
        consumerSecret: 'cs',
        accessToken: 'at',
        accessTokenSecret: 'ats',
      },
      publishablePost,
      { correlationId: 'corr_abc' },
    );
  });

  it('rethrows transient errors so BullMQ retries', async () => {
    const transientErr = new PublishFailure({
      kind: 'transient',
      errorCode: 'http_500',
      message: 'Service Unavailable',
      httpStatus: 500,
    });
    deps.publishPostImpl = vi.fn().mockRejectedValue(transientErr);
    const handler = createPublishHandler(deps);

    await expect(handler(buildJob())).rejects.toBe(transientErr);
  });

  it('throws UnrecoverableError on permanent failures (401 auth revoked)', async () => {
    const permanentErr = new PublishFailure({
      kind: 'permanent',
      errorCode: 'auth_revoked',
      message: 'Twitter credentials are no longer valid - please reconnect the profile',
      httpStatus: 401,
    });
    deps.publishPostImpl = vi.fn().mockRejectedValue(permanentErr);
    const handler = createPublishHandler(deps);

    await expect(handler(buildJob())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('throws UnrecoverableError on duplicate content (twitter code 187)', async () => {
    const duplicateErr = new PublishFailure({
      kind: 'permanent',
      errorCode: 'duplicate_content',
      message: 'Duplicate content - Twitter rejected this tweet',
      httpStatus: 403,
    });
    deps.publishPostImpl = vi.fn().mockRejectedValue(duplicateErr);
    const handler = createPublishHandler(deps);

    await expect(handler(buildJob())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('resolves successfully on PostLifecycleAbort(already_published) — idempotency skip', async () => {
    deps.publishPostImpl = vi
      .fn()
      .mockRejectedValue(lifecycleAbort('already_published'));
    const handler = createPublishHandler(deps);

    const result = await handler(buildJob());
    expect(result).toEqual({ skipped: true, skipReason: 'already_published' });
  });

  it('resolves successfully on PostLifecycleAbort(version_mismatch)', async () => {
    deps.publishPostImpl = vi
      .fn()
      .mockRejectedValue(lifecycleAbort('version_mismatch'));
    const handler = createPublishHandler(deps);

    const result = await handler(buildJob());
    expect(result).toEqual({ skipped: true, skipReason: 'version_mismatch' });
  });

  it('resolves successfully on PostLifecycleAbort(budget_exhausted)', async () => {
    deps.publishPostImpl = vi
      .fn()
      .mockRejectedValue(lifecycleAbort('budget_exhausted'));
    const handler = createPublishHandler(deps);

    const result = await handler(buildJob());
    expect(result).toEqual({ skipped: true, skipReason: 'budget_exhausted' });
  });

  it('resolves successfully on PostLifecycleAbort(not_scheduled)', async () => {
    deps.publishPostImpl = vi
      .fn()
      .mockRejectedValue(lifecycleAbort('not_scheduled'));
    const handler = createPublishHandler(deps);

    const result = await handler(buildJob());
    expect(result).toEqual({ skipped: true, skipReason: 'not_scheduled' });
  });

  it('resolves successfully on PostLifecycleAbort(thread_unsupported)', async () => {
    deps.publishPostImpl = vi
      .fn()
      .mockRejectedValue(lifecycleAbort('thread_unsupported'));
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
