import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import SettingsPage from '../SettingsPage';

vi.mock('../../../hooks/use-auth', () => ({
  useAuth: () => ({
    isLoading: false,
    data: {
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      firstName: 'Test',
      lastName: 'User',
      profileImagePath: null,
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      entriesPerPage: 25,
      defaultLandingPage: '/dashboard',
      totpEnabled: false,
      lastLoginAt: null,
    },
  }),
}));

vi.mock('../components/ProfileSection', () => ({ ProfileSection: () => <div>Profile panel</div> }));
vi.mock('../components/PreferencesSection', () => ({ PreferencesSection: () => <div>Preferences panel</div> }));
vi.mock('../components/SecuritySection', () => ({ SecuritySection: () => <div>Security panel</div> }));
vi.mock('../components/NotificationsTab', () => ({ NotificationsTab: () => <div>Notifications panel</div> }));
vi.mock('../components/SnippetsSection', () => ({ SnippetsSection: () => <div>Snippets panel</div> }));
vi.mock('../components/StorageUsageCard', () => ({ StorageUsageCard: () => <div>Storage panel</div> }));
vi.mock('../components/AdvancedSection', () => ({ AdvancedSection: () => <div>Advanced panel</div> }));

function renderSettings(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/:tab" element={<SettingsPage />} />
        <Route path="/settings/profile" element={<div>Redirected profile</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SettingsPage', () => {
  it('renders all direct settings tab links', () => {
    renderSettings('/settings/snippets');

    for (const label of ['Profile', 'Preferences', 'Security', 'Notifications', 'Snippets', 'Storage', 'Advanced']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText('Snippets panel')).toBeInTheDocument();
  });

  it('redirects unknown settings tabs to profile', () => {
    renderSettings('/settings/not-a-tab');

    expect(screen.getByText('Redirected profile')).toBeInTheDocument();
  });
});
