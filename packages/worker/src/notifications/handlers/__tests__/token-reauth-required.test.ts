import { describe, expect, it, vi } from 'vitest';
import { JOB_NAMES } from '@sms/shared';
import { seedTokenJob } from '../../__tests__/helpers/seed-notification-job.js';

import { handleTokenReauthRequiredNotification } from '../token-reauth-required.handler.js';

describe('handleTokenReauthRequiredNotification', () => {
  it('forces both side effects for always-on re-auth required events', async () => {
    const prefs = { loadPrefs: vi.fn().mockResolvedValue({ isInAppEnabled: false, isEmailEnabled: false }) };
    const store = { insertNotification: vi.fn(), insertEmailLog: vi.fn() };
    const smtp = { sendEmail: vi.fn().mockResolvedValue({ status: 'sent', messageId: 'm1' }) };

    await handleTokenReauthRequiredNotification(
      { prefs, store, smtp },
      seedTokenJob(JOB_NAMES.tokenReauthRequired, { eventType: 'token_reauth_required' }),
    );

    expect(store.insertNotification).toHaveBeenCalled();
    expect(smtp.sendEmail).toHaveBeenCalled();
  });
});
