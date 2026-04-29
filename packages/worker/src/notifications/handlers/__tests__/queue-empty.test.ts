import { describe, expect, it, vi } from 'vitest';
import { seedQueueEmptyJob } from '../../__tests__/helpers/seed-notification-job.js';

import { handleQueueEmptyNotification } from '../queue-empty.handler.js';

describe('handleQueueEmptyNotification', () => {
  it('resolves userId from queue ownership and inserts an in-app-only notice', async () => {
    const store = { insertNotification: vi.fn(), insertEmailLog: vi.fn() };
    const smtp = { sendEmail: vi.fn() };

    await handleQueueEmptyNotification({ store, smtp }, seedQueueEmptyJob());

    expect(store.insertNotification).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'queue_empty' }));
    expect(smtp.sendEmail).not.toHaveBeenCalled();
  });
});
