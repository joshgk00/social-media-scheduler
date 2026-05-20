import { createRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { SharedPostFields } from '../SharedPostFields';
import type { Platform } from '../../../hooks/use-profiles';

vi.mock('../../../hooks/use-tags', () => ({
  useTags: () => ({ data: [] }),
}));

vi.mock('../../../hooks/use-posts', () => ({
  useCheckConflicts: () => ({ data: [] }),
}));

function renderSharedPostFields(platform: Platform = 'twitter') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const textareaRef = createRef<HTMLTextAreaElement>();

  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SharedPostFields
          mode="queue"
          platform={platform}
          userTimezone="UTC"
          effectiveProfileId="profile-1"
          scheduledAt={null}
          onScheduledAtChange={vi.fn()}
          tagIds={[]}
          onTagIdsChange={vi.fn()}
          onOpenTagManagement={vi.fn()}
          notes=""
          onNotesChange={vi.fn()}
          hasSpinnableText={false}
          onHasSpinnableTextChange={vi.fn()}
          autoDestructAfter={null}
          onAutoDestructAfterChange={vi.fn()}
          textareaRef={textareaRef}
          onInsertSnippet={vi.fn()}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
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

describe('SharedPostFields', () => {
  it('renders Insert snippet and inserts at the captured cursor position', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    queryClient.setQueryData(['snippets'], [
      {
        id: 'snippet-1',
        userId: 'user-1',
        name: 'tag',
        category: 'text',
        body: '#tag',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ]);

    const textareaRef = createRef<HTMLTextAreaElement>();
    const onInsertSnippet = vi.fn();

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <div className="space-y-4">
            <textarea ref={textareaRef} defaultValue="Pre  Post" aria-label="Composer textarea" />
            <SharedPostFields
              mode="queue"
              platform="twitter"
              userTimezone="UTC"
              effectiveProfileId="profile-1"
              scheduledAt={null}
              onScheduledAtChange={vi.fn()}
              tagIds={[]}
              onTagIdsChange={vi.fn()}
              onOpenTagManagement={vi.fn()}
              notes=""
              onNotesChange={vi.fn()}
              hasSpinnableText={false}
              onHasSpinnableTextChange={vi.fn()}
              autoDestructAfter={null}
              onAutoDestructAfterChange={vi.fn()}
              textareaRef={textareaRef}
              onInsertSnippet={onInsertSnippet}
            />
          </div>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const textarea = screen.getByLabelText('Composer textarea') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(4, 4);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Insert snippet' }));
    await user.click(await screen.findByText('tag'));

    expect(onInsertSnippet).toHaveBeenCalledWith('Pre #tag Post');
  });

  it('renders auto-destruct controls for Twitter posts', () => {
    renderSharedPostFields('twitter');

    expect(screen.getByText('Auto-destruct')).toBeInTheDocument();
    expect(screen.getByText(/Automatically delete this post from Twitter\/X/)).toBeInTheDocument();
  });

  it('hides auto-destruct controls for LinkedIn and Facebook posts', () => {
    renderSharedPostFields('linkedin');

    expect(screen.queryByText('Auto-destruct')).not.toBeInTheDocument();
    expect(screen.queryByText(/Automatically delete this post from Twitter\/X/)).not.toBeInTheDocument();

    renderSharedPostFields('facebook');

    expect(screen.queryByText('Auto-destruct')).not.toBeInTheDocument();
    expect(screen.queryByText(/Automatically delete this post from Twitter\/X/)).not.toBeInTheDocument();
  });
});
