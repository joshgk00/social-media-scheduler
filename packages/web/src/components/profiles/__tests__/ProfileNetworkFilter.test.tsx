import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileNetworkFilter } from '../ProfileNetworkFilter';

describe('ProfileNetworkFilter', () => {
  it('renders 4 chips in order All → Twitter → LinkedIn → Facebook', () => {
    render(<ProfileNetworkFilter value="all" onChange={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveTextContent('All');
    expect(buttons[1]).toHaveTextContent('Twitter');
    expect(buttons[2]).toHaveTextContent('LinkedIn');
    expect(buttons[3]).toHaveTextContent('Facebook');
  });

  it('sets aria-pressed="true" on the active chip', () => {
    render(<ProfileNetworkFilter value="twitter" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^All$/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /Twitter/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('calls onChange with the chip value when clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ProfileNetworkFilter value="all" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /LinkedIn/ }));
    expect(onChange).toHaveBeenCalledWith('linkedin');

    await user.click(screen.getByRole('button', { name: /Facebook/ }));
    expect(onChange).toHaveBeenCalledWith('facebook');

    await user.click(screen.getByRole('button', { name: /^All$/ }));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('tab order walks through the chips All → Twitter → LinkedIn → Facebook', async () => {
    const user = userEvent.setup();
    render(<ProfileNetworkFilter value="all" onChange={vi.fn()} />);

    await user.tab();
    expect(screen.getByRole('button', { name: /^All$/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Twitter/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /LinkedIn/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Facebook/ })).toHaveFocus();
  });
});
