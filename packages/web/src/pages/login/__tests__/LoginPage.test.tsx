import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import LoginPage from '../LoginPage';

const mocks = vi.hoisted(() => ({
  loginMutateAsync: vi.fn(),
  verify2FAMutateAsync: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useLogin: () => ({
    mutateAsync: mocks.loginMutateAsync,
    isPending: false,
  }),
  useVerify2FA: () => ({
    mutateAsync: mocks.verify2FAMutateAsync,
    isPending: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

function renderPage() {
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

async function submitCredentials() {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'user@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'password' },
  });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  });

  expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
}

describe('LoginPage TOTP countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.loginMutateAsync.mockResolvedValue({ requiresTwoFactor: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('starts a fresh countdown after a previous TOTP challenge expires', async () => {
    renderPage();

    await submitCredentials();
    expect(screen.getByText('Code expires in 5:00')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(300_000);
    });

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();

    await submitCredentials();
    expect(screen.getByText('Code expires in 5:00')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
    expect(screen.getByText('Code expires in 4:59')).toBeInTheDocument();
  });
});
