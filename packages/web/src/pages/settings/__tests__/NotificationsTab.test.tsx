import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NOTIFICATION_EVENTS } from '@sms/shared';

import { NotificationsTab } from '../components/NotificationsTab';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotificationsTab', () => {
  it('renders one row per event and disables always-on switches', () => {
    render(<NotificationsTab smtpStatus={{ configured: true }} />);

    for (const eventSpec of NOTIFICATION_EVENTS) {
      expect(screen.getByText(eventSpec.label)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('row')).toHaveLength(NOTIFICATION_EVENTS.length + 1);
    expect(screen.getAllByText('Required notification — cannot be disabled').length).toBeGreaterThan(0);
  });

  it('renders deferred and in-app-only helper copy', () => {
    render(<NotificationsTab smtpStatus={{ configured: true }} />);

    expect(screen.getByText('Available when bulk operations ship in Phase 10.')).toBeInTheDocument();
    expect(screen.getAllByText('In-app only — no email for this event.').length).toBeGreaterThanOrEqual(2);
  });

  it('renders save and discard actions disabled while the form is clean', () => {
    render(<NotificationsTab smtpStatus={{ configured: true }} />);

    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
  });

  it('discards a changed toggle and returns the form to clean state', async () => {
    const user = userEvent.setup();

    render(<NotificationsTab smtpStatus={{ configured: true }} />);

    const autoDestructSwitch = screen.getByRole('switch', {
      name: 'Auto-destruct failed in-app notifications',
    });
    const discardButton = screen.getByRole('button', { name: 'Discard changes' });
    const saveButton = screen.getByRole('button', { name: 'Save preferences' });

    expect(autoDestructSwitch).toBeChecked();
    expect(discardButton).toBeDisabled();
    expect(saveButton).toBeDisabled();

    await user.click(autoDestructSwitch);

    expect(autoDestructSwitch).not.toBeChecked();
    expect(discardButton).toBeEnabled();
    expect(saveButton).toBeEnabled();

    await user.click(discardButton);

    expect(autoDestructSwitch).toBeChecked();
    expect(discardButton).toBeDisabled();
    expect(saveButton).toBeDisabled();
  });

  it('clears dirty state after toggles are changed back to the saved values', async () => {
    const user = userEvent.setup();

    render(<NotificationsTab smtpStatus={{ configured: true }} />);

    const rateLimitWarningSwitch = screen.getByRole('switch', {
      name: 'Rate limit warning in-app notifications',
    });
    const queueEmptySwitch = screen.getByRole('switch', {
      name: 'Queue empty in-app notifications',
    });
    const saveButton = screen.getByRole('button', { name: 'Save preferences' });

    await user.click(rateLimitWarningSwitch);
    expect(saveButton).toBeEnabled();

    await user.click(rateLimitWarningSwitch);
    expect(saveButton).toBeDisabled();

    await user.click(rateLimitWarningSwitch);
    await user.click(queueEmptySwitch);
    expect(saveButton).toBeEnabled();

    await user.click(rateLimitWarningSwitch);
    await user.click(queueEmptySwitch);
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
