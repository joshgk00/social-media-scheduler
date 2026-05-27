import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SnippetsSection } from '../components/SnippetsSection';

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const deleteSnippet = vi.fn();
const createSnippet = vi.fn();
const updateSnippet = vi.fn();

vi.mock('../../../hooks/use-snippets', () => ({
  useSnippets: () => ({
    isLoading: false,
    data: [
      {
        id: 'snippet-1',
        userId: 'user-1',
        name: 'Launch CTA',
        category: 'text',
        body: 'Book a demo before Friday.',
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:00.000Z',
      },
    ],
  }),
  useDeleteSnippet: () => ({ mutateAsync: deleteSnippet, isPending: false }),
  useCreateSnippet: () => ({ mutateAsync: createSnippet, isPending: false, reset: vi.fn() }),
  useUpdateSnippet: () => ({ mutateAsync: updateSnippet, isPending: false, reset: vi.fn() }),
}));

describe('SnippetsSection', () => {
  it('opens the edit modal when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<SnippetsSection />);

    await user.click(screen.getByText('Launch CTA'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Update snippet' })).toBeInTheDocument();
  });
});
