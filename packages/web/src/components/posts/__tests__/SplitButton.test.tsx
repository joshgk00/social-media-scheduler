import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SplitButton } from '../SplitButton';

describe('SplitButton', () => {
  it('renders a custom primary action label', () => {
    render(
      <SplitButton
        onPrimary={vi.fn()}
        onDraft={vi.fn()}
        primaryLabel="Update Queued Post"
        isLoading={false}
        disabled={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Update Queued Post' })).toBeInTheDocument();
  });
});
