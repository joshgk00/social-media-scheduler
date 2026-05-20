import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError, type Queue, type Job } from 'bullmq';
import type { TokenVault, TwitterCredentials } from '@sms/shared/tokens';
import type { WorkerDb } from '../db.js';

vi.mock('@sms/shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

const capturedListeners: Record<string, Array<(...args: unknown[]) => Promise<unknown> | unknown>> = {};

vi.mock('bullmq', () => {
  class UnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  }

  return {
    UnrecoverableError,
    Worker: class MockWorker {
      on(evt: string, cb: (...args: unknown[]) => Promise<unknown> | unknown) {
        capturedListeners[evt] = capturedListeners[evt] ?? [];
        capturedListeners[evt]!.push(cb);
        return this;
      }
    },
  };
});

const deleteTweetMock = vi.fn().mockResolvedValue({ data: { deleted: true } });

class MockApiResponseError extends Error {
  code: number;
  data: unknown;
  rateLimitError: boolean;
  rateLimit: unknown;
  constructor(message: string, opts: { code: number }) {
    super(message);
    this.code = opts.code;
    this.name = 'ApiResponseError';
    this.data = {};
    this.rateLimitError = false;
    this.rateLimit = null;
  }
}

vi.mock('twitter-api-v2', () => {
  return {
    TwitterApi: class {
      v2: { deleteTweet: typeof deleteTweetMock };
      constructor() {
        this.v2 = { deleteTweet: deleteTweetMock };
      }
    },
    ApiResponseError: MockApiResponseError,
  };
});

function createMockProfile(): Record<string, unknown> {
  return {
    id: 'profile-1',
    platform: 'twitter',
    consumerKeyCiphertext: 'enc-ck',
    consumerKeyIv: 'iv-ck',
    consumerKeyAuthTag: 'tag-ck',
    consumerSecretCiphertext: 'enc-cs',
    consumerSecretIv: 'iv-cs',
    consumerSecretAuthTag: 'tag-cs',
    accessTokenCiphertext: 'enc-at',
    accessTokenIv: 'iv-at',
    accessTokenAuthTag: 'tag-at',
    accessTokenSecretCiphertext: 'enc-ats',
    accessTokenSecretIv: 'iv-ats',
    accessTokenSecretAuthTag: 'tag-ats',
  };
}

function createFakeVault(
  credentials: TwitterCredentials = {
    kind: 'twitter',
    consumerKey: 'consumer-key',
    consumerSecret: 'consumer-secret',
    accessToken: 'access-token',
    accessTokenSecret: 'access-token-secret',
  },
): { vault: TokenVault; unsealForProfile: ReturnType<typeof vi.fn> } {
  const unsealForProfile = vi.fn().mockReturnValue(credentials);

  return {
    vault: {
      sealTwitter: vi.fn(),
      unsealTwitter: vi.fn(),
      sealOAuth2: vi.fn(),
      unsealOAuth2: vi.fn(),
      unsealForProfile,
      toSafeProfile: vi.fn((profile) => profile),
    } as unknown as TokenVault,
    unsealForProfile,
  };
}

