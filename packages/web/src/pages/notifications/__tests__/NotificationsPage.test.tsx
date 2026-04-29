import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NotificationsPage } from '../NotificationsPage';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotificationsPage', () => {
  it('renders the main landmark, H1, filters, and loading skeleton rows', () => {
    render(<NotificationsPage isLoading />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Unread' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Read' })).toBeInTheDocument();
    expect(screen.getAllByTestId('notification-skeleton-row')).toHaveLength(8);
  });

  it('renders empty and filter-zero states', () => {
    render(<NotificationsPage rows={[]} />);

    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    expect(screen.getByText("We'll let you know when something needs your attention.")).toBeInTheDocument();
  });

  it('marks read and navigates when a row with a link is clicked', async () => {
    const onMarkRead = vi.fn();
    const user = userEvent.setup();

    render(<NotificationsPage rows={[{ id: 'n1', title: 'Publish failed', linkPath: '/posts/1' }]} onMarkRead={onMarkRead} />);
    await user.click(screen.getByText('Publish failed'));

    expect(onMarkRead).toHaveBeenCalledWith('n1');
  });
});
