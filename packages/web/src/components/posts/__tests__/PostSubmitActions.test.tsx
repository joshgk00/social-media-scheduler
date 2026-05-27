import { render, screen } from '@testing-library/react';
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
});
