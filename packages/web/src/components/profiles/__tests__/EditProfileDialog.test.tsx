import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditProfileDialog } from '../EditProfileDialog';
import { apiClient } from '../../../lib/api-client';
import type { SocialProfile } from '../../../hooks/use-profiles';

const PROFILE_ID = 'p-1';

function buildProfile(overrides: Partial<SocialProfile> = {}): SocialProfile {
  return {
    id: PROFILE_ID,
    platform: 'linkedin',
    platformUserId: 'user-1',
    platformAccountId: null,
    displayName: 'My LinkedIn',
    handle: 'mylinkedin',
    avatarUrl: null,
    connectedAt: '2026-04-20T00:00:00.000Z',
    lastPublishedAt: null,
    tokenStatus: 'active',
    tokenExpiresAt: null,
    tokenHealthCheckedAt: null,
    notes: 'Existing notes content.',
    nextScheduledAt: null,
    monthlyTweetBudget: 500,
    warnThresholdPercent: 80,
    ...overrides,
  };
}

function renderDialog(profile: SocialProfile = buildProfile()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  // Seed the profiles query so the dialog prefills.
  queryClient.setQueryData(['profiles'], [profile]);
  const onOpenChange = vi.fn();
  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={queryClient}>
        <EditProfileDialog
          profileId={PROFILE_ID}
          open
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>,
    ),
  };
}

describe('EditProfileDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('prefills displayName and notes from the profile', async () => {
    renderDialog();

    const displayNameInput = await screen.findByLabelText('Display name');
    expect(displayNameInput).toHaveValue('My LinkedIn');
    const notesTextarea = screen.getByLabelText('Notes in Markdown');
    expect(notesTextarea).toHaveValue('Existing notes content.');
  });

  it('enables Save changes when displayName is edited', async () => {
    renderDialog();
    const user = userEvent.setup();

    const saveButton = await screen.findByRole('button', { name: /Save changes/ });
    expect(saveButton).toBeDisabled();

    const input = screen.getByLabelText('Display name');
    await user.clear(input);
    await user.type(input, 'New name');

    await waitFor(() => expect(saveButton).not.toBeDisabled());
  });

  it('sanitizes <script> out of the Markdown preview', async () => {
    renderDialog(buildProfile({ notes: '# Hello\n<script>alert(1)</script>' }));
    const user = userEvent.setup();

    await screen.findByDisplayValue(/Hello/);

    // Click the Preview tab.
    await user.click(screen.getByRole('tab', { name: 'Preview' }));

    const preview = screen.getByTestId('notes-preview');
    // Heading should render.
    expect(within(preview).getByText('Hello')).toBeInTheDocument();
    // No <script> element should exist anywhere in the preview.
    expect(preview.querySelector('script')).toBeNull();
    // The text "alert(1)" may still render as plain text (sanitizer leaves
    // text nodes) but it must NOT be inside a <script> tag.
  });

  it('renders empty-preview state when notes is empty', async () => {
    renderDialog(buildProfile({ notes: '' }));
    const user = userEvent.setup();

    await screen.findByLabelText('Display name');
    await user.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument();
  });

  it('shows a warning-color counter at 4500 characters', async () => {
    const longNotes = 'a'.repeat(4500);
    renderDialog(buildProfile({ notes: longNotes }));

    await screen.findByLabelText('Display name');
    const counter = screen.getByText(/4500 \/ 5000/);
    expect(counter).toHaveClass('text-warning');
  });

  it('shows a destructive counter at 5000 characters and stops accepting more input', async () => {
    const maxNotes = 'a'.repeat(5000);
    renderDialog(buildProfile({ notes: maxNotes }));

    await screen.findByLabelText('Display name');
    const counter = screen.getByText(/5000 \/ 5000 — limit reached/);
    expect(counter.className).toContain('text-destructive');

    // The textarea has maxLength=5000 as a hard cap.
    const textarea = screen.getByLabelText('Notes in Markdown') as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(5000);
  });

  it('submits via PATCH and closes the dialog on success', async () => {
    const patchSpy = vi
      .spyOn(apiClient, 'patch')
      .mockResolvedValue(buildProfile({ displayName: 'Updated' }));
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const input = await screen.findByLabelText('Display name');
    await user.clear(input);
    await user.type(input, 'Updated');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        `/api/profiles/${PROFILE_ID}`,
        expect.objectContaining({ displayName: 'Updated' }),
      );
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('Discard changes closes the dialog without a PATCH call', async () => {
    const patchSpy = vi.spyOn(apiClient, 'patch');
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await screen.findByLabelText('Display name');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(patchSpy).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
