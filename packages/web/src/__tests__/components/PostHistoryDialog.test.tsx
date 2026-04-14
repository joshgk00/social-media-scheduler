import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PostHistoryResponse } from '@sms/shared';
import { PostHistoryDialog } from '../../components/posts/PostHistoryDialog';
import { apiClient } from '../../lib/api-client';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function buildAttempt(overrides: Partial<PostHistoryResponse['cycles'][number][number]> = {}): PostHistoryResponse['cycles'][number][number] {
  return {
    id: crypto.randomUUID(),
    postId: '11111111-1111-1111-1111-111111111111',
    attemptNum: 1,
    startedAt: '2026-04-01T10:00:00.000Z',
    finishedAt: '2026-04-01T10:00:05.000Z',
    outcome: 'success',
    httpStatus: 200,
    errorCode: null,
    errorMessage: null,
    platformPostId: 'tweet-123',
    ...overrides,
  };
}

describe('PostHistoryDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders empty state when cycles is empty', async () => {
    vi.spyOn(apiClient, 'getPostHistory').mockResolvedValue({
      postId: '11111111-1111-1111-1111-111111111111',
      cycles: [],
    } as PostHistoryResponse);

    renderWithClient(
      <PostHistoryDialog
        postId="11111111-1111-1111-1111-111111111111"
        onOpenChange={() => {}}
      />,
    );

    await screen.findByText('No publish attempts yet');
    expect(
      screen.getByText('This post has not been picked up by the worker yet.'),
    ).toBeInTheDocument();
  });

  it('renders a single cycle with two attempts and surfaces the error message', async () => {
    const history: PostHistoryResponse = {
      postId: '11111111-1111-1111-1111-111111111111',
      cycles: [
        [
          buildAttempt({
            attemptNum: 1,
            outcome: 'transient_fail',
            httpStatus: 503,
            errorMessage: 'Temporary upstream failure',
          }),
          buildAttempt({
            attemptNum: 2,
            outcome: 'success',
            httpStatus: 200,
          }),
        ],
      ],
    };
    vi.spyOn(apiClient, 'getPostHistory').mockResolvedValue(history);

    renderWithClient(
      <PostHistoryDialog
        postId="11111111-1111-1111-1111-111111111111"
        onOpenChange={() => {}}
      />,
    );

    await screen.findByText('Retry cycle 1');
    expect(screen.getByText('Transient failure — will retry')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Temporary upstream failure')).toBeInTheDocument();
    expect(screen.getByText('HTTP 503')).toBeInTheDocument();
    expect(screen.getByText('HTTP 200')).toBeInTheDocument();
  });

  it('renders multiple cycles with the first expanded by default', async () => {
    const history: PostHistoryResponse = {
      postId: '11111111-1111-1111-1111-111111111111',
      cycles: [
        [buildAttempt({ outcome: 'permanent_fail', errorMessage: 'First cycle failure' })],
        [buildAttempt({ outcome: 'success' })],
      ],
    };
    vi.spyOn(apiClient, 'getPostHistory').mockResolvedValue(history);

    renderWithClient(
      <PostHistoryDialog
        postId="11111111-1111-1111-1111-111111111111"
        onOpenChange={() => {}}
      />,
    );

    await screen.findByText('Retry cycle 1');
    expect(screen.getByText('Retry cycle 2')).toBeInTheDocument();

    const firstTrigger = screen.getByRole('button', { name: /Retry cycle 1/ });
    expect(firstTrigger).toHaveAttribute('aria-expanded', 'true');

    const secondTrigger = screen.getByRole('button', { name: /Retry cycle 2/ });
    expect(secondTrigger).toHaveAttribute('aria-expanded', 'false');

    // First cycle error surfaces (it's expanded); second cycle content hidden.
    expect(screen.getByText('First cycle failure')).toBeInTheDocument();
  });

  it('fires onOpenChange(false) when the Close button is clicked', async () => {
    vi.spyOn(apiClient, 'getPostHistory').mockResolvedValue({
      postId: '11111111-1111-1111-1111-111111111111',
      cycles: [],
    } as PostHistoryResponse);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderWithClient(
      <PostHistoryDialog
        postId="11111111-1111-1111-1111-111111111111"
        onOpenChange={onOpenChange}
      />,
    );

    await screen.findByText('No publish attempts yet');
    // Dialog has a built-in icon close button and our footer Close button.
    // Click the footer button — the one whose full accessible name is exactly 'Close' (not 'Close ').
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    const footerCloseButton = closeButtons.find((button) => !button.classList.contains('absolute'));
    expect(footerCloseButton).toBeTruthy();
    await user.click(footerCloseButton!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders outcome icons and labels for success, transient_fail, permanent_fail, and cancelled', async () => {
    const history: PostHistoryResponse = {
      postId: '11111111-1111-1111-1111-111111111111',
      cycles: [
        [
          buildAttempt({ outcome: 'success' }),
          buildAttempt({ outcome: 'transient_fail' }),
          buildAttempt({ outcome: 'permanent_fail' }),
          buildAttempt({ outcome: 'cancelled' }),
        ],
      ],
    };
    vi.spyOn(apiClient, 'getPostHistory').mockResolvedValue(history);

    renderWithClient(
      <PostHistoryDialog
        postId="11111111-1111-1111-1111-111111111111"
        onOpenChange={() => {}}
      />,
    );

    await screen.findByText('Success');
    expect(screen.getByText('Transient failure — will retry')).toBeInTheDocument();
    expect(screen.getByText('Permanent failure')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();

    // Four outcome rows should each render a matching outcome icon (svg marked aria-hidden).
    // Radix portals the dialog into document.body, so query from the body root.
    const outcomeIcons = document.body.querySelectorAll('svg[aria-hidden="true"]');
    expect(outcomeIcons.length).toBeGreaterThanOrEqual(4);
  });
});
