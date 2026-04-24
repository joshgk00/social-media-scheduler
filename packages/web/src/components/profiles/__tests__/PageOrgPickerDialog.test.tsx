import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PageOrgPickerDialog } from '../PageOrgPickerDialog';
import { apiClient } from '../../../lib/api-client';
import type { PendingSelection } from '../../../hooks/use-oauth';

const TEMP_TOKEN = 'temp-abc-123';

function renderDialog(overrides: { open?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const onOpenChange = vi.fn();
  const onMismatch = vi.fn();
  const onSuccess = vi.fn();
  return {
    onOpenChange,
    onMismatch,
    onSuccess,
    ...render(
      <QueryClientProvider client={queryClient}>
        <PageOrgPickerDialog
          tempToken={TEMP_TOKEN}
          open={overrides.open ?? true}
          onOpenChange={onOpenChange}
          onMismatch={onMismatch}
          onSuccess={onSuccess}
        />
      </QueryClientProvider>,
    ),
  };
}

describe('PageOrgPickerDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders skeleton rows while the pending selection loads', () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => {}));
    renderDialog();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.getByText('Loading your accounts…')).toBeInTheDocument();
  });

  it('auto-selects the single option when exactly one account is returned', async () => {
    const selection: PendingSelection = {
      platform: 'linkedin',
      accounts: [
        {
          platformAccountId: null,
          kind: 'personal',
          displayName: 'Josh Slaughter',
        },
      ],
    };
    vi.spyOn(apiClient, 'get').mockResolvedValue(selection);
    renderDialog();

    await screen.findByText('Confirm LinkedIn connection');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Connect Josh Slaughter/ }),
      ).not.toBeDisabled();
    });
  });

  it('renders a RadioGroup when multiple LinkedIn orgs are returned', async () => {
    const selection: PendingSelection = {
      platform: 'linkedin',
      accounts: [
        {
          platformAccountId: 'urn:li:organization:111',
          kind: 'organization',
          displayName: 'Acme Corp',
          orgName: 'Acme Corp',
        },
        {
          platformAccountId: 'urn:li:organization:222',
          kind: 'organization',
          displayName: 'Beta Corp',
          orgName: 'Beta Corp',
        },
        {
          platformAccountId: 'urn:li:organization:333',
          kind: 'organization',
          displayName: 'Gamma Corp',
          orgName: 'Gamma Corp',
        },
      ],
    };
    vi.spyOn(apiClient, 'get').mockResolvedValue(selection);
    renderDialog();

    await screen.findByText('Pick a LinkedIn account');
    // Three radio items visible, one per org.
    const radios = await screen.findAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('emits a mismatch payload via onMismatch when the server returns 409', async () => {
    const selection: PendingSelection = {
      platform: 'linkedin',
      accounts: [
        {
          platformAccountId: null,
          kind: 'personal',
          displayName: 'Josh Slaughter',
        },
      ],
    };
    vi.spyOn(apiClient, 'get').mockResolvedValue(selection);
    const mismatchError = Object.assign(new Error('mismatched_account'), {
      status: 409,
      body: {
        error: 'mismatched_account',
        existingHandle: 'oldhandle',
        incomingHandle: 'newhandle',
        tempToken: TEMP_TOKEN,
      },
    });
    vi.spyOn(apiClient, 'post').mockRejectedValue(mismatchError);

    const { onMismatch } = renderDialog();
    const user = userEvent.setup();

    await screen.findByText('Confirm LinkedIn connection');
    const finalizeButton = await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Connect Josh Slaughter/ });
      expect(btn).not.toBeDisabled();
      return btn;
    });

    await user.click(finalizeButton);

    await waitFor(() => {
      expect(onMismatch).toHaveBeenCalledWith({
        existingHandle: 'oldhandle',
        incomingHandle: 'newhandle',
        tempToken: TEMP_TOKEN,
        platformAccountId: null,
      });
    });
  });

  it('renders the LinkedIn empty-state copy when zero accounts', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      platform: 'linkedin',
      accounts: [],
    } satisfies PendingSelection);

    renderDialog();

    await screen.findByText(
      'No LinkedIn accounts you can post to. Grant your account posting permission and reconnect.',
    );
    // Finalize button is NOT rendered when empty.
    expect(screen.queryByRole('button', { name: /^Connect/ })).toBeNull();
    // Go back button remains.
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
  });
});
