import { describe, expect, it, vi } from 'vitest';

import { handleBulkCompletedNotification } from '../bulk-completed.handler.js';

describe('handleBulkCompletedNotification', () => {
  it('creates an in-app notification for a completed bulk operation', async () => {
    const store = { insertNotification: vi.fn(), insertEmailLog: vi.fn() };

    await handleBulkCompletedNotification({ store }, {
      id: 'bulk-job-1',
      name: 'bulk-completed',
      data: {
        eventType: 'bulk_completed',
        userId: '44444444-4444-4444-4444-444444444444',
        bulkOperationId: '55555555-5555-4555-8555-555555555555',
        operation: 'bulk.queue-randomize',
        successCount: 10,
        failureCount: 0,
        correlationId: '33333333-3333-4333-8333-333333333333',
      },
    });

    expect(store.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'bulk_completed',
      linkPath: '/posts?bulkOp=55555555-5555-4555-8555-555555555555',
      title: 'Randomize queue complete',
    }));
    expect(store.insertEmailLog).not.toHaveBeenCalled();
  });
});
