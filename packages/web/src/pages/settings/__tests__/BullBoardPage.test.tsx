import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import BullBoardPage from '../BullBoardPage';

describe('BullBoardPage', () => {
  it('frames the Bull Board mount with breadcrumb, queue cards, and new-tab links', () => {
    render(
      <MemoryRouter>
        <BullBoardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Worker queue inspector' })).toBeInTheDocument();
    expect(screen.getByText('Background-job admin powered by Bull Board (BullMQ).')).toBeInTheDocument();

    for (const queue of ['publish', 'notification', 'bulk-ops']) {
      expect(screen.getByText(queue)).toBeInTheDocument();
    }

    expect(screen.getByTitle('Embedded Bull Board')).toHaveAttribute('src', '/admin/queues');
    expect(screen.getAllByRole('link', { name: /open in new tab/i })).toHaveLength(2);
  });
});
