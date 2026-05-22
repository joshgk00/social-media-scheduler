import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SidebarLayout } from '../SidebarLayout';

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    data: {
      email: 'operator@example.com',
      firstName: 'Ops',
      lastName: 'User',
      username: 'ops',
      profileImagePath: null,
    },
  }),
  useLogout: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock('../NotificationBell', () => ({ NotificationBell: () => <button type="button">Notifications</button> }));

describe('SidebarLayout', () => {
  it('focuses topbar search with the command palette shortcut', async () => {
    render(
      <MemoryRouter>
        <SidebarLayout />
      </MemoryRouter>,
    );

    const search = screen.getByRole('searchbox', { name: /jump to a page/i });

    await userEvent.keyboard('{Meta>}k{/Meta}');

    expect(search).toHaveFocus();
    expect(search).toHaveAttribute('aria-keyshortcuts', 'Meta+K Control+K');
  });
});
