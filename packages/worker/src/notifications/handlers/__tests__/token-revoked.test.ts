import { describe, expect, it, vi } from 'vitest';
import { JOB_NAMES } from '@sms/shared';
import { seedTokenJob } from '../../__tests__/helpers/seed-notification-job.js';

import { handleTokenRevokedNotification } from '../token-revoked.handler.js';

describe('handleTokenRevokedNotification', () => {
  it('forces email and in-app notification when the prefs row disables both', async () => {
    const prefs = { loadPrefs: vi.fn().mockResolvedValue({ isInAppEnabled: false, isEmailEnabled: false }) };
    const store = { insertNotification: vi.fn(), insertEmailLog: vi.fn() };
    const smtp = { sendEmail: vi.fn().mockResolvedValue({ status: 'sent', messageId: 'm1' }) };

    await handleTokenRevokedNotification(
      { prefs, store, smtp },
      seedTokenJob(JOB_NAMES.tokenRevoked, { eventType: 'token_revoked' }),
    );

    expect(store.insertNotification).toHaveBeenCalled();
    expect(smtp.sendEmail).toHaveBeenCalled();
  });
});
