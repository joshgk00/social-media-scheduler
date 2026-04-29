import { describe, expect, it } from 'vitest';

import { renderAllNotificationTemplates } from '../templates/index.js';

describe('notification email templates', () => {
  it('renders subject, text, and html for every email-capable event', () => {
    const templates = renderAllNotificationTemplates({
      appBaseUrl: 'https://scheduler.example.com',
      errorMessage: '<script>alert(1)</script>',
      profileName: 'Example & Co',
    });

    expect(templates.length).toBeGreaterThan(0);
    for (const emailTemplate of templates) {
      expect(emailTemplate.subject).not.toMatch(/[\r\n]/);
      expect(emailTemplate.text).not.toHaveLength(0);
      expect(emailTemplate.html).toContain('https://scheduler.example.com');
      expect(emailTemplate.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(emailTemplate.html).not.toContain('<script>');
      expect(emailTemplate.html).not.toContain('localhost:3000');
      expect(emailTemplate.html).not.toContain('<tr><td style="padding:0 24px;"><tr>');
      expect(emailTemplate.html).toContain('Notification settings');
      expect(emailTemplate.html).not.toContain('/settings/notifications');
    }
  });
});
