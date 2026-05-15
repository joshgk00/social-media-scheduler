import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeleteProfileDialog } from '../DeleteProfileDialog';
import { apiClient } from '../../../lib/api-client';
import type { DeletePreview, SocialProfile } from '../../../hooks/use-profiles';

const PROFILE_ID = 'p-1';

function buildProfile(): SocialProfile {
  return {
    id: PROFILE_ID,
    platform: 'twitter',
    platformUserId: 'user-1',
    platformAccountId: null,
    displayName: 'My Handle',
    handle: 'myhandle',
    avatarUrl: null,
    connectedAt: '2026-04-20T00:00:00.000Z',
    lastPublishedAt: null,
    tokenStatus: 'active',
    tokenExpiresAt: null,
    tokenHealthCheckedAt: null,
    notes: null,
    nextScheduledAt: null,
    monthlyTweetBudget: 500,
    warnThresholdPercent: 80,
  };
}

function mockPreview(preview: DeletePreview) {
  // Route `apiClient.get` by URL so an invalidate-triggered refetch of the
  // `/api/profiles` list resolves to an array, not a DeletePreview object.
  vi.spyOn(apiClient, 'get').mockImplementation((path: string) => {
    if (path.endsWith('/delete-preview')) {
      return Promise.resolve(preview) as Promise<unknown>;
    }
    if (path === '/api/profiles') {
      return Promise.resolve([buildProfile()]) as Promise<unknown>;
    }
    return Promise.resolve(null) as Promise<unknown>;
  });
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  queryClient.setQueryData(['profiles'], [buildProfile()]);
  const onOpenChange = vi.fn();
  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={queryClient}>
        <DeleteProfileDialog
          profileId={PROFILE_ID}
          open
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>,
    ),
  };
}

describe('DeleteProfileDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the delete preview on open and renders cascade counts', async () => {
    const preview: DeletePreview = {
      drafts: 2,
      scheduled: 1,
      ownedQueues: 3,
      tagsLosingLastUse: 0,
      inFlight: 0,
    };
    mockPreview(preview);

    renderDialog();

    await screen.findByText('2 draft posts will be deleted');
    expect(screen.getByText('1 scheduled posts will be deleted')).toBeInTheDocument();
    expect(screen.getByText('3 queues will be deleted')).toBeInTheDocument();
    // Tags line hidden (zero count).
    expect(
      screen.queryByText(/tags will have no remaining profile/),
    ).toBeNull();
  });

  it('renders the all-zeros fallback when no cascade counts are non-zero', async () => {
    mockPreview({
      drafts: 0,
      scheduled: 0,
      ownedQueues: 0,
      tagsLosingLastUse: 0,
      inFlight: 0,
    });

    renderDialog();

    await screen.findByText('No posts, queues, or tags are affected.');
  });

  it('disables the confirm button when inFlight > 0', async () => {
    mockPreview({
      drafts: 0,
      scheduled: 0,
      ownedQueues: 0,
      tagsLosingLastUse: 0,
      inFlight: 2,
    });

    renderDialog();

    await screen.findByText(/Can't delete: 2 posts are currently publishing/);
    expect(
      screen.getByRole('button', { name: 'Delete profile' }),
    ).toBeDisabled();
  });

  it('Delete profile triggers the delete mutation and closes', async () => {
    mockPreview({
      drafts: 0,
      scheduled: 0,
      ownedQueues: 0,
      tagsLosingLastUse: 0,
      inFlight: 0,
    });
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({
      success: true,
    });

    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const confirmButton = await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Delete profile' });
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(`/api/profiles/${PROFILE_ID}`);
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('Keep profile closes without calling delete', async () => {
    mockPreview({
      drafts: 0,
      scheduled: 0,
      ownedQueues: 0,
      tagsLosingLastUse: 0,
      inFlight: 0,
    });
    const deleteSpy = vi.spyOn(apiClient, 'delete');

    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await screen.findByText('No posts, queues, or tags are affected.');
    await user.click(screen.getByRole('button', { name: 'Keep profile' }));

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
