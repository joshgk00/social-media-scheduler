import { describe, expect, it, vi } from 'vitest';
import { JOB_NAMES } from '@sms/shared';
import { seedTokenJob } from '../../__tests__/helpers/seed-notification-job.js';

import { handleTokenRefreshFailedNotification } from '../token-refresh-failed.handler.js';

describe('handleTokenRefreshFailedNotification', () => {
  it('treats missing prefs as both-enabled and records both side effects', async () => {
    const prefs = { loadPrefs: vi.fn().mockResolvedValue(null) };
    const store = { insertNotification: vi.fn(), insertEmailLog: vi.fn() };
    const smtp = { sendEmail: vi.fn().mockResolvedValue({ status: 'sent', messageId: 'm1' }) };

    await handleTokenRefreshFailedNotification(
      { prefs, store, smtp },
      seedTokenJob(JOB_NAMES.tokenRefreshFailed, { eventType: 'token_refresh_failed' }),
    );

    expect(store.insertNotification).toHaveBeenCalled();
    expect(smtp.sendEmail).toHaveBeenCalled();
  });
});
