import { describe, expect, it, vi } from 'vitest';
import { JOB_NAMES } from '@sms/shared';
import { seedTokenJob } from '../../__tests__/helpers/seed-notification-job.js';

import { handleTokenExpiringSoonNotification } from '../token-expiring-soon.handler.js';

describe('handleTokenExpiringSoonNotification', () => {
  it('uses payload userId and respects configurable prefs', async () => {
    const prefs = { loadPrefs: vi.fn().mockResolvedValue({ isInAppEnabled: true, isEmailEnabled: false }) };
    const store = { insertNotification: vi.fn(), insertEmailLog: vi.fn() };
    const smtp = { sendEmail: vi.fn() };

    await handleTokenExpiringSoonNotification(
      { prefs, store, smtp },
      seedTokenJob(JOB_NAMES.tokenExpiringSoon, { eventType: 'token_expiring_soon' }),
    );

    expect(store.insertNotification).toHaveBeenCalled();
    expect(smtp.sendEmail).not.toHaveBeenCalled();
  });
});
