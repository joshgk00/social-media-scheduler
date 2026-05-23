import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationRow } from '../NotificationRow';
import type { NotificationRow as NotificationRowData } from '@/hooks/use-notifications';

function makeNotification(
  overrides: Partial<NotificationRowData> = {},
): NotificationRowData {
  return {
    id: 'notification-1',
    eventType: 'queue_empty',
    severity: 'info',
    title: 'Queue is empty',
    body: 'Add posts to keep publishing.',
    linkPath: '/queues/queue-1',
    payload: {},
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('NotificationRow', () => {
  it('navigates linked info notifications instead of only dismissing them', async () => {
    const user = userEvent.setup();
    const onMarkRead = vi.fn().mockResolvedValue(undefined);
    const onNavigate = vi.fn();

    render(
      <NotificationRow
        notification={makeNotification()}
        onMarkRead={onMarkRead}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View' }));

    expect(onMarkRead).toHaveBeenCalledWith('notification-1');
    expect(onNavigate).toHaveBeenCalledWith('/queues/queue-1');
  });

  it('allows bulk import completion links with bulk operation ids', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <NotificationRow
        notification={makeNotification({
          eventType: 'bulk_completed',
          title: 'Import complete',
          linkPath: '/posts?bulkOp=55555555-5555-4555-8555-555555555555',
        })}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View' }));

    expect(onNavigate).toHaveBeenCalledWith('/posts?bulkOp=55555555-5555-4555-8555-555555555555');
  });

  it('does not navigate uppercase bulk operation route or query keys', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <NotificationRow
        notification={makeNotification({
          eventType: 'bulk_completed',
          title: 'Import complete',
          linkPath: '/POSTS?BULKOP=55555555-5555-4555-8555-555555555555',
        })}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss Import complete' }));

    expect(onNavigate).not.toHaveBeenCalled();
  });
});
