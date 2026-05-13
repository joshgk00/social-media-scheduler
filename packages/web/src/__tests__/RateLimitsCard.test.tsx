// Wave 0 RED stub for the dashboard RateLimitsCard widget (LIMIT-08).
// Plan 05b ships `<RateLimitsCard />` and the `useAllProfilesRateLimits`
// hook it consumes. Wave 0 mocks the hook so the component test is
// deterministic.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RateLimitsCard } from '../components/dashboard/RateLimitsCard';

const useAllProfilesRateLimitsMock = vi.fn();

vi.mock('../hooks/useAllProfilesRateLimits', () => ({
  useAllProfilesRateLimits: () => useAllProfilesRateLimitsMock(),
}));

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('<RateLimitsCard />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no profiles connected', () => {
    useAllProfilesRateLimitsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    renderWithQuery(<RateLimitsCard />);
    expect(screen.getByText(/No connected profiles yet/i)).toBeInTheDocument();
  });

  it('renders skeleton rows when query is loading', () => {
    useAllProfilesRateLimitsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    renderWithQuery(<RateLimitsCard />);
    expect(
      screen.getAllByRole('status', { name: /loading rate limits/i }).length,
    ).toBeGreaterThan(0);
  });

  it('renders error fallback when the query errored', () => {
    useAllProfilesRateLimitsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    renderWithQuery(<RateLimitsCard />);
    expect(screen.getByText(/Couldn't load rate limits/i)).toBeInTheDocument();
  });

  it('applies green band when usage <50% (30/100)', () => {
    useAllProfilesRateLimitsMock.mockReturnValue({
      data: [
        {
          profileId: 'p1',
          platform: 'linkedin',
          handle: 'tester',
          currentCount: 30,
          budget: 100,
          windowResetAt: '2026-04-27T00:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
    });
    renderWithQuery(<RateLimitsCard />);
    const bar = screen.getByRole('progressbar', {
      name: /linkedin rate limit usage/i,
    });
    expect(bar).toHaveAttribute('aria-valuenow', '30');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    // Color band: green dot.
    const dot = bar.parentElement?.querySelector('[data-band="green"]');
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass('bg-success');
  });

  it('applies yellow band when usage 50-80% (75/100)', () => {
    useAllProfilesRateLimitsMock.mockReturnValue({
      data: [
        {
          profileId: 'p1',
          platform: 'linkedin',
          handle: 'tester',
          currentCount: 75,
          budget: 100,
          windowResetAt: '2026-04-27T00:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
    });
    renderWithQuery(<RateLimitsCard />);
    const dot = screen.getByLabelText(/usage band: yellow/i);
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass('bg-warning');
  });

  it('applies red band when usage >80% (95/100)', () => {
    useAllProfilesRateLimitsMock.mockReturnValue({
      data: [
        {
          profileId: 'p1',
          platform: 'linkedin',
          handle: 'tester',
          currentCount: 95,
          budget: 100,
          windowResetAt: '2026-04-27T00:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
    });
    renderWithQuery(<RateLimitsCard />);
    const dot = screen.getByLabelText(/usage band: red/i);
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass('bg-destructive');
  });

  // Issue #35: the Twitter row must render a FUTURE reset date. Before the
  // fix the row displayed `monthStartUtc` and showed a past date like
  // "Resets Mar 31" on May 13. Pin the clock so the relative-time assertion
  // is deterministic and so we can also assert the buggy past-date label
  // is gone.
  describe('Twitter reset date (issue #35)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-13T12:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders the relative future reset and not the past month-start', () => {
      useAllProfilesRateLimitsMock.mockReturnValue({
        data: [
          {
            profileId: 'p-twitter',
            platform: 'twitter',
            handle: 'tester',
            currentCount: 10,
            budget: 500,
            // Start of next UTC month relative to pinned now (= 18d ahead).
            windowResetAt: '2026-06-01T00:00:00.000Z',
            monthStartUtc: '2026-05-01T00:00:00.000Z',
          },
        ],
        isLoading: false,
        isError: false,
      });
      renderWithQuery(<RateLimitsCard />);

      // Positive: deterministic relative copy from formatResetTime.
      expect(screen.getByText(/Resets in 18d/)).toBeInTheDocument();
      // Negative: the buggy "Resets May 1" label (monthStartUtc-as-reset)
      // must not render. Anchors the assertion to the actual bug shape.
      expect(screen.queryByText(/Resets May 1\b/)).not.toBeInTheDocument();
    });
  });

  it('progress bar exposes role="progressbar" with aria-valuenow + aria-valuemax + aria-label', () => {
    useAllProfilesRateLimitsMock.mockReturnValue({
      data: [
        {
          profileId: 'p1',
          platform: 'facebook',
          handle: 'mypage',
          currentCount: 10,
          budget: 25,
          windowResetAt: '2026-04-26T13:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
    });
    renderWithQuery(<RateLimitsCard />);
    const bar = screen.getByRole('progressbar', {
      name: /facebook rate limit usage/i,
    });
    expect(bar).toHaveAttribute('aria-valuenow', '10');
    expect(bar).toHaveAttribute('aria-valuemax', '25');
  });
});
