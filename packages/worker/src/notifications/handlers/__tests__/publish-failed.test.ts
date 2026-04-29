import { describe, expect, it, vi } from 'vitest';
import { seedPublishFailedJob } from '../../__tests__/helpers/seed-notification-job.js';

import { handlePublishFailedNotification } from '../publish-failed.handler.js';

describe('handlePublishFailedNotification', () => {
  it('resolves userId from post ownership, inserts in-app notification, sends email, and logs delivery', async () => {
    const db = { select: vi.fn(), insert: vi.fn() };
    const store = { insertNotification: vi.fn(), insertEmailLog: vi.fn() };
    const smtp = { sendEmail: vi.fn().mockResolvedValue({ status: 'sent', messageId: 'm1' }) };

    await handlePublishFailedNotification({ db, store, smtp }, seedPublishFailedJob());

    expect(store.insertNotification).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'publish_failed' }));
    expect(smtp.sendEmail).toHaveBeenCalled();
    expect(store.insertEmailLog).toHaveBeenCalled();
  });

  it('throws AggregateError only when both in-app and email side effects fail', async () => {
    const sideEffectError = new Error('side-effect failed');

    await expect(handlePublishFailedNotification({
      store: {
        insertNotification: vi.fn().mockRejectedValue(sideEffectError),
        insertEmailLog: vi.fn(),
      },
      smtp: { sendEmail: vi.fn().mockRejectedValue(sideEffectError) },
    }, seedPublishFailedJob())).rejects.toThrow(AggregateError);
  });
});
