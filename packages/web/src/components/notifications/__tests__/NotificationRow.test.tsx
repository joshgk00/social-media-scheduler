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
});
