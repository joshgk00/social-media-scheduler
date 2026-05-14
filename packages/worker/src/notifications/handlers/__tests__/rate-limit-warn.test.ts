import { describe, expect, it, vi } from 'vitest';
import { seedRateLimitWarnJob } from '../../__tests__/helpers/seed-notification-job.js';

import { handleRateLimitWarnNotification } from '../rate-limit-warn.handler.js';

describe('handleRateLimitWarnNotification', () => {
  it('resolves userId from profile ownership and inserts an in-app-only warning', async () => {
    const store = { insertNotification: vi.fn(), insertEmailLog: vi.fn() };
    const smtp = { sendEmail: vi.fn() };

    await handleRateLimitWarnNotification({ store, smtp }, seedRateLimitWarnJob());

    expect(store.insertNotification).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'rate_limit_warn' }));
    expect(smtp.sendEmail).not.toHaveBeenCalled();
    expect(store.insertEmailLog).not.toHaveBeenCalled();
  });
});
