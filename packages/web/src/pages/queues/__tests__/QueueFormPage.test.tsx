import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import QueueFormPage from '../QueueFormPage';

const navigate = vi.fn();
const createQueueMutate = vi.fn();
const updateQueueMutate = vi.fn();
let routerLocationState: unknown = null;

vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({}),
    useLocation: () => ({ state: routerLocationState }),
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

vi.mock('../../../hooks/use-auth', () => ({
  useAuth: () => ({ data: { timezone: 'America/Detroit' } }),
}));

function getSelectLabel(children: React.ReactNode): string {
  let label: string | undefined;

  React.Children.forEach(children, (child) => {
    if (label || !React.isValidElement(child)) return;

    const props = child.props as {
      placeholder?: unknown;
      children?: React.ReactNode;
    };

    if (typeof props.placeholder === 'string') {
      label = props.placeholder;
      return;
    }

    if (props.children) {
      label = getSelectLabel(props.children);
    }
  });

  return label ?? 'Select option';
}

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
      aria-label={getSelectLabel(children)}
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
      <QueueFormPage />
    </MemoryRouter>,
  );
}

describe('QueueFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerLocationState = null;
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
      screen.getByRole('combobox', { name: 'Select a profile' }),
      '00000000-0000-4000-8000-000000000001',
    );
    await user.type(screen.getByLabelText(/Start date/i), '2026-05-21');
    await user.click(screen.getByRole('button', { name: 'Create Queue' }));

    expect(createQueueMutate).toHaveBeenCalled();
    const [payload] = createQueueMutate.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({
      scheduleMode: 'specific',
      intervalType: 'fixed',
      intervalValue: 1,
      intervalUnit: 'hours',
      hourSlots: [8, 12, 15],
    }));
    expect(payload).not.toHaveProperty('specificTimes');
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

  it('rejects manually typed non-hour publish times before saving', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Queue name'), 'CMW Promotions');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Select a profile' }),
      '00000000-0000-4000-8000-000000000001',
    );
    await user.clear(screen.getByLabelText('Publish time 1'));
    await user.type(screen.getByLabelText('Publish time 1'), '10:30');
    await user.click(screen.getByRole('button', { name: 'Create Queue' }));

    expect(createQueueMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Use whole-hour publish times.')).toBeInTheDocument();
  });

  it('does not block specific-time queues when hidden hour windows are empty', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Queue name'), 'CMW Promotions');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Select a profile' }),
      '00000000-0000-4000-8000-000000000001',
    );
    await user.click(screen.getByRole('radio', { name: /Fixed interval/ }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('radio', { name: /Specific times/ }));
    await user.click(screen.getByRole('button', { name: 'Create Queue' }));

    expect(createQueueMutate).toHaveBeenCalled();
    const [payload] = createQueueMutate.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({
      scheduleMode: 'specific',
      hourSlots: [8, 12, 15],
    }));
  });

  it('prefills copied queue configuration including basics and notes', () => {
    routerLocationState = {
      copiedConfig: {
        name: 'Copied queue',
        profileId: '00000000-0000-4000-8000-000000000001',
        scheduleMode: 'specific',
        intervalType: 'fixed',
        intervalValue: 1,
        intervalUnit: 'hours',
        daysOfWeek: [1, 2, 3],
        hourSlots: [9, 14],
        startDate: '2026-05-22',
        seasonalStart: null,
        seasonalEnd: null,
        seasonalRepeat: false,
        isRecycling: true,
        notes: 'Keep evergreen posts moving.',
      },
    };

    renderPage();

    expect(screen.getByLabelText('Queue name')).toHaveValue('Copied queue');
    expect(screen.getByRole('combobox', { name: 'Select a profile' })).toHaveValue(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(screen.getByLabelText(/Start date/i)).toHaveValue('2026-05-22');
    expect(screen.getByLabelText('Publish time 1')).toHaveValue('09:00');
    expect(screen.getByLabelText('Publish time 2')).toHaveValue('14:00');
    expect(screen.getByPlaceholderText('Optional notes about this queue (not published)')).toHaveValue(
      'Keep evergreen posts moving.',
    );
  });
});
