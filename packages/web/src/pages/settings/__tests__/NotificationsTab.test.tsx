import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NotificationsTab } from '../components/NotificationsTab';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotificationsTab', () => {
  it('renders the settings event rows and disables required switches', () => {
    render(<NotificationsTab smtpStatus={{ configured: true }} />);

    for (const label of [
      'Publish failed',
      'Token expiring soon',
      'Re-authentication required',
      'Token revoked',
      'Rate limit reached',
      'Queue finished',
      'Bulk import complete',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('row')).toHaveLength(8);
    expect(screen.getAllByText('Required event — cannot be disabled in-app').length).toBeGreaterThan(0);
  });

  it('renders deferred and in-app-only helper copy', () => {
    render(<NotificationsTab smtpStatus={{ configured: true }} />);

    expect(screen.getByText('Available when bulk import notifications are enabled.')).toBeInTheDocument();
    expect(screen.getByText('In-app only — no email for this event.')).toBeInTheDocument();
  });

  it('renders save and discard actions disabled while the form is clean', () => {
    render(<NotificationsTab smtpStatus={{ configured: true }} />);

    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
  });

  it('discards a changed toggle and returns the form to clean state', async () => {
    const user = userEvent.setup();

    render(<NotificationsTab smtpStatus={{ configured: true }} />);

    const publishFailedSwitch = screen.getByRole('switch', {
      name: 'Publish failed in-app notifications',
    });
    const discardButton = screen.getByRole('button', { name: 'Discard changes' });
    const saveButton = screen.getByRole('button', { name: 'Save preferences' });

    expect(publishFailedSwitch).toBeChecked();
    expect(discardButton).toBeDisabled();
    expect(saveButton).toBeDisabled();

    await user.click(publishFailedSwitch);

    expect(publishFailedSwitch).not.toBeChecked();
    expect(discardButton).toBeEnabled();
    expect(saveButton).toBeEnabled();

    await user.click(discardButton);

    expect(publishFailedSwitch).toBeChecked();
    expect(discardButton).toBeDisabled();
    expect(saveButton).toBeDisabled();
  });

  it('clears dirty state after toggles are changed back to the saved values', async () => {
    const user = userEvent.setup();

    render(<NotificationsTab smtpStatus={{ configured: true }} />);

    const tokenExpiringSwitch = screen.getByRole('switch', {
      name: 'Token expiring soon in-app notifications',
    });
    const queueFinishedSwitch = screen.getByRole('switch', {
      name: 'Queue finished in-app notifications',
    });
    const saveButton = screen.getByRole('button', { name: 'Save preferences' });

    await user.click(tokenExpiringSwitch);
    expect(saveButton).toBeEnabled();

    await user.click(tokenExpiringSwitch);
    expect(saveButton).toBeDisabled();

    await user.click(tokenExpiringSwitch);
    await user.click(queueFinishedSwitch);
    expect(saveButton).toBeEnabled();

    await user.click(tokenExpiringSwitch);
    await user.click(queueFinishedSwitch);
    expect(saveButton).toBeDisabled();
  });

  it('saves dirty prefs and shows SMTP-not-configured banner', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<NotificationsTab smtpStatus={{ configured: false }} onSave={onSave} />);
    expect(screen.getByText(/SMTP isn't configured/i)).toBeInTheDocument();
    expect(screen.getByText('Email (SMTP off)')).toBeInTheDocument();

    await user.click(screen.getAllByRole('switch')[0]);
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));

    expect(onSave).toHaveBeenCalled();
    expect(await screen.findByText('Preferences saved')).toBeInTheDocument();
  });
});
