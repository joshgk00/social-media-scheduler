import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { EmailLogsPage } from '../EmailLogsPage';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

describe('EmailLogsPage', () => {
  it('renders title, table columns, status filters, and empty state', () => {
    render(<EmailLogsPage rows={[]} />);

    expect(screen.getByRole('heading', { name: 'Email logs' })).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Event type')).toBeInTheDocument();
    expect(screen.getByText('Recipient')).toBeInTheDocument();
    expect(screen.getByText('Subject')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sent' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Failed' })).toBeInTheDocument();
    expect(screen.getByText('No emails yet')).toBeInTheDocument();
  });

  it('expands failed rows to show the error message and keeps sent rows quiet', () => {
    render(<EmailLogsPage rows={[{
      id: 'email-1',
      eventType: 'publish_failed',
      recipientEmail: 'recipient@example.com',
      subject: '[SMS] Publish failed',
      status: 'failed',
      errorMessage: 'SMTP rejected the message',
      sentAt: '2026-04-28T12:00:00.000Z',
    }]} />);

    fireEvent.click(screen.getByRole('button', { name: /expand/i }));

    expect(screen.getByText('SMTP rejected the message')).toBeInTheDocument();
  });

  it('debounces recipient search input', () => {
    const onFilter = vi.fn();

    render(<EmailLogsPage rows={[]} onFilter={onFilter} />);
    fireEvent.change(screen.getByRole('searchbox', { name: /recipient/i }), {
      target: { value: 'example.com' },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onFilter).toHaveBeenCalledWith(expect.objectContaining({ recipient: 'example.com' }));
  });
});
