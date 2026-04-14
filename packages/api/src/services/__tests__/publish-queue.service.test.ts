import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Redis } from 'ioredis';
import type { Job } from 'bullmq';

// Mock bullmq so `new Queue(...)` returns a deterministic fake. Use
// `vi.hoisted` to share spy references between the hoisted vi.mock factory
// and the test bodies — writing to the outer scope directly would race with
// hoisting.
const { mockAdd, mockGetJob } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockGetJob: vi.fn(),
}));

vi.mock('bullmq', () => ({
  // Must be a real constructor — `new Queue(...)` in the service under test
  // throws "X is not a constructor" when given an arrow function.
  Queue: vi.fn(function MockQueue(this: Record<string, unknown>) {
    this.add = mockAdd;
    this.getJob = mockGetJob;
  }),
}));

import { createPublishQueueService } from '../publish-queue.service.js';
import { buildPublishJobId } from '@sms/shared';

function createFakeRedis(): Redis {
  return {} as unknown as Redis;
}

describe('publish-queue service', () => {
  const POST_ID = '11111111-1111-1111-1111-111111111111';
  const POST_VERSION = 3;
  const CORRELATION_ID = 'correlation-abc';

  beforeEach(() => {
    mockAdd.mockReset();
    mockGetJob.mockReset();
    mockAdd.mockResolvedValue({ id: buildPublishJobId(POST_ID, POST_VERSION) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('enqueuePublish', () => {
    it('adds a job with jobId built from (postId, postVersion)', async () => {
      const service = createPublishQueueService(createFakeRedis());

      await service.enqueuePublish(
        POST_ID,
        POST_VERSION,
        new Date(Date.now() + 60_000),
        CORRELATION_ID,
      );

      expect(mockAdd).toHaveBeenCalledTimes(1);
      const [jobName, payload, options] = mockAdd.mock.calls[0];
      expect(jobName).toBe('publish-post');
      expect(payload).toEqual({
        postId: POST_ID,
        postVersion: POST_VERSION,
        correlationId: CORRELATION_ID,
      });
      expect(options.jobId).toBe(buildPublishJobId(POST_ID, POST_VERSION));
    });

    it('calculates a positive delay for a future scheduledAt', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-15T12:00:00Z'));

      const service = createPublishQueueService(createFakeRedis());
      const futureScheduledAt = new Date('2026-04-15T12:05:00Z'); // +5 min

      await service.enqueuePublish(
        POST_ID,
        POST_VERSION,
        futureScheduledAt,
        CORRELATION_ID,
      );

      const [, , options] = mockAdd.mock.calls[0];
      expect(options.delay).toBe(5 * 60 * 1000);
    });

    it('clamps the delay to 0 when scheduledAt is in the past', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-15T12:00:00Z'));

      const service = createPublishQueueService(createFakeRedis());
      const pastScheduledAt = new Date('2026-04-15T11:00:00Z'); // -1 hour

      await service.enqueuePublish(
        POST_ID,
        POST_VERSION,
        pastScheduledAt,
        CORRELATION_ID,
      );

      const [, , options] = mockAdd.mock.calls[0];
      expect(options.delay).toBe(0);
    });

    it('never includes OAuth credentials in the job payload', async () => {
      const service = createPublishQueueService(createFakeRedis());

      await service.enqueuePublish(
        POST_ID,
        POST_VERSION,
        new Date(Date.now() + 1000),
        CORRELATION_ID,
      );

      const [, payload] = mockAdd.mock.calls[0];
      const payloadKeys = Object.keys(payload as object).sort();
      expect(payloadKeys).toEqual(['correlationId', 'postId', 'postVersion']);
    });
  });

  describe('cancelScheduled', () => {
    it('removes a delayed job', async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined);
      const mockIsDelayed = vi.fn().mockResolvedValue(true);
      mockGetJob.mockResolvedValue({
        remove: mockRemove,
        isDelayed: mockIsDelayed,
      } as unknown as Job);

      const service = createPublishQueueService(createFakeRedis());
      await service.cancelScheduled(POST_ID, POST_VERSION);

      expect(mockGetJob).toHaveBeenCalledWith(
        buildPublishJobId(POST_ID, POST_VERSION),
      );
      expect(mockIsDelayed).toHaveBeenCalledTimes(1);
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it('does NOT call remove when the job is not delayed (active/completed)', async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined);
      const mockIsDelayed = vi.fn().mockResolvedValue(false);
      mockGetJob.mockResolvedValue({
        remove: mockRemove,
        isDelayed: mockIsDelayed,
      } as unknown as Job);

      const service = createPublishQueueService(createFakeRedis());
      await service.cancelScheduled(POST_ID, POST_VERSION);

      expect(mockIsDelayed).toHaveBeenCalledTimes(1);
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('is a no-op when the job does not exist', async () => {
      mockGetJob.mockResolvedValue(null);

      const service = createPublishQueueService(createFakeRedis());
      await service.cancelScheduled(POST_ID, POST_VERSION);

      expect(mockGetJob).toHaveBeenCalledWith(
        buildPublishJobId(POST_ID, POST_VERSION),
      );
    });
  });
});
