import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { rateLimitUpdateSchema, type RateLimitState } from '@sms/shared';
import { RateLimitSettingsDialog } from '../../components/profiles/RateLimitSettingsDialog';
import { apiClient } from '../../lib/api-client';

const SAMPLE_PROFILE_ID = '22222222-2222-2222-2222-222222222222';

function buildRateLimitState(overrides: Partial<RateLimitState> = {}): RateLimitState {
  return {
    platform: 'twitter',
    profileId: SAMPLE_PROFILE_ID,
    currentCount: 120,
    budget: 500,
    warnThresholdPercent: 80,
    warnThresholdHit: false,
    blockThresholdHit: false,
    monthStartUtc: '2026-04-01T00:00:00.000Z',
    ...overrides,
  } as RateLimitState;
}

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RateLimitSettingsDialog
        profileId={SAMPLE_PROFILE_ID}
        handle="testuser"
        open
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
}

describe('RateLimitSettingsDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the current usage readout populated from the rate-limit query', async () => {
    vi.spyOn(apiClient, 'getRateLimit').mockResolvedValue(
      buildRateLimitState({ currentCount: 120, budget: 500 }),
    );

    renderDialog();

    await screen.findByText('Used this month: 120 of 500 (24%)');
    expect(screen.getByRole('heading', { name: 'Rate Limit — @testuser' })).toBeInTheDocument();
  });

  it('submits valid values through the useUpdateRateLimit mutation', async () => {
    vi.spyOn(apiClient, 'getRateLimit').mockResolvedValue(buildRateLimitState());
    const updateSpy = vi
      .spyOn(apiClient, 'updateRateLimit')
      .mockResolvedValue(buildRateLimitState({ budget: 1000 }));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderDialog(onOpenChange);

    // Wait for the form to populate from the query.
    await screen.findByText('Used this month: 120 of 500 (24%)');
    const budgetInput = screen.getByLabelText('Monthly tweet budget');
    await user.clear(budgetInput);
    await user.type(budgetInput, '1000');

    await user.click(screen.getByRole('button', { name: /Save Budget/ }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(SAMPLE_PROFILE_ID, {
        monthlyTweetBudget: 1000,
        warnThresholdPercent: 80,
      });
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('shows a validation error for budget value 0', async () => {
    vi.spyOn(apiClient, 'getRateLimit').mockResolvedValue(buildRateLimitState());
    const user = userEvent.setup();

    renderDialog();

    await screen.findByText('Used this month: 120 of 500 (24%)');
    const budgetInput = screen.getByLabelText('Monthly tweet budget');
    await user.clear(budgetInput);
    await user.type(budgetInput, '0');
    await user.click(screen.getByRole('button', { name: /Save Budget/ }));

    await screen.findByText('Budget must be between 1 and 10,000.');
  });

  it('shows a validation error for budget value 10001', async () => {
    vi.spyOn(apiClient, 'getRateLimit').mockResolvedValue(buildRateLimitState());
    const user = userEvent.setup();

    renderDialog();

    await screen.findByText('Used this month: 120 of 500 (24%)');
    const budgetInput = screen.getByLabelText('Monthly tweet budget');
    await user.clear(budgetInput);
    await user.type(budgetInput, '10001');
    await user.click(screen.getByRole('button', { name: /Save Budget/ }));

    await screen.findByText('Budget must be between 1 and 10,000.');
  });

  it('shows a validation error for warn threshold value 100', async () => {
    vi.spyOn(apiClient, 'getRateLimit').mockResolvedValue(buildRateLimitState());
    const user = userEvent.setup();

    renderDialog();

    await screen.findByText('Used this month: 120 of 500 (24%)');
    const warnInput = screen.getByLabelText('Warning threshold');
    await user.clear(warnInput);
    await user.type(warnInput, '100');
    await user.click(screen.getByRole('button', { name: /Save Budget/ }));

    await screen.findByText('Threshold must be between 1 and 99.');
  });

  it('rejects unknown keys at the schema layer (strict mode sanity check)', () => {
    const result = rateLimitUpdateSchema.safeParse({
      monthlyTweetBudget: 500,
      warnThresholdPercent: 80,
      userId: 'attacker-injected',
    });
    expect(result.success).toBe(false);
  });
});
