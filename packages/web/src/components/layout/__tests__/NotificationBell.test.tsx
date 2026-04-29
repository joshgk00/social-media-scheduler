import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { NotificationBell } from '../NotificationBell';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotificationBell', () => {
  it('renders the bell trigger and hides the badge when unread count is zero', () => {
    render(<NotificationBell unreadCount={0} recentNotifications={[]} />);

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it.each([[1, '1'], [99, '99'], [100, '99+']])('renders badge label for %s unread', (unreadCount, badgeLabel) => {
    render(<NotificationBell unreadCount={unreadCount} recentNotifications={[]} />);

    expect(screen.getByRole('button', { name: `Notifications, ${unreadCount} unread` })).toBeInTheDocument();
    expect(screen.getByText(badgeLabel)).toBeInTheDocument();
  });

  it('opens dropdown without marking rows read and disables mark-all when empty', async () => {
    const onMarkAllRead = vi.fn();
    const user = userEvent.setup();

    render(<NotificationBell unreadCount={0} recentNotifications={[]} onMarkAllRead={onMarkAllRead} />);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mark all read/ })).toBeDisabled();
    expect(onMarkAllRead).not.toHaveBeenCalled();
  });

  it('keeps the unread trigger label available while the dropdown is open', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <NotificationBell
          unreadCount={2}
          recentNotifications={[
            { id: 'notification-a', title: 'First notification' },
            { id: 'notification-b', title: 'Second notification' },
          ]}
        />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: 'Notifications, 2 unread' });

    await user.click(trigger);

    expect(screen.getByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument();
    expect(screen.getByText('First notification')).toBeInTheDocument();
  });
});
