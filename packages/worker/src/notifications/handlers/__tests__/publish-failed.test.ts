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

  it('throws AggregateError when both in-app and email side effects fail', async () => {
    const sideEffectError = new Error('side-effect failed');

    await expect(handlePublishFailedNotification({
      store: {
        insertNotification: vi.fn().mockRejectedValue(sideEffectError),
        insertEmailLog: vi.fn(),
      },
      smtp: { sendEmail: vi.fn().mockRejectedValue(sideEffectError) },
    }, seedPublishFailedJob())).rejects.toThrow(AggregateError);
  });

  it('throws when the only enabled in-app side effect fails', async () => {
    const sideEffectError = new Error('insert failed');

    await expect(handlePublishFailedNotification({
      prefs: {
        loadPrefs: vi.fn().mockResolvedValue({ isInAppEnabled: true, isEmailEnabled: false }),
      },
      store: {
        insertNotification: vi.fn().mockRejectedValue(sideEffectError),
        insertEmailLog: vi.fn(),
      },
      smtp: { sendEmail: vi.fn() },
    }, seedPublishFailedJob())).rejects.toThrow('insert failed');
  });

  it('throws after logging a transient email failure', async () => {
    await expect(handlePublishFailedNotification({
      store: {
        insertNotification: vi.fn(),
        insertEmailLog: vi.fn(),
      },
      smtp: {
        sendEmail: vi.fn().mockResolvedValue({
          status: 'failed',
          errorMessage: 'Temporary SMTP outage',
          isTransient: true,
        }),
      },
    }, seedPublishFailedJob())).rejects.toThrow('Temporary SMTP outage');
  });
});
