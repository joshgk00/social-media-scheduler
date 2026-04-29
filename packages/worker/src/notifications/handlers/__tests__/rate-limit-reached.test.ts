import { describe, expect, it, vi } from 'vitest';
import { seedRateLimitReachedJob } from '../../__tests__/helpers/seed-notification-job.js';

import { handleRateLimitReachedNotification } from '../rate-limit-reached.handler.js';

describe('handleRateLimitReachedNotification', () => {
  it('uses payload userId and forces email plus in-app when prefs disable both', async () => {
    const prefs = { loadPrefs: vi.fn().mockResolvedValue({ isInAppEnabled: false, isEmailEnabled: false }) };
    const store = { insertNotification: vi.fn(), insertEmailLog: vi.fn() };
    const smtp = { sendEmail: vi.fn().mockResolvedValue({ status: 'sent', messageId: 'm1' }) };

    await handleRateLimitReachedNotification({ prefs, store, smtp }, seedRateLimitReachedJob());

    expect(store.insertNotification).toHaveBeenCalled();
    expect(smtp.sendEmail).toHaveBeenCalled();
    expect(store.insertEmailLog).toHaveBeenCalled();
  });
});
