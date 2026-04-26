import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenHealthBadge } from '../TokenHealthBadge';

// Fixed "now" helper: we can't easily stub Date.now inside date-fns, so use
// real relative offsets. All relative-time assertions live in tooltip content
// and allow partial matches.
function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

describe('TokenHealthBadge', () => {
  it('renders Active label when status is active', () => {
    render(
      <TokenHealthBadge
        status="active"
        expiresAt={null}
        checkedAt={null}
        failureReason={null}
        platform="twitter"
      />,
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders "Expires in Nd" label when status is expiring with 5 days out', () => {
    render(
      <TokenHealthBadge
        status="expiring"
        expiresAt={daysFromNow(5)}
        checkedAt={null}
        failureReason={null}
        platform="linkedin"
      />,
    );

    expect(screen.getByText(/Expires in/)).toBeInTheDocument();
  });

  it('renders Needs re-authentication label when status is needs_reauth', () => {
    render(
      <TokenHealthBadge
        status="needs_reauth"
        expiresAt={null}
        checkedAt={null}
        failureReason={null}
        platform="twitter"
      />,
    );

    expect(screen.getByText('Needs re-authentication')).toBeInTheDocument();
  });

  it('emits Twitter-specific reauth copy via aria-description', () => {
    render(
      <TokenHealthBadge
        status="needs_reauth"
        expiresAt={null}
        checkedAt={null}
        failureReason={null}
        platform="twitter"
      />,
    );

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-description')).toContain(
      'Token rejected by Twitter (401). Reconnect to keep posting.',
    );
  });

  it('emits LinkedIn refresh-failure reauth copy via aria-description', () => {
    render(
      <TokenHealthBadge
        status="needs_reauth"
        expiresAt={null}
        checkedAt={null}
        failureReason={null}
        platform="linkedin"
      />,
    );

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-description')).toContain(
      'Refresh failed after 4 attempts. Reconnect to keep posting.',
    );
  });

  it('emits Facebook reauth copy via aria-description', () => {
    render(
      <TokenHealthBadge
        status="needs_reauth"
        expiresAt={null}
        checkedAt={null}
        failureReason={null}
        platform="facebook"
      />,
    );

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-description')).toContain(
      'Facebook rejected the token. Reconnect to keep posting.',
    );
  });

  it('applies role="status" to the wrapper for screen-reader access', () => {
    render(
      <TokenHealthBadge
        status="active"
        expiresAt={null}
        checkedAt={null}
        failureReason={null}
        platform="twitter"
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('badge is keyboard-focusable so the tooltip opens on Tab focus', () => {
    // Regression: the trigger span had no tabIndex, so keyboard users
    // couldn't reach it and the tooltip never opened on focus.
    render(
      <TokenHealthBadge
        status="active"
        expiresAt={null}
        checkedAt={null}
        failureReason={null}
        platform="twitter"
      />,
    );

    const badge = screen.getByRole('status');
    expect(badge.getAttribute('tabindex')).toBe('0');
  });

  it('label conveys status via text, not color alone', () => {
    // The visible label text must stand on its own for screen readers.
    render(
      <TokenHealthBadge
        status="needs_reauth"
        expiresAt={null}
        checkedAt={null}
        failureReason={null}
        platform="twitter"
      />,
    );

    const label = screen.getByText('Needs re-authentication');
    expect(label.textContent).toBe('Needs re-authentication');
  });
});
