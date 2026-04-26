// Wave 0 RED stub for the LinkedIn VisibilitySelector (POST-LI-03).
// Plan 05a ships `<VisibilitySelector value onValueChange />`.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisibilitySelector } from '../components/posts/VisibilitySelector';

describe('<VisibilitySelector />', () => {
  it('renders both visibility options with UI-SPEC copy (POST-LI-03)', () => {
    render(<VisibilitySelector value="PUBLIC" onValueChange={vi.fn()} />);
    expect(screen.getByText(/Anyone on LinkedIn/i)).toBeInTheDocument();
    expect(screen.getByText(/Connections only/i)).toBeInTheDocument();
  });

  it('fires onValueChange("CONNECTIONS") when the second option is clicked', async () => {
    const onValueChange = vi.fn();
    render(<VisibilitySelector value="PUBLIC" onValueChange={onValueChange} />);
    await userEvent.click(screen.getByLabelText(/Connections only/i));
    expect(onValueChange).toHaveBeenCalledWith('CONNECTIONS');
  });

  it('supports keyboard arrow navigation between options (a11y)', async () => {
    const onValueChange = vi.fn();
    render(<VisibilitySelector value="PUBLIC" onValueChange={onValueChange} />);
    const firstOption = screen.getByLabelText(/Anyone on LinkedIn/i);
    firstOption.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onValueChange).toHaveBeenCalledWith('CONNECTIONS');
  });
});