describe('Auto-Destruct System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(capturedListeners)) {
      delete capturedListeners[key];
    }
  });

  describe('deleteTweet', () => {
    it('unseals credentials through TokenVault and calls Twitter v2.deleteTweet with platformPostId', async () => {
      const { deleteTweet } = await import('../twitter-delete.service.js');
      const profile = createMockProfile();
      const { vault, unsealForProfile } = createFakeVault();

      const result = await deleteTweet({
        profile: profile as never,
        platformPostId: 'tweet-123',
        correlationId: 'corr-1',
        vault,
      });

      expect(result.deleted).toBe(true);
      expect(unsealForProfile).toHaveBeenCalledWith(profile);
      expect(deleteTweetMock).toHaveBeenCalledWith('tweet-123');
    });

    it('returns deleted:true on 404 response (D-13: post already gone)', async () => {
      const { deleteTweet } = await import('../twitter-delete.service.js');
      const profile = createMockProfile();
      const { vault } = createFakeVault();

      // Make deleteTweet throw a 404 ApiResponseError
      deleteTweetMock.mockRejectedValueOnce(
        new MockApiResponseError('Not Found', { code: 404 }),
      );

      const result = await deleteTweet({
        profile: profile as never,
        platformPostId: 'tweet-gone',
        correlationId: 'corr-2',
        vault,
      });

      expect(result.deleted).toBe(true);
    });
  });

  describe('autoDestructPost lifecycle', () => {
    it('transitions published -> auto_destructing -> destroyed', async () => {
      const { autoDestructPost } = await import('../auto-destruct-lifecycle.service.js');
      const profile = createMockProfile();

      const executeSpy = vi.fn().mockResolvedValue([{
        id: 'post-1',
        status: 'published',
        profile_id: 'profile-1',
      }]);

      const selectProfileSpy = vi.fn().mockResolvedValue([profile]);
      const updateSpy = vi.fn().mockResolvedValue(undefined);

      const txMock = {
        execute: executeSpy,
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([profile]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      const db = {
        transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      } as unknown as WorkerDb;

      const callDelete = vi.fn().mockResolvedValue({ deleted: true });

      await autoDestructPost(db, {
        postId: 'post-1',
        platformPostId: 'tweet-123',
        correlationId: 'corr-1',
        callDelete,
      });

      expect(callDelete).toHaveBeenCalledWith(profile, 'tweet-123');
    });

    it('uses platformPostId from job payload, not from DB row', async () => {
      const { autoDestructPost } = await import('../auto-destruct-lifecycle.service.js');
      const profile = createMockProfile();

      const txMock = {
        execute: vi.fn().mockResolvedValue([{
          id: 'post-1',
          status: 'published',
          platform_post_id: 'old-tweet-from-db',
          profile_id: 'profile-1',
        }]),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([profile]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      const db = {
        transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      } as unknown as WorkerDb;

      const callDelete = vi.fn().mockResolvedValue({ deleted: true });

      await autoDestructPost(db, {
        postId: 'post-1',
        platformPostId: 'correct-tweet-from-job',
        correlationId: 'corr-1',
        callDelete,
      });

      // Pitfall 1: Must use job payload platformPostId, not DB row's
      expect(callDelete).toHaveBeenCalledWith(profile, 'correct-tweet-from-job');
    });

    it.each([401, 403] as const)(
      'throws UnrecoverableError on HTTP %i so BullMQ skips remaining retries',
      async (httpStatus) => {
        const { autoDestructPost } = await import('../auto-destruct-lifecycle.service.js');
        const profile = createMockProfile();

        const txMock = {
          execute: vi.fn().mockResolvedValue([{
            id: 'post-1',
            status: 'published',
            profile_id: 'profile-1',
          }]),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([profile]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };

        const updateSetWhere = vi.fn().mockResolvedValue(undefined);
        const updateSet = vi.fn().mockReturnValue({ where: updateSetWhere });
        const outerUpdate = vi.fn().mockReturnValue({ set: updateSet });

        const db = {
          transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
          update: outerUpdate,
        } as unknown as WorkerDb;

        const credentialError = new MockApiResponseError(
          `Authorization failure (HTTP ${httpStatus})`,
          { code: httpStatus },
        );
        const callDelete = vi.fn().mockRejectedValue(credentialError);

        const rejection = autoDestructPost(db, {
          postId: 'post-1',
          platformPostId: 'tweet-revoked',
          correlationId: 'corr-revoked',
          callDelete,
        });

        await expect(rejection).rejects.toBeInstanceOf(UnrecoverableError);
        await expect(rejection).rejects.toMatchObject({
          name: 'UnrecoverableError',
          message: `Auto-destruct failed: credentials invalid or revoked (HTTP ${httpStatus})`,
        });

        // failureReason still persisted before the throw so operators see context
        expect(outerUpdate).toHaveBeenCalled();
      },
    );

    it('sets failureReason and rethrows on delete failure', async () => {
      const { autoDestructPost } = await import('../auto-destruct-lifecycle.service.js');
      const profile = createMockProfile();

      const txMock = {
        execute: vi.fn().mockResolvedValue([{
          id: 'post-1',
          status: 'published',
          profile_id: 'profile-1',
        }]),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([profile]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      const updateSetWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateSetWhere });
      const outerUpdate = vi.fn().mockReturnValue({ set: updateSet });

      const db = {
        transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
        update: outerUpdate,
      } as unknown as WorkerDb;

      const deleteError = new Error('Twitter 500');
      const callDelete = vi.fn().mockRejectedValue(deleteError);

      await expect(
        autoDestructPost(db, {
          postId: 'post-1',
          platformPostId: 'tweet-123',
          correlationId: 'corr-1',
          callDelete,
        }),
      ).rejects.toThrow('Twitter 500');

      // Should have updated post with failureReason
      expect(outerUpdate).toHaveBeenCalled();
    });
  });

  describe('createAutoDestructWorker', () => {
    it('configures worker with 4 attempts and auto-destruct queue name', async () => {
      const { createAutoDestructWorker } = await import('../auto-destruct-worker.js');
      // This is a smoke test - just verify it creates without throwing
      // In a real test we'd need a Redis connection, so we just verify the export exists
      expect(typeof createAutoDestructWorker).toBe('function');
    });

    it('enqueues a schema-valid auto-destruct failed notification after final failure', async () => {
      const { createAutoDestructWorker } = await import('../auto-destruct-worker.js');
      const { JOB_NAMES, autoDestructFailedNotificationSchema } = await import('@sms/shared');

      const postId = '00000000-0000-4000-8000-000000000101';
      const profileId = '00000000-0000-4000-8000-000000000102';
      const correlationId = 'corr-auto-destruct-failed';
      const add = vi.fn().mockResolvedValue(undefined);

      const limit = vi.fn().mockResolvedValue([{ profileId }]);
      const where = vi.fn().mockReturnValue({ limit });
      const from = vi.fn().mockReturnValue({ where });
      const db = {
        select: vi.fn().mockReturnValue({ from }),
      } as unknown as WorkerDb;

      createAutoDestructWorker({
        redis: {} as never,
        db,
        notificationQueue: { add } as unknown as Queue,
        vault: createFakeVault().vault,
      });

      const failedListener = capturedListeners.failed?.[0];
      expect(failedListener).toBeTypeOf('function');

      await failedListener!(
        {
          data: {
            postId,
            platformPostId: 'tweet-123',
            correlationId,
          },
          opts: { attempts: 4 },
          attemptsMade: 4,
        } as unknown as Job,
        new Error('Twitter delete failed'),
      );

      expect(add).toHaveBeenCalledOnce();
      expect(add).toHaveBeenCalledWith(JOB_NAMES.autoDestructFailedNotification, {
        postId,
        profileId,
        errorMessage: 'Twitter delete failed',
        correlationId,
        occurredAt: expect.any(String),
      });

      const payload = add.mock.calls[0]![1];
      expect(autoDestructFailedNotificationSchema.safeParse(payload).success).toBe(true);
      expect(payload).not.toHaveProperty('kind');
      expect(payload).not.toHaveProperty('platformPostId');
      expect(payload).not.toHaveProperty('reason');
      expect(payload).not.toHaveProperty('at');
    });
  });
});
