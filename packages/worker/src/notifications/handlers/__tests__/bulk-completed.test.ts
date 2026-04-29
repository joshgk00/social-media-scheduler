import { describe, expect, it, vi } from 'vitest';

import { handleBulkCompletedNotification } from '../bulk-completed.handler.js';

describe('handleBulkCompletedNotification', () => {
  it('acks as a Phase 10 deferred no-op without DB writes', async () => {
    const store = { insertNotification: vi.fn(), insertEmailLog: vi.fn() };

    await handleBulkCompletedNotification({ store }, {
      id: 'bulk-job-1',
      name: 'bulk-completed',
      data: { correlationId: '33333333-3333-3333-3333-333333333333' },
    });

    expect(store.insertNotification).not.toHaveBeenCalled();
    expect(store.insertEmailLog).not.toHaveBeenCalled();
  });
});
