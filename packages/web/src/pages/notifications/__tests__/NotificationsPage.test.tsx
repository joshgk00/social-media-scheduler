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
    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Unread' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Read' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeInTheDocument();
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

    render(
      <NotificationsPage
        rows={[{ id: 'n1', title: 'Publish failed', severity: 'error', linkPath: '/posts/1' }]}
        onMarkRead={onMarkRead}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'View post' }));

    expect(onMarkRead).toHaveBeenCalledWith('n1');
  });

  it('formats bulk failures with an error report action', async () => {
    const onMarkRead = vi.fn();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    const bulkOperationId = '55555555-5555-4555-8555-555555555555';

    render(
      <NotificationsPage
        rows={[
          {
            id: 'bulk-notification',
            eventType: 'bulk_completed',
            title: 'Bulk complete',
            payload: {
              operation: 'bulk.profile-modify-tags',
              successCount: 10,
              failureCount: 1,
              errorReportPath: `/var/app/data/media/bulk-errors/${bulkOperationId}/errors.csv`,
            },
          },
        ]}
        onMarkRead={onMarkRead}
      />,
    );

    expect(screen.getByText('Modify tags complete with 1 errors.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open report' }));

    expect(onMarkRead).toHaveBeenCalledWith('bulk-notification');
    expect(openSpy).toHaveBeenCalledWith(
      `/media/bulk-errors/${bulkOperationId}/errors.csv`,
      '_blank',
      'noopener,noreferrer',
    );

    openSpy.mockRestore();
  });
});
