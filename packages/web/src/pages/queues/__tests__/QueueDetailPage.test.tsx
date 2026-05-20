import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import QueueDetailPage from '../QueueDetailPage';

const navigate = vi.fn();
const createQueueMutate = vi.fn();
const updateQueueMutate = vi.fn();

vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({}),
    useLocation: () => ({ state: null }),
  };
});

vi.mock('../../../hooks/use-profiles', () => ({
  useProfiles: () => ({
    data: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        displayName: 'Test Profile',
        handle: 'testprofile',
      },
    ],
  }),
}));

vi.mock('../../../hooks/use-queues', () => ({
  useQueue: () => ({ data: undefined, isLoading: false }),
  useCreateQueue: () => ({ mutate: createQueueMutate, isPending: false }),
  useUpdateQueue: () => ({ mutate: updateQueueMutate, isPending: false }),
}));

vi.mock('../../../components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      aria-label="Social profile"
      value={value ?? ''}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <option value="">{placeholder}</option>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <QueueDetailPage />
    </MemoryRouter>,
  );
}

describe('QueueDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  it('shows API validation failures inline beside the submit action', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Queue name'), 'CMW Promotions');
    await user.selectOptions(
      screen.getAllByRole('combobox')[0],
      '00000000-0000-4000-8000-000000000001',
    );
    await user.type(screen.getByLabelText(/Start date/i), '2026-05-21');
    await user.click(screen.getByRole('button', { name: 'Create Queue' }));

    expect(createQueueMutate).toHaveBeenCalled();
    const [, options] = createQueueMutate.mock.calls[0];
    await act(async () => {
      options.onError(
        Object.assign(new Error('Validation failed'), {
          status: 400,
          body: {
            error: 'Validation failed',
            details: [
              {
                path: ['startDate'],
                message: 'Invalid datetime',
              },
            ],
          },
        }),
      );
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Start date: Invalid datetime',
    );
  });
});
