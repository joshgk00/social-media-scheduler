import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SocialProfile } from '../../../hooks/use-profiles';
import { ProfileCard } from '../ProfileCard';

function buildProfile(overrides: Partial<SocialProfile> = {}): SocialProfile {
  return {
    id: 'profile-1',
    platform: 'twitter',
    platformUserId: 'platform-1',
    platformAccountId: null,
    displayName: 'Personal Twitter',
    handle: '@joshslaughter',
    avatarUrl: null,
    connectedAt: '2026-05-01T12:00:00.000Z',
    lastPublishedAt: '2026-05-20T12:00:00.000Z',
    tokenStatus: 'active',
    tokenExpiresAt: null,
    tokenHealthCheckedAt: '2026-05-21T12:00:00.000Z',
    notes: null,
    nextScheduledAt: '2026-05-22T12:00:00.000Z',
    monthlyTweetBudget: 500,
    warnThresholdPercent: 80,
    ...overrides,
  };
}

const handlers = {
  onEdit: vi.fn(),
  onReconnect: vi.fn(),
  onDelete: vi.fn(),
};

describe('ProfileCard', () => {
  it('renders the four-row hierarchy with a platform glyph and normalized handle', () => {
    render(
      <ProfileCard
        profile={buildProfile()}
        rateLimitIndicator={<div>Rate limit 87 / 500</div>}
        onEditRateLimit={vi.fn()}
        {...handlers}
      />,
    );

    expect(screen.getByText('Personal Twitter')).toBeInTheDocument();
    expect(screen.getByText('@joshslaughter')).toBeInTheDocument();
    expect(screen.getByLabelText('X')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Twitter / X')).toBeInTheDocument();
    expect(screen.getByText('Rate limit 87 / 500')).toBeInTheDocument();
    expect(screen.getByText(/Last:/)).toBeInTheDocument();
    expect(screen.getByText(/Next:/)).toBeInTheDocument();
  });

  it('renders provided rate-limit state for LinkedIn and Facebook', () => {
    render(
      <ProfileCard
        profile={buildProfile({
          id: 'profile-linkedin',
          platform: 'linkedin',
          displayName: 'CMW LinkedIn',
          handle: 'clicks-mortar',
        })}
        rateLimitIndicator={<div>Rate limit 12 / 100</div>}
        {...handlers}
      />,
    );

    expect(screen.getByText('CMW LinkedIn')).toBeInTheDocument();
    expect(screen.getByText('@clicks-mortar')).toBeInTheDocument();
    expect(screen.getByLabelText('LinkedIn')).toBeInTheDocument();
    expect(screen.getByText('Rate limit 12 / 100')).toBeInTheDocument();
  });

  it('shows a recoverable warning pill for profiles that need re-authentication', () => {
    render(
      <ProfileCard
        profile={buildProfile({
          tokenStatus: 'needs_reauth',
          displayName: 'Old Test Account',
        })}
        {...handlers}
      />,
    );

    expect(screen.getByText('Needs reauth')).toBeInTheDocument();
  });

  it('reserves the deprecated pill for expired profiles', () => {
    render(
      <ProfileCard
        profile={buildProfile({
          tokenStatus: 'expired',
          displayName: 'Expired Test Account',
        })}
        {...handlers}
      />,
    );

    expect(screen.getByText('Deprecated')).toBeInTheDocument();
  });
});
