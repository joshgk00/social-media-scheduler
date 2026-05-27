import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectProfileDialog } from '../ConnectProfileDialog';

vi.mock('../../../hooks/use-profiles', () => ({
  useCreateProfile: () => ({
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
  }),
}));

describe('ConnectProfileDialog', () => {
  it('shows OAuth copy first and hides Twitter credentials', () => {
    render(<ConnectProfileDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByText('One-click OAuth')).toBeInTheDocument();
    expect(screen.getByText(/pick a Personal Profile or Company Page/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Consumer Key/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Access Token Secret/i)).not.toBeInTheDocument();
  });

  it('only renders credential fields on the Twitter tab', async () => {
    render(<ConnectProfileDialog open onOpenChange={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /Twitter \/ X/i }));

    expect(screen.getByText('Developer App credentials required')).toBeInTheDocument();
    expect(screen.getByLabelText(/Consumer Key/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Consumer Secret/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Access Token$/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Access Token Secret/i, { selector: 'input' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /LinkedIn/i }));

    expect(screen.getByText('One-click OAuth')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Consumer Key/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Access Token Secret/i)).not.toBeInTheDocument();
  });
});
