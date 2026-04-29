import { describe, expect, it, vi } from 'vitest';
import { seedAutoDestructFailedJob } from '../../__tests__/helpers/seed-notification-job.js';

import { handleAutoDestructFailedNotification } from '../auto-destruct-failed.handler.js';

describe('handleAutoDestructFailedNotification', () => {
  it('resolves userId from post ownership and performs both side effects by default', async () => {
    const store = { insertNotification: vi.fn(), insertEmailLog: vi.fn() };
    const smtp = { sendEmail: vi.fn().mockResolvedValue({ status: 'sent', messageId: 'm1' }) };

    await handleAutoDestructFailedNotification({ store, smtp }, seedAutoDestructFailedJob());

    expect(store.insertNotification).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'auto_destruct_failed' }));
    expect(smtp.sendEmail).toHaveBeenCalled();
    expect(store.insertEmailLog).toHaveBeenCalled();
  });
});
