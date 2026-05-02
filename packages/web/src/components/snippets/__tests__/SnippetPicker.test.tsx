import { useRef, useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { Snippet } from '../../../hooks/use-snippets';
import { SnippetPicker } from '../SnippetPicker';

function buildSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 'snippet-1',
    userId: 'user-1',
    name: 'tags',
    category: 'text',
    body: '#x #y',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function PickerHarness({ initialValue = 'Hello  world', snippets = [buildSnippet()] }: { initialValue?: string; snippets?: Snippet[] }) {
  const [value, setValue] = useState(initialValue);
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  }));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  queryClient.setQueryData(['snippets'], snippets);

  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <div className="space-y-4">
          <textarea
            aria-label="Post text"
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <SnippetPicker textareaRef={textareaRef} onInsert={setValue} />
          <output aria-label="Current value">{value}</output>
        </div>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('SnippetPicker', () => {
  it('inserts snippet text at the captured cursor position', async () => {
    render(<PickerHarness />);
    const user = userEvent.setup();

    const textarea = screen.getByLabelText('Post text') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(6, 6);

    await user.click(screen.getByRole('button', { name: 'Insert snippet' }));
    await user.click(await screen.findByText('tags'));

    await waitFor(() => {
      expect(screen.getByLabelText('Current value')).toHaveTextContent('Hello #x #y world');
    });
  });

  it('replaces the selected range instead of overwriting unrelated text', async () => {
    render(<PickerHarness initialValue="Hello FOO world" snippets={[buildSnippet({ body: 'BAR' })]} />);
    const user = userEvent.setup();

    const textarea = screen.getByLabelText('Post text') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(6, 9);

    await user.click(screen.getByRole('button', { name: 'Insert snippet' }));
    await user.click(await screen.findByText('tags'));

    await waitFor(() => {
      expect(screen.getByLabelText('Current value')).toHaveTextContent('Hello BAR world');
    });
  });

  it('shows the no-snippets-yet empty state when no snippets exist', async () => {
    render(<PickerHarness snippets={[]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Insert snippet' }));

    expect(
      await screen.findByText('No snippets yet. Create your first snippet to insert reusable text.'),
    ).toBeInTheDocument();
  });

  it('filters snippets by name substring', async () => {
    render(
      <PickerHarness
        snippets={[
          buildSnippet({ id: 'snippet-1', name: 'foo', body: 'FOO' }),
          buildSnippet({ id: 'snippet-2', name: 'bar', body: 'BAR' }),
        ]}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Insert snippet' }));
    await user.type(await screen.findByPlaceholderText('Search snippets...'), 'fo');

    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.queryByText('bar')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger button', async () => {
    render(<PickerHarness />);
    const user = userEvent.setup();

    const trigger = screen.getByRole('button', { name: 'Insert snippet' });
    await user.click(trigger);
    expect(await screen.findByPlaceholderText('Search snippets...')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search snippets...')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });
  });
});
