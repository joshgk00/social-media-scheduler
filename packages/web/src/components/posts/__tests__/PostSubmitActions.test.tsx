import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  INVALID_POST_LINK_URL_MESSAGE,
  PostSubmitActions,
  getPostSubmitDisabledReason,
} from '../PostSubmitActions';

describe('getPostSubmitDisabledReason', () => {
  it('prioritizes blocking media before Facebook link validation', () => {
    expect(
      getPostSubmitDisabledReason({
        hasTranscodingMedia: true,
        hasFailedMedia: false,
        platform: 'facebook',
        linkUrl: 'not-a-url',
      }),
    ).toBe('Video is still transcoding.');

    expect(
      getPostSubmitDisabledReason({
        hasTranscodingMedia: false,
        hasFailedMedia: true,
        platform: 'facebook',
        linkUrl: 'not-a-url',
      }),
    ).toBe('Fix or remove failed media before submitting.');

    expect(
      getPostSubmitDisabledReason({
        hasTranscodingMedia: false,
        hasFailedMedia: false,
        platform: 'facebook',
        linkUrl: 'not-a-url',
      }),
    ).toBe(INVALID_POST_LINK_URL_MESSAGE);
  });
});

describe('PostSubmitActions', () => {
  it('wraps disabled submit actions with an accessible disabled reason', () => {
    render(
      <PostSubmitActions
        mode="queue"
        onSubmit={vi.fn()}
        isSaving={false}
        disabled={false}
        disabledReason="Video is still transcoding."
      />,
    );

    expect(screen.getByRole('button', { name: 'Save to Queue' })).toBeDisabled();
    expect(screen.getByText('Video is still transcoding.')).toBeInTheDocument();
  });

  it('uses a unique disabled reason id for each rendered action group', () => {
    render(
      <>
        <PostSubmitActions
          mode="queue"
          onSubmit={vi.fn()}
          isSaving={false}
          disabled={false}
          disabledReason="Video is still transcoding."
        />
        <PostSubmitActions
          mode="queue"
          onSubmit={vi.fn()}
          isSaving={false}
          disabled={false}
          disabledReason="Video is still transcoding."
        />
      </>,
    );

    const describedByIds = screen
      .getAllByRole('button', { name: 'Save to Queue' })
      .map((button) => button.closest('[aria-describedby]')?.getAttribute('aria-describedby'));

    expect(describedByIds).toHaveLength(2);
    expect(new Set(describedByIds).size).toBe(2);
    describedByIds.forEach((id) => {
      expect(id).toBeTruthy();
      expect(document.getElementById(id as string)).toHaveTextContent('Video is still transcoding.');
    });
  });

  it('renders split actions enabled when there is no disabled reason', async () => {
    const user = userEvent.setup();
    const onDraft = vi.fn();
    const onPrimary = vi.fn();
    render(
      <PostSubmitActions
        mode="split"
        onPrimary={onPrimary}
        onDraft={onDraft}
        primaryLabel="Update Queued Post"
        isLoading={false}
        disabled={false}
        disabledReason={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Update Queued Post' }));
    expect(onPrimary).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(await screen.findByText('Save as Draft'));
    expect(onDraft).toHaveBeenCalledOnce();
    expect(document.querySelector('#submit-disabled-reason')).toBeNull();
  });

  it('does not render tooltip plumbing without a disabled reason', () => {
    render(
      <PostSubmitActions
        mode="queue"
        onSubmit={vi.fn()}
        isSaving={false}
        disabled={false}
        disabledReason={null}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save to Queue' })).toBeEnabled();
    expect(document.querySelector('#submit-disabled-reason')).toBeNull();
  });
});
